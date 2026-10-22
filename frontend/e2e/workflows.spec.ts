import { readFile } from "node:fs/promises";
import { expect, test, type Download } from "@playwright/test";

async function readPdf(download: Download) {
  const file = await download.path();
  if (!file) throw new Error("PDF download did not produce a file.");
  const data = await readFile(file);
  expect(data.subarray(0, 5).toString()).toBe("%PDF-");
  expect(data.length).toBeGreaterThan(2000);
  return data.toString("latin1");
}

test("coach can draw, save, reuse, export, and remove a drill", async ({
  page,
  request,
}, testInfo) => {
  const title = `E2E edgework ${Date.now()}`;
  const practiceTitle = `E2E practice ${Date.now()}`;
  let drillId = "";
  let trainingId = "";
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto("/drills/new");
    await expect(
      page.getByRole("button", { name: "Save drill", exact: true }),
    ).toBeEnabled();
    await page.getByLabel("Drill title", { exact: true }).fill(title);
    await page
      .getByRole("textbox", { name: "Add tag", exact: true })
      .fill("Stick handling");
    await page
      .getByRole("textbox", { name: "Add tag", exact: true })
      .press("Enter");
    await page
      .getByLabel("Coaching notes")
      .fill("Keep your head up and finish with control.");

    const rink = page.getByRole("img", { name: /Interactive hockey rink/ });
    const bounds = await rink.boundingBox();
    if (!bounds) throw new Error("Editor rink was not rendered.");
    const equipment = ["Cone", "Goal", "Tire", "Player", "Puck"];
    for (const [index, name] of equipment.entries()) {
      await page.getByRole("button", { name, exact: true }).click();
      await rink.click({
        position: {
          x: bounds.width * (0.2 + index * 0.14),
          y: bounds.height * 0.3,
        },
      });
    }
    await expect(rink.locator("[data-id]")).toHaveCount(5);
    await page.getByRole("button", { name: "Undo diagram change" }).click();
    await expect(rink.locator("[data-id]")).toHaveCount(4);
    await page.getByRole("button", { name: "Redo diagram change" }).click();
    await expect(rink.locator("[data-id]")).toHaveCount(5);

    for (const [index, name] of ["Skate", "Pass", "Puck handling"].entries()) {
      await page.getByRole("button", { name, exact: true }).click();
      await rink.scrollIntoViewIfNeeded();
      const routeBounds = await rink.boundingBox();
      if (!routeBounds) throw new Error("Editor rink disappeared.");
      await page.mouse.move(
        routeBounds.x + routeBounds.width * 0.2,
        routeBounds.y + routeBounds.height * (0.5 + index * 0.14),
      );
      await page.mouse.down();
      await page.mouse.move(
        routeBounds.x + routeBounds.width * 0.75,
        routeBounds.y + routeBounds.height * (0.55 + index * 0.14),
        { steps: 14 },
      );
      await page.mouse.up();
    }
    await expect(rink.locator("[data-id]")).toHaveCount(8);
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/drills") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save drill", exact: true }).click();
    const created = await (await createResponse).json();
    drillId = created.id;
    expect(created.diagram.objects).toHaveLength(5);
    expect(created.diagram.paths).toHaveLength(3);
    await expect(page.locator(".save-status")).toHaveText("Saved");
    await page.screenshot({
      path: testInfo.outputPath("drill-editor.png"),
      fullPage: true,
    });

    await page.reload();
    await expect(page.getByLabel("Coaching notes")).toHaveValue(
      "Keep your head up and finish with control.",
    );
    await expect(rink.locator("[data-id]")).toHaveCount(8);
    const drillDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    const drillPdf = await readPdf(await drillDownload);
    expect(drillPdf).toContain("Keep your head up");

    await page
      .getByRole("link", { name: "Practices", exact: true })
      .first()
      .click();
    await page.getByRole("link", { name: /Create practice/i }).click();
    await page
      .getByLabel("Practice title", { exact: true })
      .fill(practiceTitle);
    await page
      .getByLabel("Practice notes", { exact: true })
      .fill("Warm up before the main sequence.");
    for (let index = 0; index < 2; index++) {
      await page.getByLabel("Drill to add to practice").selectOption(drillId);
      await page
        .getByRole("button", { name: "Add drill", exact: true })
        .click();
    }
    await page.getByRole("spinbutton").nth(1).fill("20");
    await page
      .getByLabel("Practice-specific notes")
      .nth(1)
      .fill("Second group starts here.");
    await page
      .getByRole("button", { name: `Move ${title} up`, exact: true })
      .nth(1)
      .click();
    await expect(page.getByRole("spinbutton").first()).toHaveValue("20");
    const trainingResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/trainings") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Save practice", exact: true })
      .click();
    trainingId = (await (await trainingResponse).json()).id;
    await expect(page.locator(".save-status")).toHaveText("Saved");
    const trainingDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    const trainingPdf = await readPdf(await trainingDownload);
    expect(trainingPdf).toContain("Warm up before");
    expect(
      (trainingPdf.match(/\/Type\s*\/Page\b/g) || []).length,
    ).toBeGreaterThanOrEqual(3);

    await page
      .getByRole("link", { name: "Drills", exact: true })
      .first()
      .click();
    await page.getByRole("link", { name: /Show all/ }).click();
    await page.getByLabel("Search drills").fill(title);
    await page.getByRole("link", { name: new RegExp(title) }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Delete drill", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("Remove this drill");
    expect(pageErrors).toEqual([]);
  } finally {
    if (trainingId)
      await request.delete(`http://127.0.0.1:5280/api/trainings/${trainingId}`);
    if (drillId)
      await request.delete(`http://127.0.0.1:5280/api/drills/${drillId}`);
  }
});

test("editor remains usable on a tablet and reports a failed API connection", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 1000 });
  await page.goto("/drills/new");
  await expect(
    page.getByRole("button", { name: "Save drill", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Drill title", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Interactive hockey rink/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("tablet-editor.png"),
    fullPage: true,
  });
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/problem+json",
      body: JSON.stringify({
        title: "API unavailable",
        detail: "The local API is offline.",
      }),
    }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "The local API is offline.",
  );
});

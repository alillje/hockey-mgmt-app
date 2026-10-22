import { expect, test, type Page } from "@playwright/test";

const apiBase = "http://127.0.0.1:5280/api";

async function addTag(page: Page, tag: string) {
  await page.getByRole("checkbox", { name: tag, exact: true }).check();
}

test("home, tag folders, show-all filters, and browser history work for both libraries", async ({
  page,
  request,
}, testInfo) => {
  const suffix = Date.now();
  const drillTitle = `Folder drill ${suffix}`;
  const practiceTitle = `Folder practice ${suffix}`;
  const alpha = "Skating";
  const beta = "Passing";
  let drillId = "";
  let practiceId = "";
  try {
    const drillResponse = await request.post(`${apiBase}/drills`, {
      data: {
        title: drillTitle,
        categoryId: "skating",
        tags: [alpha, beta],
        notes: "Find this by either folder.",
        diagram: { version: 1, objects: [], paths: [] },
      },
    });
    expect(drillResponse.ok()).toBe(true);
    drillId = (await drillResponse.json()).id;
    const practiceResponse = await request.post(`${apiBase}/trainings`, {
      data: {
        title: practiceTitle,
        tags: [alpha, beta],
        notes: "Tagged practice.",
        items: [{ drillId, durationMinutes: 15, notes: "" }],
      },
    });
    expect(practiceResponse.ok()).toBe(true);
    practiceId = (await practiceResponse.json()).id;

    await page.goto("/");
    const main = page.getByRole("main");
    for (const name of [
      "Create Practice",
      "Create Drill",
      "Practices",
      "Drills",
    ]) {
      await expect(
        main.getByRole("link", { name: new RegExp(`^${name}`) }),
      ).toBeVisible();
    }
    await page.screenshot({
      path: testInfo.outputPath("home.png"),
      fullPage: true,
    });
    await main.getByRole("link", { name: /^Drills/ }).click();
    await expect(page).toHaveURL(/\/drills$/);
    await page
      .getByRole("link", { name: `Open ${alpha} folder`, exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: new RegExp(drillTitle) }),
    ).toBeVisible();
    await page.goBack();
    await page
      .getByRole("link", { name: `Open ${beta} folder`, exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: new RegExp(drillTitle) }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: beta, exact: true }),
    ).toBeVisible();
    await page.goBack();
    await page.getByRole("link", { name: /Show all/ }).click();
    await page.getByLabel("Search drills").pressSequentially("Folder");
    await page.goBack();
    await expect(page).toHaveURL(/\/drills$/);
    await page.goForward();
    await expect(page.getByLabel("Search drills")).toHaveValue("Folder");
    await page.getByLabel("Search drills").fill(drillTitle);
    await page.getByLabel("Filter by tag").selectOption(alpha);
    await page.getByRole("link", { name: new RegExp(drillTitle) }).click();
    await expect(page.getByLabel("Drill title", { exact: true })).toHaveValue(
      drillTitle,
    );
    await page.goBack();
    await expect(page.getByLabel("Search drills")).toHaveValue(drillTitle);
    await expect(page.getByLabel("Filter by tag")).toHaveValue(alpha);
    await page.goForward();
    await page.reload();
    await expect(page.getByLabel("Drill title", { exact: true })).toHaveValue(
      drillTitle,
    );

    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Practices", exact: true })
      .click();
    await page
      .getByRole("link", { name: `Open ${alpha} folder`, exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: new RegExp(practiceTitle) }),
    ).toBeVisible();
    await page.goBack();
    await page
      .getByRole("link", { name: `Open ${beta} folder`, exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: new RegExp(practiceTitle) }),
    ).toBeVisible();
    await page.goBack();
    await page.getByRole("link", { name: /Show all/ }).click();
    await page.getByLabel("Search practices").fill(practiceTitle);
    await page.getByLabel("Filter by tag").selectOption(beta);
    await page.getByRole("link", { name: new RegExp(practiceTitle) }).click();
    await expect(
      page.getByLabel("Practice title", { exact: true }),
    ).toHaveValue(practiceTitle);
  } finally {
    if (practiceId) await request.delete(`${apiBase}/trainings/${practiceId}`);
    if (drillId) await request.delete(`${apiBase}/drills/${drillId}`);
  }
});

test("creating a drill inside an unsaved practice retains the draft through cancel, Back, refresh, and save", async ({
  page,
  request,
}) => {
  const suffix = Date.now();
  const title = `Nested practice ${suffix}`;
  const drillTitle = `Nested drill ${suffix}`;
  let drillId = "";
  let practiceId = "";
  const existingDrills = await (await request.get(`${apiBase}/drills`)).json();
  const existingDrill = existingDrills[0];
  expect(existingDrill).toBeTruthy();
  try {
    await page.goto("/");
    await page
      .getByRole("main")
      .getByRole("link", { name: /^Create Practice/ })
      .click();
    await page.getByLabel("Practice title", { exact: true }).fill(title);
    await page
      .getByLabel("Practice notes", { exact: true })
      .fill("Keep this practice draft intact.");
    await addTag(page, "Tactics");
    await page.getByLabel("Add a saved drill").selectOption(existingDrill.id);
    await page
      .getByRole("button", { name: "Add selected drill", exact: true })
      .click();
    await page.getByRole("spinbutton").fill("17");
    await page
      .getByLabel("Practice-specific notes")
      .fill("Retain groups and timing.");

    await page
      .getByRole("button", { name: "Draw a new drill", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cancel and return", exact: true })
      .click();
    await expect(
      page.getByLabel("Practice title", { exact: true }),
    ).toHaveValue(title);
    await expect(page.getByRole("spinbutton")).toHaveValue("17");

    await page
      .getByRole("button", { name: "Draw a new drill", exact: true })
      .click();
    await page
      .getByLabel("Drill title", { exact: true })
      .fill("Discard this nested drill");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.goBack();
    await expect(page.getByLabel("Drill title", { exact: true })).toHaveValue(
      "Discard this nested drill",
    );
    page.once("dialog", (dialog) => dialog.accept());
    await page.goBack();
    await expect(
      page.getByLabel("Practice title", { exact: true }),
    ).toHaveValue(title);
    await expect(page.getByLabel("Practice-specific notes")).toHaveValue(
      "Retain groups and timing.",
    );

    await page
      .getByRole("button", { name: "Draw a new drill", exact: true })
      .click();
    await page.getByLabel("Drill title", { exact: true }).fill(drillTitle);
    await addTag(page, "Passing");
    await addTag(page, "Shooting");
    await page
      .getByLabel("Coaching notes")
      .fill("New drill for this exact practice.");
    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    await expect(page.getByLabel("Drill title", { exact: true })).toHaveValue(
      drillTitle,
    );
    const createdResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/drills") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", {
        name: "Save drill and add to practice",
        exact: true,
      })
      .click();
    const drill = await (await createdResponse).json();
    drillId = drill.id;
    expect(drill.tags).toEqual(["Passing", "Shooting"]);
    await expect(
      page.getByLabel("Practice title", { exact: true }),
    ).toHaveValue(title);
    await expect(
      page.getByLabel("Practice notes", { exact: true }),
    ).toHaveValue("Keep this practice draft intact.");
    await expect(
      page.getByRole("checkbox", { name: "Tactics", exact: true }),
    ).toBeChecked();
    await expect(page.getByRole("spinbutton")).toHaveCount(2);
    await expect(page.getByRole("spinbutton").first()).toHaveValue("17");
    await expect(
      page.getByLabel("Practice-specific notes").first(),
    ).toHaveValue("Retain groups and timing.");
    await page.goBack();
    await expect(
      page.getByLabel("Practice title", { exact: true }),
    ).toHaveValue(title);
    await expect(page.getByRole("spinbutton")).toHaveCount(2);
    await page.goForward();
    await expect(
      page.getByLabel("Practice title", { exact: true }),
    ).toHaveValue(title);
    await expect(page.getByRole("spinbutton")).toHaveCount(2);
    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    await expect(page.getByRole("spinbutton")).toHaveCount(2);
    const saveResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/trainings") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Save practice", exact: true })
      .click();
    const practice = await (await saveResponse).json();
    practiceId = practice.id;
    expect(
      practice.items.map((item: { drillId: string }) => item.drillId),
    ).toEqual([existingDrill.id, drillId]);
    expect(practice.tags).toEqual(["Tactics"]);
    await page.reload();
    await expect(page.getByRole("spinbutton")).toHaveCount(2);
  } finally {
    if (practiceId) await request.delete(`${apiBase}/trainings/${practiceId}`);
    if (drillId) await request.delete(`${apiBase}/drills/${drillId}`);
  }
});

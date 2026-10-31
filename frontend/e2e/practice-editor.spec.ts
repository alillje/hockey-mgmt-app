import { expect, test } from "@playwright/test";

const apiBase = "http://127.0.0.1:5280/api";
const catalog = [
  "Skating",
  "Stick handling",
  "Passing",
  "Shooting",
  "Battling",
  "Tactics",
  "Warm-up",
  "Hockey School",
  "Other",
];

test("saved practice exposes drill creation, retains edits, and shows the new rink preview", async ({
  page,
  request,
}, testInfo) => {
  const suffix = Date.now();
  const title = `Saved practice ${suffix}`;
  const drillTitle = `Drawn inside practice ${suffix}`;
  let practiceId = "";
  let drillId = "";
  let originalDrillId = "";
  try {
    const originalResponse = await request.post(`${apiBase}/drills`, {
      data: {
        title: `Original drill for saved practice ${suffix}`,
        categoryId: "skating",
        notes: "Created by this test.",
        tags: ["Skating"],
        diagram: { version: 1, objects: [], paths: [] },
      },
    });
    expect(originalResponse.status()).toBe(201);
    const originalDrill = await originalResponse.json();
    originalDrillId = originalDrill.id;
    const practiceResponse = await request.post(`${apiBase}/trainings`, {
      data: {
        title,
        notes: "Original session.",
        tags: ["Tactics"],
        items: [
          {
            drillId: originalDrill.id,
            durationMinutes: 19,
            notes: "Original coaching cue.",
          },
        ],
      },
    });
    expect(practiceResponse.ok()).toBe(true);
    practiceId = (await practiceResponse.json()).id;
    await page.goto(`/practices/${practiceId}/edit`);
    await expect(
      page
        .getByRole("group", { name: "Categories", exact: true })
        .getByRole("checkbox"),
    ).toHaveCount(catalog.length);
    for (const tag of catalog)
      await expect(
        page.getByRole("checkbox", { name: tag, exact: true }),
      ).toHaveCount(1);
    await expect(
      page.getByRole("textbox", { name: "Add tag", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Add tag", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("img", {
        name: `Rink preview: ${originalDrill.title}`,
        exact: true,
      }),
    ).toBeVisible();
    const createButton = page.getByRole("button", {
      name: "Draw a new drill",
      exact: true,
    });
    await expect(createButton).toBeInViewport();
    await page
      .getByLabel("Practice notes", { exact: true })
      .fill("Keep these unsaved practice edits.");
    await createButton.click();
    await page.getByLabel("Drill name", { exact: true }).fill(drillTitle);
    await page.getByRole("checkbox", { name: "Shooting", exact: true }).check();
    const rink = page.getByRole("img", { name: /Interactive hockey rink/ });
    await page.getByRole("button", { name: "Cone", exact: true }).click();
    await rink.click({ position: { x: 150, y: 150 } });
    await page.getByRole("button", { name: "Goal", exact: true }).click();
    await rink.click({ position: { x: 350, y: 150 } });
    await page.getByRole("button", { name: "Skate", exact: true }).click();
    await rink.scrollIntoViewIfNeeded();
    const box = await rink.boundingBox();
    if (!box) throw new Error("Nested drill rink did not render.");
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.7, {
      steps: 12,
    });
    await page.mouse.up();
    const savedResponse = page.waitForResponse(
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
    const savedDrill = await (await savedResponse).json();
    drillId = savedDrill.id;
    expect(savedDrill.diagram.objects).toHaveLength(2);
    expect(savedDrill.diagram.paths).toHaveLength(1);
    await expect(page).toHaveURL(new RegExp(`/practices/${practiceId}/edit$`));
    await expect(
      page.getByLabel("Practice notes", { exact: true }),
    ).toHaveValue("Keep these unsaved practice edits.");
    await expect(page.getByRole("spinbutton")).toHaveCount(2);
    await expect(page.getByRole("spinbutton").first()).toHaveValue("19");
    await expect(
      page.getByLabel("Practice-specific notes").first(),
    ).toHaveValue("Original coaching cue.");
    const preview = page.getByRole("img", {
      name: `Rink preview: ${drillTitle}`,
      exact: true,
    });
    await expect(preview).toBeVisible();
    await expect(preview.locator("svg")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("practice-rink-overview.png"),
      fullPage: true,
    });
    const updateResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/trainings/${practiceId}`) &&
        response.request().method() === "PUT",
    );
    await page
      .getByRole("button", { name: "Save practice", exact: true })
      .click();
    const savedPractice = await (await updateResponse).json();
    expect(
      savedPractice.items.map((item: { drillId: string }) => item.drillId),
    ).toEqual([originalDrill.id, drillId]);
    await page.reload();
    await expect(
      page.getByRole("img", {
        name: `Rink preview: ${drillTitle}`,
        exact: true,
      }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const invalid = await request.post(`${apiBase}/trainings`, {
      data: {
        title: "Unsupported custom tag",
        notes: "",
        items: [],
        tags: ["Brand-new custom tag"],
      },
    });
    expect(invalid.status()).toBe(400);
  } finally {
    if (practiceId) await request.delete(`${apiBase}/trainings/${practiceId}`);
    if (drillId) await request.delete(`${apiBase}/drills/${drillId}`);
    if (originalDrillId)
      await request.delete(`${apiBase}/drills/${originalDrillId}`);
  }
});

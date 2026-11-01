import { expect, test } from "@playwright/test";

test("pages, search, direct practice previews and the drill picker do not load full libraries", async ({
  page,
  request,
}) => {
  const api = "http://127.0.0.1:5280/api";
  const prefix = `Pagination ${Date.now()}`;
  const drills: { id: string; title: string }[] = [];
  const practices: { id: string; title: string }[] = [];
  const fullReads: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "GET" &&
      /^\/api\/(drills|trainings)$/.test(new URL(request.url()).pathname)
    )
      fullReads.push(request.url());
  });
  try {
    for (let index = 0; index < 25; index++) {
      const response = await request.post(`${api}/drills`, {
        data: {
          title: `${prefix} drill ${String(index).padStart(2, "0")}`,
          categoryId: "skating",
          notes: "Paged drill instructions",
          tags: ["Skating"],
          ageGroups: ["U10"],
          diagram: { version: 1, objects: [], paths: [] },
        },
      });
      expect(response.ok()).toBe(true);
      drills.push(await response.json());
      const practice = await request.post(`${api}/trainings`, {
        data: {
          title: `${prefix} practice ${String(index).padStart(2, "0")}`,
          tags: ["Skating"],
          notes: "Saved practice notes",
          items: [
            { drillId: drills[0].id, durationMinutes: 12, notes: "First cue" },
            { drillId: drills[0].id, durationMinutes: 18, notes: "Repeat cue" },
          ],
        },
      });
      expect(practice.ok()).toBe(true);
      practices.push(await practice.json());
    }
    await page.goto(`/drills?search=${encodeURIComponent(prefix)}`);
    await expect(
      page.getByRole("link", { name: "Open Skating folder" }),
    ).toContainText("25 drills");
    await page.getByRole("link", { name: "Open Skating folder" }).click();
    await expect(page.locator(".unified-result")).toHaveCount(20);
    await page
      .getByRole("navigation", { name: "Drills pagination" })
      .getByRole("button", { name: "Next", exact: true })
      .click();
    await expect(page.locator(".unified-result")).toHaveCount(5);
    await page
      .getByRole("link", { name: new RegExp(drills[24].title) })
      .click();
    await expect(
      page.getByRole("img", { name: `Rink diagram: ${drills[24].title}` }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Back to drills", exact: true })
      .click();
    await expect(page).toHaveURL(/page=2/);
    await page.getByRole("textbox", { name: "Search drills" }).fill("drill 23");
    await expect(page.locator(".unified-result")).toHaveCount(1);
    await expect(page).not.toHaveURL(/page=2/);

    await page.goto(`/practices/all?search=${encodeURIComponent(prefix)}`);
    await expect(page.locator(".unified-result")).toHaveCount(20);
    await page
      .getByRole("navigation", { name: "Practices pagination" })
      .getByRole("button", { name: "Next", exact: true })
      .click();
    await expect(page.locator(".unified-result")).toHaveCount(5);
    await page
      .getByRole("link", { name: new RegExp(practices[24].title) })
      .click();
    await expect(
      page.getByRole("img", {
        name: `Rink preview: ${drills[0].title}`,
        exact: true,
      }),
    ).toHaveCount(2);
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export to PDF", exact: true })
      .click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    await page
      .getByRole("link", { name: "Edit practice", exact: true })
      .click();
    await page
      .getByLabel("Practice notes", { exact: true })
      .fill("Keep this draft while paging drills.");
    await expect(
      page.getByLabel("Search saved drills", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Saved drills pagination" })
      .getByRole("button", { name: "Next", exact: true })
      .click();
    await page
      .getByLabel("Add a saved drill", { exact: true })
      .selectOption(drills[24].id);
    await page
      .getByRole("button", { name: "Add selected drill", exact: true })
      .click();
    await expect(
      page.getByLabel("Practice notes", { exact: true }),
    ).toHaveValue("Keep this draft while paging drills.");
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/trainings/${practices[24].id}`) &&
        response.request().method() === "PUT",
    );
    await page
      .getByRole("button", { name: "Save practice", exact: true })
      .click();
    const result = await (await saved).json();
    expect(
      result.items.map((item: { drillId: string }) => item.drillId),
    ).toEqual([drills[0].id, drills[0].id, drills[24].id]);
    expect(
      result.items
        .slice(0, 2)
        .map((item: { durationMinutes: number }) => item.durationMinutes),
    ).toEqual([12, 18]);
    expect(fullReads).toEqual([]);
  } finally {
    for (const practice of practices)
      await request.delete(`${api}/trainings/${practice.id}`);
    for (const drill of drills)
      await request.delete(`${api}/drills/${drill.id}`);
  }
});

import { expect, test } from "@playwright/test";

const api = "http://127.0.0.1:5280/api";
test("four parallel drills share editable time, survive save/reload and export", async ({
  page,
  request,
}) => {
  const response = await request.post(`${api}/drills`, {
    data: {
      title: `Block drill ${Date.now()}`,
      categoryId: "skating",
      notes: "Reusable cue",
      diagram: { version: 1, objects: [], paths: [] },
      tags: [],
    },
  });
  expect(response.ok()).toBe(true);
  const drill = await response.json();
  let id = "";
  try {
    const created = await request.post(`${api}/trainings`, {
      data: {
        title: `Blocks ${Date.now()}`,
        notes: "",
        items: [10, 15, 20, 25].map((durationMinutes, index) => ({
          drillId: drill.id,
          durationMinutes,
          notes: `Station ${index + 1}`,
        })),
        tags: [],
      },
    });
    expect(created.ok()).toBe(true);
    id = (await created.json()).id;
    await page.goto(`/practices/${id}/edit`);
    await expect(
      page.getByRole("heading", { name: "70 minutes planned" }),
    ).toBeVisible();
    const toggles = page.getByRole("checkbox", {
      name: "Add to previous block",
    });
    for (const index of [0, 1, 2]) await toggles.nth(index).check();
    await expect(page.getByLabel("Block duration")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "10 minutes planned" }),
    ).toBeVisible();
    const duration = page.getByLabel("Block duration");
    await duration.fill("");
    await expect(duration).toHaveValue("");
    await duration.fill("18");
    await expect(
      page.getByRole("heading", { name: "18 minutes planned" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Save practice", exact: true })
      .click();
    await expect(page).toHaveURL(`/practices/${id}`);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Block 1", exact: true }),
    ).toBeVisible();
    const saved = await (await request.get(`${api}/trainings/${id}`)).json();
    expect(
      saved.items.map(
        (item: { durationMinutes: number }) => item.durationMinutes,
      ),
    ).toEqual([18, 18, 18, 18]);
    expect(
      saved.items.map(
        (item: { runInParallelWithPrevious: boolean }) =>
          item.runInParallelWithPrevious,
      ),
    ).toEqual([false, true, true, true]);
    expect(saved.items.map((item: { notes: string }) => item.notes)).toEqual([
      "Station 1",
      "Station 2",
      "Station 3",
      "Station 4",
    ]);
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export to PDF", exact: true })
      .click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    await page
      .getByRole("link", { name: "Edit practice", exact: true })
      .click();
    await page.getByLabel("Block duration").fill("");
    await page
      .getByRole("button", { name: "Save practice", exact: true })
      .click();
    await expect(page).toHaveURL(`/practices/${id}`);
    await expect(
      page.getByRole("heading", { name: "0 minutes planned" }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    if (id) await request.delete(`${api}/trainings/${id}`);
    await request.delete(`${api}/drills/${drill.id}`);
  }
});

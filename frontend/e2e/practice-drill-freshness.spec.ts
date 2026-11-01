import { expect, test } from "@playwright/test";

test("a drill created by another client is available without losing the practice draft", async ({
  page,
  request,
}) => {
  const api = "http://127.0.0.1:5280/api";
  const suffix = Date.now();
  const practiceResponse = await request.post(`${api}/trainings`, {
    data: {
      title: `Freshness practice ${suffix}`,
      notes: "",
      tags: [],
      items: [],
    },
  });
  expect(practiceResponse.ok()).toBe(true);
  const practice = await practiceResponse.json();
  let drillId = "";
  try {
    await page.goto(`/practices/${practice.id}/edit`);
    await page
      .getByLabel("Practice notes", { exact: true })
      .fill("Keep my unsaved coaching plan.");
    const drillResponse = await request.post(`${api}/drills`, {
      data: {
        title: `Another coach's drill ${suffix}`,
        categoryId: "skating",
        tags: ["Skating"],
        notes: "New drill",
        diagram: { version: 1, objects: [], paths: [] },
      },
    });
    expect(drillResponse.ok()).toBe(true);
    const drill = await drillResponse.json();
    drillId = drill.id;
    const refresh = page.getByRole("button", {
      name: "Refresh drills",
      exact: true,
    });
    await expect(refresh).toBeEnabled();
    await refresh.click();
    const picker = page.getByLabel("Add a saved drill", { exact: true });
    await expect(picker.locator(`option[value="${drill.id}"]`)).toHaveText(
      drill.title,
    );
    await picker.selectOption(drill.id);
    await page
      .getByRole("button", { name: "Add selected drill", exact: true })
      .click();
    await expect(
      page.getByLabel("Practice notes", { exact: true }),
    ).toHaveValue("Keep my unsaved coaching plan.");
    await expect(
      page.getByRole("heading", { name: drill.title, exact: true }),
    ).toBeVisible();
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/trainings/${practice.id}`) &&
        response.request().method() === "PUT",
    );
    await page
      .getByRole("button", { name: "Save practice", exact: true })
      .click();
    const result = await (await saved).json();
    expect(result.notes).toBe("Keep my unsaved coaching plan.");
    expect(result.items[0].drillId).toBe(drill.id);
  } finally {
    await request.delete(`${api}/trainings/${practice.id}`);
    if (drillId) await request.delete(`${api}/drills/${drillId}`);
  }
});

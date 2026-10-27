import { expect, test } from "@playwright/test";

const base = "http://127.0.0.1:5280/api";

for (const kind of ["drill", "practice"] as const) {
  test(`new ${kind} names have the intended default and require a real name`, async ({
    page,
  }) => {
    await page.goto(`/${kind === "drill" ? "drills" : "practices"}/new`);
    const name = page.getByLabel(
      kind === "drill" ? "Drill name" : "Practice name",
      { exact: true },
    );
    const today = await page.evaluate(() =>
      new Date().toLocaleDateString("sv-SE"),
    );
    await expect(name).toHaveValue(kind === "drill" ? "" : today);
    await expect(name).toHaveAttribute("required", "");
    let writes = 0;
    page.on("request", (request) => {
      if (request.method() === "POST") writes++;
    });
    await name.fill("   ");
    await page
      .getByRole("button", { name: `Save ${kind}`, exact: true })
      .click();
    await expect(page.getByRole("alert")).toHaveText(
      `Enter a ${kind} name before saving.`,
    );
    await expect(name).toBeFocused();
    expect(writes).toBe(0);
  });
}

test("club copies and nested club drills keep the selected team and their own ownership", async ({
  page,
  request,
}) => {
  const org = await (
    await request.post(`${base}/workspace/organisations`, {
      data: { name: `Name and workspace club ${Date.now()}` },
    })
  ).json();
  const orgHeaders = { "X-Organisation-Id": org.id };
  const team = await (
    await request.post(`${base}/workspace/teams`, {
      headers: orgHeaders,
      data: { name: "Selected team" },
    })
  ).json();
  const headers = { ...orgHeaders, "X-Team-Id": team.id };
  const source = await (
    await request.post(`${base}/trainings`, {
      headers,
      data: { title: "Club practice ownership check", notes: "", items: [] },
    })
  ).json();
  // Restore an old library-only selection with a valid default team.
  await page.addInitScript(
    (id) => localStorage.setItem("icework:workspace", `${id}:`),
    org.id,
  );
  await page.route("**/api/account/preferences", (route) =>
    route.fulfill({ json: { defaultTeamId: team.id } }),
  );
  await page.goto(`/practices/${source.id}`);
  const teamPicker = page.getByRole("combobox", { name: "Team", exact: true });
  await expect(teamPicker).toHaveValue(team.id);
  await expect(teamPicker.locator("option")).toHaveText([team.name]);
  await page
    .getByRole("button", { name: "Copy to organisation library", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Copy to organisation library", exact: true })
    .click();
  await dialog.getByRole("link", { name: "Open new practice plan" }).click();
  await expect(
    page.getByText(`Club: ${org.name}`, { exact: true }),
  ).toBeVisible();
  await expect(teamPicker).toHaveValue(team.id);
  const libraryPlanId = page.url().split("/").pop()!;
  await page.getByRole("button", { name: "Draw a new drill" }).click();
  await expect(teamPicker).toHaveValue(team.id);
  await expect(
    page.getByText(`Club: ${org.name}`, { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Drill name", { exact: true })
    .fill("Club nested drill");
  const savedDrill = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/drills") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Save drill and add to practice" })
    .click();
  const drill = await (await savedDrill).json();
  expect(drill.ownership.ownerTeamId).toBeNull();
  expect(drill.ownership.organisationId).toBe(org.id);
  await expect(page).toHaveURL(new RegExp(`/practices/${libraryPlanId}$`));
  await expect(teamPicker).toHaveValue(team.id);
  await page
    .getByRole("button", { name: "Save practice", exact: true })
    .click();
  await expect(page.locator(".save-status")).toHaveText("Saved");
  const savedPlan = await (
    await request.get(`${base}/trainings/${libraryPlanId}`, { headers })
  ).json();
  expect(savedPlan.ownership.ownerTeamId).toBeNull();
  expect(savedPlan.items).toHaveLength(1);
  expect(savedPlan.items[0].drillId).toBe(drill.id);
  expect(
    (
      await (
        await request.get(`${base}/trainings/${source.id}`, { headers })
      ).json()
    ).items,
  ).toEqual([]);
  await page.goto("/drills/all?source=club");
  await page.getByRole("link").filter({ hasText: "Club nested drill" }).click();
  await expect(page.getByLabel("Drill name", { exact: true })).toHaveValue(
    drill.title,
  );
  await expect(teamPicker).toHaveValue(team.id);
  await page.reload();
  await expect(teamPicker).toHaveValue(team.id);
  await request.delete(`${base}/trainings/${libraryPlanId}`, { headers });
  await request.delete(`${base}/trainings/${source.id}`, { headers });
  await request.delete(`${base}/drills/${drill.id}`, { headers });
});

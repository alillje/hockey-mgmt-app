import { expect, test } from "@playwright/test";
const base = "http://127.0.0.1:5280/api";

test("team and club checkboxes combine independent content and keep owner labels clear", async ({
  page,
  request,
}) => {
  const org = await (
    await request.post(`${base}/workspace/organisations`, {
      data: { name: "Filter club" },
    })
  ).json();
  const headers = { "X-Organisation-Id": org.id };
  const team = await (
    await request.post(`${base}/workspace/teams`, {
      headers,
      data: { name: "Filter U12" },
    })
  ).json();
  const teamHeaders = { ...headers, "X-Team-Id": team.id };
  const drill = await (
    await request.post(`${base}/drills`, {
      headers: teamHeaders,
      data: {
        title: "Team and club filter drill",
        categoryId: "skating",
        tags: ["Skating"],
        ageGroups: ["U10", "U12"],
        diagram: { version: 1, objects: [], paths: [] },
      },
    })
  ).json();
  const club = await (
    await request.post(`${base}/drills/${drill.id}/copy-to-library`, {
      headers: teamHeaders,
    })
  ).json();
  await page.addInitScript(
    ({ orgId, teamId }) =>
      localStorage.setItem("icework:workspace", `${orgId}:${teamId}`),
    { orgId: org.id, teamId: team.id },
  );
  await page.goto("/drills/all");
  const local = page.getByRole("checkbox", {
    name: `${team.name} (team)`,
    exact: true,
  });
  const shared = page.getByRole("checkbox", {
    name: `${org.name} (club)`,
    exact: true,
  });
  await expect(local).toBeChecked();
  await expect(shared).not.toBeChecked();
  const results = page.locator(".unified-result");
  await expect(results).toHaveCount(1);
  await expect(
    results.getByText(`Team: ${team.name}`, { exact: true }),
  ).toBeVisible();
  await shared.check();
  await expect(results).toHaveCount(2);
  await expect(
    results.getByText(`Club: ${org.name}`, { exact: true }),
  ).toBeVisible();
  await local.uncheck();
  await expect(results).toHaveCount(1);
  await page.reload();
  await expect(local).not.toBeChecked();
  await expect(shared).toBeChecked();
  await page.getByText("Filter by age groups", { exact: true }).click();
  const ages = page.getByRole("group", { name: "Age filters", exact: true });
  await ages.getByRole("checkbox", { name: "U8", exact: true }).check();
  await expect(results).toHaveCount(0);
  await ages.getByRole("checkbox", { name: "U12", exact: true }).check();
  await expect(results).toHaveCount(1);
  await expect(results.getByText("U10", { exact: true })).toBeVisible();
  await shared.uncheck();
  await expect(results).toHaveCount(0);
  await request.delete(`${base}/drills/${drill.id}`, { headers: teamHeaders });
  await request.delete(`${base}/drills/${club.id}`, { headers });
});

test("Account default team persists and is preselected after reopening the app", async ({
  page,
  request,
}) => {
  const previous = await (
    await request.get(`${base}/account/preferences`)
  ).json();
  const org = await (
    await request.post(`${base}/workspace/organisations`, {
      data: { name: "Default choice club" },
    })
  ).json();
  const headers = { "X-Organisation-Id": org.id };
  const first = await (
    await request.post(`${base}/workspace/teams`, {
      headers,
      data: { name: "First choice" },
    })
  ).json();
  const second = await (
    await request.post(`${base}/workspace/teams`, {
      headers,
      data: { name: "Preferred choice" },
    })
  ).json();
  try {
    await page.addInitScript(
      ({ orgId, teamId }) =>
        localStorage.setItem("icework:workspace", `${orgId}:${teamId}`),
      { orgId: org.id, teamId: first.id },
    );
    await page.goto("/account");
    await page
      .getByRole("combobox", { name: "Default team", exact: true })
      .selectOption(second.id);
    await page
      .getByRole("button", { name: "Save default team", exact: true })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Default team", exact: true }),
    ).toHaveValue(second.id);
    await page.goto("/drills/all");
    await expect(
      page.getByRole("checkbox", {
        name: `${second.name} (team)`,
        exact: true,
      }),
    ).toBeChecked();
    await page.reload();
    await expect(
      page.getByRole("combobox", { name: "Team", exact: true }),
    ).toHaveValue(second.id);
    await expect(
      page.getByRole("checkbox", {
        name: `${second.name} (team)`,
        exact: true,
      }),
    ).toBeChecked();
  } finally {
    await request.put(`${base}/account/preferences`, {
      data: { defaultTeamId: previous.defaultTeamId },
    });
  }
});

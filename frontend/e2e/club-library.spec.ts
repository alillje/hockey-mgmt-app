import { expect, test } from "@playwright/test";

const base = "http://127.0.0.1:5280/api";

test("club plan sharing confirms drills, team copying preserves entries, and individual drill copies stay independent", async ({
  page,
  request,
}, testInfo) => {
  const organisation = await (
    await request.post(`${base}/workspace/organisations`, {
      data: { name: `Club browser ${Date.now()}` },
    })
  ).json();
  const orgHeaders = { "X-Organisation-Id": organisation.id };
  const teamA = await (
    await request.post(`${base}/workspace/teams`, {
      headers: orgHeaders,
      data: { name: "Source U12", ageGroup: "U12" },
    })
  ).json();
  const teamB = await (
    await request.post(`${base}/workspace/teams`, {
      headers: orgHeaders,
      data: { name: "Destination U14", ageGroup: "U14" },
    })
  ).json();
  const headers = { ...orgHeaders, "X-Team-Id": teamA.id };
  const drillBody = {
    title: "Shared skating sequence",
    categoryId: "skating",
    tags: ["Skating"],
    notes: "Reusable skating instructions",
    ageGroup: "U12",
    diagram: {
      version: 1,
      objects: [
        {
          id: crypto.randomUUID(),
          type: "goal",
          x: 100,
          y: 250,
          rotation: 90,
          color: "#ef4444",
          label: "",
        },
      ],
      paths: [],
    },
  };
  const first = await (
    await request.post(`${base}/drills`, { headers, data: drillBody })
  ).json();
  const second = await (
    await request.post(`${base}/drills`, {
      headers,
      data: { ...drillBody, title: "Shared finishing sequence" },
    })
  ).json();
  const plan = await (
    await request.post(`${base}/trainings`, {
      headers,
      data: {
        title: "Club U12 practice",
        tags: ["Skating"],
        notes: "Reusable plan notes",
        ageGroup: "U12",
        items: [
          { drillId: first.id, durationMinutes: 8, notes: "Practice cue one" },
          {
            drillId: second.id,
            durationMinutes: 17,
            notes: "Practice cue two",
          },
        ],
      },
    })
  ).json();
  await page.addInitScript(
    ({ orgId, teamId }) =>
      localStorage.setItem("icework:workspace", `${orgId}:${teamId}`),
    { orgId: organisation.id, teamId: teamA.id },
  );
  await page.goto(`/practices/${plan.id}`);
  await page
    .getByRole("button", { name: "Share with club", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(first.title, { exact: true })).toBeVisible();
  await expect(dialog.getByText(second.title, { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Share plan and listed drills" }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Share plan and listed drills" })
    .click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole("combobox", { name: "Team", exact: true })
    .selectOption(teamB.id);
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: "Club library", exact: true }).click();
  await page.getByLabel("Content", { exact: true }).selectOption("practices");
  await page.getByLabel("Age group", { exact: true }).selectOption("U12");
  await page.getByLabel("Originating team").selectOption(teamA.id);
  const card = page
    .locator(".club-card")
    .filter({ has: page.getByRole("heading", { name: plan.title }) });
  await expect(card.getByText(/Shared with club/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("club-library.png"),
    fullPage: true,
  });
  await card.getByRole("button", { name: "Copy to my team" }).click();
  await expect(page).toHaveURL(/\/practices\/[a-f0-9-]+$/);
  const copyId = page.url().split("/").pop()!;
  expect(copyId).not.toBe(plan.id);
  const copied = await (
    await request.get(`${base}/trainings/${copyId}`, {
      headers: { ...orgHeaders, "X-Team-Id": teamB.id },
    })
  ).json();
  expect(copied.items).toEqual(plan.items);
  expect(copied.ownership.ownerTeamId).toBe(teamB.id);
  expect(copied.ownership.visibility).toBe("team");
  const replacedResponse = page.waitForResponse((r) =>
    r.url().endsWith(`/trainings/${copyId}/items/0/copy-drill`),
  );
  await page
    .getByRole("button", { name: "Copy drill for this practice" })
    .first()
    .click();
  const replaced = await (await replacedResponse).json();
  expect(replaced.items[0].drillId).not.toBe(first.id);
  await page
    .getByLabel("Practice-specific notes", { exact: true })
    .first()
    .fill("This team's own coaching cue");
  await page
    .getByRole("button", { name: "Save practice", exact: true })
    .click();
  await expect(
    page.getByText("Saved to your library", { exact: true }),
  ).toBeVisible();
  const sourceDrill = await (
    await request.get(`${base}/drills/${first.id}`, { headers })
  ).json();
  expect(sourceDrill.notes).toBe(drillBody.notes);
  const sourcePlan = await (
    await request.get(`${base}/trainings/${plan.id}`, { headers })
  ).json();
  expect(sourcePlan.items).toEqual(plan.items);
  const independent = await (
    await request.get(`${base}/drills/${replaced.items[0].drillId}`, {
      headers: { ...orgHeaders, "X-Team-Id": teamB.id },
    })
  ).json();
  expect(independent.diagram).toEqual(first.diagram);
  expect(independent.notes).toBe(first.notes);
  const blocked = await request.post(
    `${base}/drills/${sourceDrill.id}/visibility`,
    {
      headers,
      data: { visibility: "team", expectedUpdatedAt: sourceDrill.updatedAt },
    },
  );
  expect(blocked.status()).toBe(409);
});

test("view-only shared content has no editing controls", async ({
  page,
  request,
}) => {
  const created = await (
    await request.post(`${base}/drills`, {
      data: {
        title: "Readonly UI fixture",
        categoryId: "skating",
        tags: [],
        notes: "Instructions to read",
        diagram: { version: 1, objects: [], paths: [] },
      },
    })
  ).json();
  await request.post(`${base}/drills/${created.id}/visibility`, {
    data: { visibility: "organisation", expectedUpdatedAt: created.updatedAt },
  });
  // API permission tests use signed JWTs. This route exercises the UI's read-only capability rendering.
  await page.route("**/api/drills", async (route) => {
    const response = await route.fetch();
    const drills = await response.json();
    await route.fulfill({
      response,
      json: drills.map((d: { id: string; ownership: object }) =>
        d.id === created.id
          ? { ...d, ownership: { ...d.ownership, canEdit: false } }
          : d,
      ),
    });
  });
  await page.goto(`/drills/${created.id}`);
  await expect(
    page.getByRole("heading", { name: created.title }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save drill", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Delete drill", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Make team-only", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Copy to my team" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download PDF" }),
  ).toBeVisible();
  await request.delete(`${base}/drills/${created.id}`);
});

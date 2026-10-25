import { expect, test } from "@playwright/test";

const base = "http://127.0.0.1:5280/api";

test("complete plans copy independently through the organisation library and team picker stays local", async ({
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
    .getByRole("button", { name: "Copy to organisation library", exact: true })
    .click();
  const contribution = page.getByRole("dialog");
  await expect(
    contribution.getByText(/All included drills will also be copied/),
  ).toBeVisible();
  let contributions = 0;
  page.on("request", (r) => {
    if (r.url().endsWith(`/trainings/${plan.id}/copy-to-library`))
      contributions++;
  });
  await contribution
    .getByRole("button", { name: "Copy to organisation library", exact: true })
    .dblclick();
  const newLink = contribution.getByRole("link", {
    name: "Open new practice plan",
  });
  await expect(newLink).toBeVisible();
  const libraryId = (await newLink.getAttribute("href"))!.split("/").pop()!;
  expect(libraryId).not.toBe(plan.id);
  expect(contributions).toBe(1);
  await contribution
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Team", exact: true })
    .selectOption(teamB.id);
  await expect(page).toHaveURL(/\/$/);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Practices", exact: true })
    .click();
  await page.getByRole("link", { name: /^Show all/ }).click();
  await page
    .getByRole("checkbox", { name: `${organisation.name} (club)`, exact: true })
    .check();
  const card = page.locator(".unified-result").filter({ hasText: plan.title });
  await expect(
    card.getByText(`Club: ${organisation.name}`, { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("club-library.png"),
    fullPage: true,
  });
  await card.getByRole("button", { name: "Copy to my team" }).click();
  const copying = page.getByRole("dialog");
  await expect(
    copying.getByText(/All included drills will also be copied/),
  ).toBeVisible();
  await copying
    .getByRole("button", { name: "Copy to my team", exact: true })
    .click();
  await copying.getByRole("link", { name: "Open new practice plan" }).click();
  await expect(page).toHaveURL(/\/practices\/[a-f0-9-]+$/);
  const copyId = page.url().split("/").pop()!;
  expect(copyId).not.toBe(plan.id);
  const copied = await (
    await request.get(`${base}/trainings/${copyId}`, {
      headers: { ...orgHeaders, "X-Team-Id": teamB.id },
    })
  ).json();
  expect(
    copied.items.map((i: { durationMinutes: number; notes: string }) => [
      i.durationMinutes,
      i.notes,
    ]),
  ).toEqual(
    plan.items.map((i: { durationMinutes: number; notes: string }) => [
      i.durationMinutes,
      i.notes,
    ]),
  );
  expect(copied.ownership.ownerTeamId).toBe(teamB.id);
  const libraryPlan = await (
    await request.get(`${base}/trainings/${libraryId}`, { headers })
  ).json();
  for (const entry of copied.items) {
    expect(plan.items.map((i: { drillId: string }) => i.drillId)).not.toContain(
      entry.drillId,
    );
    expect(
      libraryPlan.items.map((i: { drillId: string }) => i.drillId),
    ).not.toContain(entry.drillId);
  }
  await expect(
    page.getByRole("button", { name: "Share with club" }),
  ).toHaveCount(0);
  const picker = page.getByRole("combobox", { name: "Add a saved drill" });
  const choices = await picker
    .locator("option")
    .evaluateAll((options) =>
      options.map((o) => (o as HTMLOptionElement).value),
    );
  expect(choices).not.toContain(libraryPlan.items[0].drillId);
  expect(choices).toContain(copied.items[0].drillId);
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
    await request.get(`${base}/drills/${copied.items[0].drillId}`, {
      headers: { ...orgHeaders, "X-Team-Id": teamB.id },
    })
  ).json();
  expect(independent.diagram).toEqual(first.diagram);
  expect(independent.notes).toBe(first.notes);
  await request.delete(`${base}/trainings/${plan.id}`, { headers });
  expect(
    (await request.delete(`${base}/drills/${first.id}`, { headers })).status(),
  ).toBe(204);
  expect(
    (
      await request.get(`${base}/drills/${copied.items[0].drillId}`, {
        headers: { ...orgHeaders, "X-Team-Id": teamB.id },
      })
    ).status(),
  ).toBe(200);
});

test("view-only library content has no editing controls", async ({
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
  const libraryDrill = await (
    await request.post(`${base}/drills/${created.id}/copy-to-library`)
  ).json();
  // API permission tests use signed JWTs. This route exercises the UI's read-only capability rendering.
  await page.route("**/api/drills", async (route) => {
    const response = await route.fetch();
    const drills = await response.json();
    await route.fulfill({
      response,
      json: drills.map((d: { id: string; ownership: object }) =>
        d.id === libraryDrill.id
          ? { ...d, ownership: { ...d.ownership, canEdit: false } }
          : d,
      ),
    });
  });
  await page.goto(`/drills/${libraryDrill.id}`);
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
  await request.delete(`${base}/drills/${libraryDrill.id}`);
});

test("an administrator without team membership defaults to the organisation library", async ({
  page,
  request,
}) => {
  const org = await (
    await request.post(`${base}/workspace/organisations`, {
      data: { name: "Library administrator workspace" },
    })
  ).json();
  const headers = { "X-Organisation-Id": org.id };
  const team = await (
    await request.post(`${base}/workspace/teams`, {
      headers,
      data: { name: "Membership required team" },
    })
  ).json();
  const workspace = await (await request.get(`${base}/workspace`)).json();
  await page.route("**/api/workspace", (route) =>
    route.fulfill({
      json: {
        userId: workspace.userId,
        organisations: [
          {
            ...org,
            isAdmin: true,
            teams: [{ ...team, canView: false, canEdit: false }],
          },
        ],
      },
    }),
  );
  await page.addInitScript(
    ({ organisationId, teamId }) =>
      localStorage.setItem("icework:workspace", `${organisationId}:${teamId}`),
    { organisationId: org.id, teamId: team.id },
  );
  await page.goto("/");
  await expect(
    page.getByRole("combobox", { name: "Team", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("option", {
      name: "Membership required team · Membership required",
      exact: true,
    }),
  ).toHaveJSProperty("disabled", true);
  await page.goto("/drills/all");
  await expect(
    page.getByRole("checkbox", { name: `${org.name} (club)`, exact: true }),
  ).toBeChecked();
  await expect(page.locator(".global-error")).toHaveCount(0);
});

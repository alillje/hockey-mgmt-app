import { expect, test } from "@playwright/test";

const apiBase = "http://127.0.0.1:5280/api";

test("administrators add existing users by email and see a clear missing-user error", async ({
  page,
  request,
}) => {
  const org = await (
    await request.post(apiBase + "/workspace/organisations", {
      data: { name: "Email member club" },
    })
  ).json();
  const headers = { "X-Organisation-Id": org.id };
  const team = await (
    await request.post(apiBase + "/workspace/teams", {
      headers,
      data: { name: "Email team" },
    })
  ).json();
  const memberId = "44444444-4444-4444-4444-444444444444";
  const submitted: unknown[] = [];
  // Local UI test uses real membership storage; directory resolution is verified in backend tests.
  await page.route("**/api/workspace/members/by-email", async (route) => {
    const body = route.request().postDataJSON();
    submitted.push(body);
    expect(body.userId).toBeUndefined();
    if (body.email === "missing@example.com") {
      return route.fulfill({
        status: 404,
        json: {
          detail: "No registered user was found with that email address.",
        },
      });
    }
    expect(body.email).toBe("coach@example.com");
    return route.fulfill({
      response: await request.post(apiBase + "/workspace/members", {
        headers,
        data: {
          userId: memberId,
          role: body.role,
          teamId: body.teamId,
          teamRole: body.teamRole,
        },
      }),
    });
  });
  await page.addInitScript(
    ({ orgId, teamId }) =>
      localStorage.setItem("icework:workspace", orgId + ":" + teamId),
    { orgId: org.id, teamId: team.id },
  );
  await page.goto("/organisation");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("missing@example.com");
  await page.getByRole("button", { name: "Add access", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "No registered user was found with that email address.",
  );
  await page
    .getByLabel("Email address", { exact: true })
    .fill("coach@example.com");
  const accessForm = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Add member access", exact: true }),
  });
  await accessForm
    .getByRole("combobox", { name: "Team", exact: true })
    .selectOption(team.id);
  await accessForm
    .getByRole("combobox", { name: "Team role", exact: true })
    .selectOption("editor");
  await page.getByRole("button", { name: "Add access", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Access added for coach@example.com",
  );
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
    "",
  );
  const members = await (
    await request.get(apiBase + "/workspace/members", { headers })
  ).json();
  expect(
    members.find((m: { userId: string }) => m.userId === memberId),
  ).toMatchObject({ teamId: team.id, teamRole: "editor" });
  expect(submitted).toHaveLength(2);
});

test("users without an organisation see access guidance and can open Account", async ({
  page,
}) => {
  await page.route("**/api/workspace", (route) =>
    route.fulfill({
      json: {
        userId: "11111111-1111-1111-1111-111111111111",
        isPlatformAdmin: false,
        organisations: [],
      },
    }),
  );
  await page.goto("/drills/new");
  await expect(
    page.getByRole("heading", {
      name: "You haven’t been added to an organisation",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Check access" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create organisation", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your account" }),
  ).toBeVisible();
});

test("organisation admins manage regular team roles and removals while administrator controls stay protected", async ({
  page,
  request,
}) => {
  const org = await (
    await request.post(`${apiBase}/workspace/organisations`, {
      data: { name: "Membership browser club" },
    })
  ).json();
  const headers = { "X-Organisation-Id": org.id };
  const team = await (
    await request.post(`${apiBase}/workspace/teams`, {
      headers,
      data: { name: "Membership U12" },
    })
  ).json();
  const memberId = "22222222-2222-2222-2222-222222222222";
  const administratorId = "33333333-3333-3333-3333-333333333333";
  await request.post(`${apiBase}/workspace/members`, {
    headers,
    data: {
      userId: memberId,
      role: "member",
      teamId: team.id,
      teamRole: "viewer",
    },
  });
  await request.post(`${apiBase}/workspace/members`, {
    headers,
    data: { userId: administratorId, role: "admin" },
  });
  // Backend permission tests use signed tokens. This override verifies the organisation-admin UI.
  await page.route("**/api/workspace", async (route) => {
    const response = await route.fetch();
    const workspace = await response.json();
    await route.fulfill({
      json: {
        ...workspace,
        isPlatformAdmin: false,
        organisations: workspace.organisations.filter(
          (item: { id: string }) => item.id === org.id,
        ),
      },
    });
  });
  await page.addInitScript(
    ({ orgId, teamId }) =>
      localStorage.setItem("icework:workspace", `${orgId}:${teamId}`),
    { orgId: org.id, teamId: team.id },
  );
  try {
    await page.goto("/organisation");
    await expect(
      page.getByRole("combobox", { name: "Age group", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Create organisation", exact: true }),
    ).toHaveCount(0);
    const protectedCard = page.getByRole("article", {
      name: `Member ${administratorId}`,
      exact: true,
    });
    await expect(protectedCard).toContainText(
      "Only the platform administrator",
    );
    await expect(protectedCard.getByRole("button")).toHaveCount(0);
    const card = page.getByRole("article", {
      name: `Member ${memberId}`,
      exact: true,
    });
    await card
      .getByRole("combobox", { name: "Role in Membership U12" })
      .selectOption("editor");
    await card.getByRole("button", { name: "Save team role" }).click();
    await expect(page.getByRole("status")).toHaveText("Team role updated.");
    const members = await (
      await request.get(`${apiBase}/workspace/members`, { headers })
    ).json();
    expect(
      members.find((item: { userId: string }) => item.userId === memberId)
        .teamRole,
    ).toBe("editor");
    page.on("dialog", (dialog) => dialog.accept());
    await card
      .getByRole("button", { name: "Remove from team", exact: true })
      .click();
    await expect(card).toContainText("No team access");
    await expect(page.getByRole("status")).toHaveText("Team access removed.");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await card
      .getByRole("button", { name: "Remove user from organisation" })
      .click();
    await expect(card).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText(
      "Organisation access removed.",
    );
  } finally {
    await request.delete(`${apiBase}/workspace/members/${memberId}`, {
      headers,
    });
    await request.delete(`${apiBase}/workspace/members/${administratorId}`, {
      headers,
    });
  }
});

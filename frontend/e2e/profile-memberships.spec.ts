import { expect, test } from "@playwright/test";

test("required names gate sign-in, remain editable, and members see their teams and roles", async ({
  page,
}) => {
  let profile = {
    firstName: "",
    lastName: "",
    email: "coach@example.com",
    isComplete: false,
  };
  const organisationId = "11111111-1111-1111-1111-111111111111";
  const teamId = "22222222-2222-2222-2222-222222222222";
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({ json: { enabled: true, supabaseUrl: null } }),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        authenticated: true,
        email: profile.email,
        csrfToken: "profile-csrf",
      },
    }),
  );
  await page.route("**/api/account/profile", (route) => {
    if (route.request().method() === "PUT") {
      expect(route.request().headers()["x-csrf-token"]).toBe("profile-csrf");
      const body = route.request().postDataJSON();
      expect(Object.keys(body).sort()).toEqual(["firstName", "lastName"]);
      profile = {
        ...profile,
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        isComplete: true,
      };
    }
    return route.fulfill({ json: profile });
  });
  await page.route("**/api/workspace", (route) =>
    route.fulfill({
      json: {
        userId: "33333333-3333-3333-3333-333333333333",
        isPlatformAdmin: false,
        organisations: [
          {
            id: organisationId,
            name: "My hockey club",
            isAdmin: false,
            role: "member",
            teams: [
              {
                id: teamId,
                name: "My team",
                canEdit: false,
                canView: true,
                role: "viewer",
              },
            ],
          },
        ],
      },
    }),
  );
  await page.route("**/api/account/preferences", (route) =>
    route.fulfill({ json: { defaultTeamId: teamId } }),
  );
  await page.route("**/api/drills", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/trainings", (route) => route.fulfill({ json: [] }));
  await page.route(`**/api/workspace/teams/${teamId}/members`, (route) => {
    expect(route.request().headers()["x-organisation-id"]).toBe(organisationId);
    return route.fulfill({
      json: {
        members: [
          {
            userId: "member",
            firstName: "Åsa",
            lastName: "O'Neill",
            role: "viewer",
          },
        ],
        administrators: [
          {
            userId: "admin",
            firstName: "Club",
            lastName: "Admin",
            role: "admin",
          },
        ],
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Complete your profile" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save name" })).toBeDisabled();
  await page.getByLabel("First name", { exact: true }).fill("Åsa");
  await page.getByLabel("Last name", { exact: true }).fill("O'Neill");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(
    page.getByRole("heading", { name: "Drills and practice plans" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue(
    "Åsa",
  );
  await page.getByLabel("First name", { exact: true }).fill("Anna");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Name saved.", { exact: true })).toBeVisible();
  await page
    .getByRole("link", { name: "Your organisations and teams", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My hockey club" }),
  ).toBeVisible();
  await expect(
    page.getByText("Organisation member", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Your team role: Viewer", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create team", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add access", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "View members", exact: true }).click();
  await expect(
    page.getByText("Åsa O'Neill · Viewer", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Club Admin · Organisation administrator", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText("coach@example.com");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Organisations", exact: true }),
  ).toBeVisible();
});

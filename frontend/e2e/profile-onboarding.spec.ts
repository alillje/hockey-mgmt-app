import { expect, test, type Page } from "@playwright/test";
import type { UserProfile } from "../src/lib/api";

const incompleteProfile: UserProfile = {
  firstName: "",
  lastName: "",
  email: "coach@example.com",
  isComplete: false,
};

async function mockAccount(page: Page, initial: UserProfile) {
  const state = { profile: initial, failProfile: false, rejectContent: false };
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({ json: { enabled: true, supabaseUrl: null } }),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: { authenticated: true, email: initial.email, csrfToken: "csrf" },
    }),
  );
  await page.route("**/api/account/profile", (route) => {
    if (state.failProfile)
      return route.fulfill({
        status: 500,
        json: { title: "Database unavailable" },
      });
    if (route.request().method() === "PUT") {
      state.profile = {
        ...state.profile,
        ...route.request().postDataJSON(),
        isComplete: true,
      };
      state.rejectContent = false;
    }
    return route.fulfill({ json: state.profile });
  });
  await page.route("**/api/workspace", (route) =>
    route.fulfill({
      json: {
        userId: "coach",
        isPlatformAdmin: false,
        organisations: [
          {
            id: "club",
            name: "Club",
            isAdmin: false,
            role: "member",
            teams: [
              {
                id: "team",
                name: "Team",
                canEdit: true,
                canView: true,
                role: "editor",
              },
            ],
          },
        ],
      },
    }),
  );
  await page.route("**/api/account/preferences", (route) =>
    route.fulfill({ json: { defaultTeamId: "team" } }),
  );
  await page.route("**/api/catalog", (route) =>
    route.fulfill({ json: { categories: [], ageGroups: [] } }),
  );
  await page.route("**/api/trainings", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/drills", (route) => {
    if (state.rejectContent) {
      state.profile = { ...incompleteProfile };
      return route.fulfill({
        status: 403,
        json: { title: "Profile required" },
      });
    }
    return route.fulfill({ json: [] });
  });
  return state;
}

for (const [firstName, lastName] of [
  ["", ""],
  ["Test", ""],
  ["", "Coach"],
]) {
  test(`missing names (${firstName}/${lastName}) require profile completion`, async ({
    page,
  }) => {
    await mockAccount(page, { ...incompleteProfile, firstName, lastName });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Complete your profile" }),
    ).toBeVisible();
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await page.getByLabel("First name", { exact: true }).fill("Test");
    await page.getByLabel("Last name", { exact: true }).fill("Coach");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(
      page.getByRole("heading", { name: "Drills and practice plans" }),
    ).toBeVisible();
  });
}

test("a server profile requirement reopens setup instead of leaving a workspace error", async ({
  page,
}) => {
  const state = await mockAccount(page, {
    ...incompleteProfile,
    firstName: "Test",
    lastName: "Coach",
    isComplete: true,
  });
  state.rejectContent = true;
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Complete your profile" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await page.getByLabel("First name", { exact: true }).fill("Test");
  await page.getByLabel("Last name", { exact: true }).fill("Coach");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(
    page.getByRole("heading", { name: "Drills and practice plans" }),
  ).toBeVisible();
});

test("a genuine profile load failure offers retry and then opens setup", async ({
  page,
}) => {
  const state = await mockAccount(page, { ...incompleteProfile });
  state.failProfile = true;
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Profile unavailable" }),
  ).toBeVisible();
  await expect(page.getByLabel("First name", { exact: true })).toHaveCount(0);
  state.failProfile = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Complete your profile" }),
  ).toBeVisible();
});

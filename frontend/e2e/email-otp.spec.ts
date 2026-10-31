import { expect, test } from "@playwright/test";

test("email code sign-in uses backend CSRF and never stores Supabase credentials", async ({
  page,
}) => {
  let authenticated = false;
  let verifies = 0;
  await page.route("**/api/account/profile", (route) =>
    route.fulfill({
      json: {
        firstName: "Test",
        lastName: "Coach",
        email: "coach@example.com",
        isComplete: true,
      },
    }),
  );
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({
      json: { enabled: true, supabaseUrl: "https://otp-ui.supabase.co" },
    }),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        authenticated,
        email: authenticated ? "coach@example.com" : null,
        csrfToken: authenticated ? "signed-in-csrf" : "anonymous-csrf",
      },
    }),
  );
  await page.route("**/api/auth/email", (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("anonymous-csrf");
    expect(route.request().postDataJSON()).toEqual({
      email: "coach@example.com",
    });
    return route.fulfill({ status: 204 });
  });
  await page.route("**/api/auth/verify", (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("anonymous-csrf");
    expect(route.request().headers().authorization).toBeUndefined();
    expect(route.request().postDataJSON()).toEqual({
      email: "coach@example.com",
      code: "123456",
    });
    verifies++;
    if (verifies === 1)
      return route.fulfill({
        status: 401,
        json: { detail: "This code is invalid or has expired." },
      });
    authenticated = true;
    return route.fulfill({ status: 204 });
  });
  await page.addInitScript(() =>
    localStorage.setItem("sb-otp-ui-auth-token", "old-credentials"),
  );
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("coach@example.com");
  await page.getByRole("button", { name: "Send sign-in email" }).click();
  await expect(page.getByRole("button", { name: /Resend in/ })).toBeDisabled();
  await page.getByLabel("Sign-in code").fill("123 456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("invalid or has expired");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Drills and practice plans" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("sb-otp-ui-auth-token")),
  ).toBeNull();
});

test("old magic links show code sign-in without exchanging link credentials", async ({
  page,
}) => {
  let verifies = 0;
  await page.route("**/api/account/profile", (route) =>
    route.fulfill({
      json: {
        firstName: "Test",
        lastName: "Coach",
        email: "coach@example.com",
        isComplete: true,
      },
    }),
  );
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({
      json: { enabled: true, supabaseUrl: "https://otp-ui.supabase.co" },
    }),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: { authenticated: false, email: null, csrfToken: "otp-csrf" },
    }),
  );
  await page.route("**/api/auth/verify", (route) => {
    verifies++;
    return route.fulfill({ status: 400 });
  });
  await page.goto("/auth/callback#token_hash=" + "a".repeat(64));
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("button", { name: "Confirm sign in" }),
  ).toHaveCount(0);
  expect(verifies).toBe(0);
});

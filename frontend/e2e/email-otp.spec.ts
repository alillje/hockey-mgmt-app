import { expect, test } from "@playwright/test";

test("email sign-in verifies codes, handles retries and preserves magic-link options", async ({
  page,
}) => {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        supabaseUrl: "https://otp-ui.supabase.co",
        publishableKey: "sb_publishable_test",
      },
    }),
  );
  let sends = 0;
  let verifies = 0;
  await page.route("https://otp-ui.supabase.co/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON();
    if (path.endsWith("/otp")) {
      sends++;
      expect(body.email).toBe("coach@example.com");
      expect(body.create_user).toBe(false);
      expect(
        new URL(route.request().url()).searchParams.get("redirect_to"),
      ).toContain("/auth/callback");
      await route.fulfill({ json: {} });
    } else if (path.endsWith("/verify")) {
      verifies++;
      expect(body).toMatchObject({
        email: "coach@example.com",
        token: "123456",
        type: "email",
      });
      if (verifies > 1) {
        const user = {
          id: "11111111-1111-4111-8111-111111111111",
          email: "coach@example.com",
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        };
        const accessToken = [
          Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
            "base64url",
          ),
          Buffer.from(
            JSON.stringify({
              sub: user.id,
              exp: Math.floor(Date.now() / 1000) + 3600,
            }),
          ).toString("base64url"),
          "test-signature",
        ].join(".");
        await route.fulfill({
          json: {
            access_token: accessToken,
            refresh_token: "test-refresh",
            token_type: "bearer",
            expires_in: 3600,
            user,
          },
        });
        return;
      }
      await route.fulfill({
        status: 403,
        json: { code: "otp_expired", msg: "Token has expired or is invalid" },
      });
    } else await route.fulfill({ json: {} });
  });
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("coach@example.com");
  await page.getByRole("button", { name: "Send sign-in email" }).click();
  await expect(page.getByLabel("Sign-in code")).toBeVisible();
  await expect(
    page.getByText(/or use the magic link in the email/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Resend in/ })).toBeDisabled();
  await page.getByLabel("Sign-in code").fill("123 456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("invalid or has expired");
  expect(sends).toBe(1);
  expect(verifies).toBe(1);
  await page.getByRole("button", { name: "Use another email" }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Try again in/ }),
  ).toBeDisabled();
  await page.reload();
  await page.getByLabel("Email", { exact: true }).fill("coach@example.com");
  await page.getByRole("button", { name: "Send sign-in email" }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to your workspace" }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => !!localStorage.getItem("sb-otp-ui-auth-token")),
    )
    .toBe(true);
});

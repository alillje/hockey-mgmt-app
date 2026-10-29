import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("saved content stays text; drawing and PDF work under CSP", async ({
  page,
  request,
}) => {
  const violations: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) =>
      console.warn("CSP-VIOLATION:" + event.violatedDirective),
    );
  });
  page.on("console", (message) => {
    if (message.text().startsWith("CSP-VIOLATION:"))
      violations.push(message.text());
  });
  const title = '<img src=x onerror="window.__xss=1">';
  const notes = '<script>window.__xss=2</script> & "coaching notes"';
  const label = "<svg/onload=alert(1)>";
  const saved = await request.post("/api/drills", {
    data: {
      title,
      notes,
      categoryId: "skating",
      tags: ["Skating"],
      diagram: {
        version: 1,
        objects: [
          {
            id: randomUUID(),
            type: "player",
            x: 350,
            y: 250,
            rotation: 0,
            color: "#147e83",
            label,
          },
        ],
        paths: [],
      },
    },
  });
  expect(saved.ok()).toBe(true);
  const drill = await saved.json();
  const planResponse = await request.post("/api/trainings", {
    data: {
      title: '<svg onload="window.__xss=3">',
      notes,
      items: [{ drillId: drill.id, durationMinutes: 10, notes }],
      tags: [],
    },
  });
  expect(planResponse.ok()).toBe(true);
  const practice = await planResponse.json();
  try {
    const response = await page.goto("/drills/" + drill.id);
    expect(response?.headers()["content-security-policy"]).toContain(
      "script-src 'self'",
    );
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(notes, { exact: true })).toBeVisible();
    await expect(
      page.locator("svg text").getByText(label, { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator("img[src=x], script:not([src]), svg[onload]"),
    ).toHaveCount(0);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export to PDF" }).click();
    const file = await (await downloadPromise).path();
    expect(file).not.toBeNull();
    const pdf = await readFile(file!);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
    await page.getByRole("link", { name: "Edit drill", exact: true }).click();
    const rink = page.getByRole("img", { name: /Interactive hockey rink/ });
    await page.getByRole("button", { name: "Cone", exact: true }).click();
    await rink.click({ position: { x: 120, y: 120 } });
    await page.getByRole("button", { name: "Save drill", exact: true }).click();
    await expect(page).toHaveURL("/drills/" + drill.id);
    await page.goto("/practices/" + practice.id);
    await expect(
      page.getByRole("heading", { name: practice.title, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => (window as Window & { __xss?: number }).__xss),
    ).toBeUndefined();
    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await request.delete("/api/trainings/" + practice.id);
    await request.delete("/api/drills/" + drill.id);
  }
});

test("CSP blocks injected scripts, event handlers and evaluation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Plan your next practice." }),
  ).toBeVisible();
  // Run the probe as a real same-origin script. DevTools evaluation can bypass eval restrictions.
  await page.route("**/assets/csp-probe.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
      (async function () {
        const violations = [];
        const blocked = [];
        document.addEventListener("securitypolicyviolation", event => {
          violations.push(event.violatedDirective);
          blocked.push(event.blockedURI);
        });
        const inline = document.createElement("script");
        inline.textContent = "window.__inline = true";
        document.body.append(inline);
        const button = document.createElement("button");
        button.setAttribute("onclick", "window.__handler = true");
        document.body.append(button);
        button.click();
        let evalBlocked = false;
        try { window.eval("window.__evaluated = true"); } catch { evalBlocked = true; }
        const external = document.createElement("script");
        external.src = "https://example.invalid/xss.js";
        document.body.append(external);
        await new Promise(resolve => window.setTimeout(resolve, 100));
        window.__securityProbe = {
          inline: window.__inline, handler: window.__handler,
          evaluated: window.__evaluated, evalBlocked, violations, blocked
        };
      })();
    `,
    }),
  );
  await page.evaluate(() => {
    const probe = document.createElement("script");
    probe.src = "/assets/csp-probe.js";
    document.head.append(probe);
  });
  await page.waitForFunction(() => "__securityProbe" in window);
  const result = await page.evaluate(
    () =>
      (
        window as Window & {
          __securityProbe: {
            inline?: boolean;
            handler?: boolean;
            evaluated?: boolean;
            evalBlocked: boolean;
            violations: string[];
            blocked: string[];
          };
        }
      ).__securityProbe,
  );
  expect(result.inline).toBeUndefined();
  expect(result.handler).toBeUndefined();
  expect(result.evalBlocked).toBe(true);
  expect(result.evaluated).toBeUndefined();
  expect(result.violations).toContain("script-src-elem");
  expect(result.violations).toContain("script-src-attr");
  expect(result.blocked).toContain("https://example.invalid/xss.js");
});

test("About, OTP sign-in and logout work with the enforced CSP", async ({
  page,
}) => {
  let authenticated = false;
  const violations: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) =>
      console.warn("CSP-VIOLATION:" + event.violatedDirective),
    );
  });
  page.on("console", (message) => {
    if (message.text().startsWith("CSP-VIOLATION:"))
      violations.push(message.text());
  });
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({ json: { enabled: true, supabaseUrl: null } }),
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        authenticated,
        email: authenticated ? "coach@example.com" : null,
        csrfToken: "test-csrf",
      },
    }),
  );
  await page.route("**/api/auth/email", (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("test-csrf");
    return route.fulfill({ status: 204 });
  });
  await page.route("**/api/auth/verify", (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("test-csrf");
    authenticated = true;
    return route.fulfill({ status: 204 });
  });
  await page.route("**/api/auth/logout", (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("test-csrf");
    authenticated = false;
    return route.fulfill({ status: 204 });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "About IceWork" }).click();
  await expect(
    page.getByRole("heading", { name: "About Icework Hockey" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await page.getByLabel("Email", { exact: true }).fill("coach@example.com");
  await page.getByRole("button", { name: "Send sign-in email" }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Plan your next practice." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  expect(violations).toEqual([]);
});

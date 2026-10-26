import { expect, test } from "@playwright/test";

test.use({ hasTouch: true });

const base = "http://127.0.0.1:5280/api";
const diagram = { version: 1, objects: [], paths: [] };

test("saved drills and practices disable Save until a real edit is made", async ({
  page,
  request,
}) => {
  const drill = await (
    await request.post(`${base}/drills`, {
      data: {
        title: "Save state drill",
        categoryId: "skating",
        notes: "Original instructions",
        diagram,
      },
    })
  ).json();
  const practice = await (
    await request.post(`${base}/trainings`, {
      data: {
        title: "Save state practice",
        notes: "Original plan notes",
        items: [{ drillId: drill.id, durationMinutes: 10, notes: "Entry cue" }],
      },
    })
  ).json();
  try {
    for (const item of [
      {
        path: "drills",
        id: drill.id,
        title: drill.title,
        titleLabel: "Drill title",
        notesLabel: "Coaching notes",
        saveLabel: "Save drill",
      },
      {
        path: "practices",
        id: practice.id,
        title: practice.title,
        titleLabel: "Practice title",
        notesLabel: "Practice notes",
        saveLabel: "Save practice",
      },
    ]) {
      await page.goto(`/${item.path}/${item.id}`);
      const save = page.getByRole("button", {
        name: item.saveLabel,
        exact: true,
      });
      await expect(save).toBeDisabled();
      await page
        .getByLabel(item.titleLabel, { exact: true })
        .fill(item.title + " edited");
      await expect(save).toBeEnabled();
      await page.getByLabel(item.titleLabel, { exact: true }).fill(item.title);
      await expect(save).toBeDisabled();
      await page
        .getByLabel(item.notesLabel, { exact: true })
        .fill("Updated coaching details");
      await save.click();
      await expect(page.locator(".save-status")).toHaveText("Saved");
      await expect(save).toBeDisabled();
    }
  } finally {
    await request.delete(`${base}/trainings/${practice.id}`);
    await request.delete(`${base}/drills/${drill.id}`);
  }
});

test("account details and logout live on the account page and the brand replaces Home navigation", async ({
  page,
}) => {
  const user = {
    id: "a1234567-1234-4567-8123-123456789abc",
    email: "coach@example.test",
    aud: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        exp: expires,
        aud: "authenticated",
        role: "authenticated",
      }),
    ).toString("base64url"),
    "test-signature",
  ].join(".");
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        supabaseUrl: "https://account-ui.supabase.co",
        publishableKey: "sb_publishable_test",
      },
    }),
  );
  // All authentication is mocked for this UI test; it never contacts a real Supabase project.
  await page.route("https://account-ui.supabase.co/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("/user") ? user : {},
    }),
  );
  await page.addInitScript(
    ({ user, token, expires }) => {
      localStorage.setItem(
        "sb-account-ui-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "test-refresh",
          expires_at: expires,
          expires_in: 3600,
          token_type: "bearer",
          user,
        }),
      );
    },
    { user, token, expires },
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Plan your next practice." }),
  ).toBeVisible();
  await expect(page.getByRole("banner")).not.toContainText(user.email);
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).getByRole("link"),
  ).toHaveText(["Practices", "Drills"]);
  await expect(
    page.getByRole("link", { name: "Account", exact: true }),
  ).toHaveAttribute("aria-label", "Account");
  await expect(
    page.getByRole("link", { name: "Account", exact: true }),
  ).toHaveText("");
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Home", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your account" }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByText(user.email, { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Icework home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to your workspace" }),
  ).toBeVisible();
});

for (const width of [320, 390]) {
  test(`phone layout fits at ${width}px across libraries, account, and editors`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const organisation = await (
      await request.post(`${base}/workspace/organisations`, {
        data: { name: "Mobile organisation with a longer name" },
      })
    ).json();
    const orgHeaders = { "X-Organisation-Id": organisation.id };
    const team = await (
      await request.post(`${base}/workspace/teams`, {
        headers: orgHeaders,
        data: { name: "Mobile team with a longer name" },
      })
    ).json();
    const headers = { ...orgHeaders, "X-Team-Id": team.id };
    const drill = await (
      await request.post(`${base}/drills`, {
        headers,
        data: {
          title: "Mobile skating instructions for a complete practice session",
          categoryId: "skating",
          tags: ["Skating"],
          notes: "Reusable instructions for mobile viewing.",
          ageGroup: "U12",
          diagram,
        },
      })
    ).json();
    const practice = await (
      await request.post(`${base}/trainings`, {
        headers,
        data: {
          title: "Mobile practice plan",
          ageGroup: "U12",
          items: [
            {
              drillId: drill.id,
              durationMinutes: 10,
              notes: "Keep the practice-specific coaching cue.",
            },
          ],
        },
      })
    ).json();
    await request.post(`${base}/drills/${drill.id}/copy-to-library`, {
      headers,
    });
    await page.addInitScript(
      ({ orgId, teamId }) =>
        localStorage.setItem("icework:workspace", `${orgId}:${teamId}`),
      { orgId: organisation.id, teamId: team.id },
    );
    try {
      for (const path of [
        "/",
        "/drills",
        "/drills/all",
        "/club-library",
        "/account",
        "/organisation",
        `/practices/${practice.id}`,
        `/drills/${drill.id}`,
      ]) {
        await page.goto(path);
        await expect(
          page
            .getByRole("region", { name: "Current workspace" })
            .getByRole("combobox", { name: "Team", exact: true }),
        ).toHaveValue(team.id);
        await expect(page.getByText("Loading…", { exact: true })).toHaveCount(
          0,
        );
        await expect(
          page.getByRole("link", { name: "Account", exact: true }),
        ).toBeInViewport();
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          )
          .toBe(true);
      }
      expect(
        await page
          .locator('.tag-option input[type="checkbox"]')
          .evaluateAll((inputs) =>
            inputs.every((input) => {
              const bounds = input.getBoundingClientRect();
              return bounds.width <= 22 && bounds.height <= 22;
            }),
          ),
      ).toBe(true);
      await page.getByRole("button", { name: "Cone", exact: true }).click();
      const rink = page.getByRole("img", { name: /Interactive hockey rink/ });
      await rink.tap({ position: { x: 90, y: 70 } });
      await expect(
        page.getByRole("button", { name: "Save drill", exact: true }),
      ).toBeEnabled();
      await page
        .getByRole("button", { name: "Save drill", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Save drill", exact: true }),
      ).toBeDisabled();
      await page.screenshot({
        path: testInfo.outputPath(`mobile-editor-${width}.png`),
        fullPage: true,
      });
    } finally {
      await request.delete(`${base}/trainings/${practice.id}`, { headers });
      await request.delete(`${base}/drills/${drill.id}`, { headers });
    }
  });
}

test("content age checkboxes support multiple levels and select-all without a special age category", async ({
  page,
  request,
}) => {
  const catalog = await (await request.get(`${base}/catalog`)).json();
  const levels = catalog.ageGroups.map((group: { id: string }) => group.id);
  let drillId = "";
  let practiceId = "";
  try {
    await page.goto("/drills/new");
    const ages = page.getByRole("group", { name: "Age groups", exact: true });
    await expect(ages.getByRole("checkbox")).toHaveCount(levels.length + 1);
    await expect(ages.getByRole("checkbox", { checked: true })).toHaveCount(0);
    await ages.getByRole("checkbox", { name: "U8", exact: true }).check();
    await ages.getByRole("checkbox", { name: "U12", exact: true }).check();
    await page.getByRole("checkbox", { name: "Battling", exact: true }).check();
    const created = page.waitForResponse(
      (r) => r.url().endsWith("/api/drills") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save drill", exact: true }).click();
    const drill = await (await created).json();
    drillId = drill.id;
    expect(drill.ageGroups).toEqual(["U8", "U12"]);
    await expect(
      page.getByRole("button", { name: "Save drill", exact: true }),
    ).toBeDisabled();
    await ages
      .getByRole("checkbox", { name: "Select all age groups", exact: true })
      .check();
    const updated = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/drills/${drillId}`) &&
        response.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Save drill", exact: true }).click();
    expect((await updated).ok()).toBe(true);
    await expect(
      page.getByRole("button", { name: "Save drill", exact: true }),
    ).toBeDisabled();
    const all = await (await request.get(`${base}/drills/${drillId}`)).json();
    expect(all.ageGroups).toEqual(levels);
    expect(all.ageGroups).not.toContain("All ages");
    await page.goto("/practices/new");
    await ages.getByRole("checkbox", { name: "U18", exact: true }).check();
    await ages.getByRole("checkbox", { name: "U20", exact: true }).check();
    const planCreated = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/trainings") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Save practice", exact: true })
      .click();
    const plan = await (await planCreated).json();
    practiceId = plan.id;
    expect(plan.ageGroups).toEqual(["U18", "U20"]);
  } finally {
    if (practiceId) await request.delete(`${base}/trainings/${practiceId}`);
    if (drillId) await request.delete(`${base}/drills/${drillId}`);
  }
});

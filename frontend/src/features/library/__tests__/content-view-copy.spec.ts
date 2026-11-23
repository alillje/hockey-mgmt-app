import { expect, test } from "@playwright/test";

const base = "http://127.0.0.1:5280/api";

test("saved views expose top actions and copies open their view in the chosen destination", async ({
  page,
  request,
}) => {
  const org = await (
    await request.post(`${base}/workspace/organisations`, {
      data: { name: `View and copy ${Date.now()}` },
    })
  ).json();
  const orgHeaders = { "X-Organisation-Id": org.id };
  const sourceTeam = await (
    await request.post(`${base}/workspace/teams`, {
      headers: orgHeaders,
      data: { name: "Source team" },
    })
  ).json();
  const destination = await (
    await request.post(`${base}/workspace/teams`, {
      headers: orgHeaders,
      data: { name: "Destination team" },
    })
  ).json();
  const headers = { ...orgHeaders, "X-Team-Id": sourceTeam.id };
  const drill = await (
    await request.post(`${base}/drills`, {
      headers,
      data: {
        title: "View skating drill",
        categoryId: "skating",
        notes: "Reusable instructions",
        tags: ["Skating"],
        diagram: { version: 1, objects: [], paths: [] },
      },
    })
  ).json();
  const practice = await (
    await request.post(`${base}/trainings`, {
      headers,
      data: {
        title: "View practice",
        notes: "Practice overview notes",
        items: [
          { drillId: drill.id, durationMinutes: 8, notes: "First cue" },
          { drillId: drill.id, durationMinutes: 12, notes: "Second cue" },
        ],
      },
    })
  ).json();
  await page.addInitScript(
    ({ orgId, teamId }) =>
      localStorage.setItem("icework:workspace", `${orgId}:${teamId}`),
    { orgId: org.id, teamId: sourceTeam.id },
  );
  await page.route("**/api/account/preferences", (route) =>
    route.fulfill({ json: { defaultTeamId: sourceTeam.id } }),
  );
  await page.setViewportSize({ width: 390, height: 1100 });
  for (const item of [
    { kind: "drills", resource: "drills", label: "drill", source: drill },
    {
      kind: "practices",
      resource: "trainings",
      label: "practice",
      source: practice,
    },
  ]) {
    await page.goto(`/${item.kind}/${item.source.id}`);
    await expect(
      page.getByRole("heading", { name: item.source.title, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      await expect
        .poll(async () => {
          const bounds = await page.locator(".content-view").boundingBox();
          return bounds
            ? Math.abs(bounds.x - (width - bounds.x - bounds.width))
            : Infinity;
        })
        .toBeLessThan(2);
    }
    if (item.kind === "drills") {
      const rink = await page.locator(".content-rink > svg").boundingBox();
      expect(rink).not.toBeNull();
      expect(rink!.width / rink!.height).toBeCloseTo(2, 1);
    }
    await expect(
      page.getByRole("button", { name: `Save ${item.label}`, exact: true }),
    ).toHaveCount(0);
    const pdf = page.getByRole("button", {
      name: "Export to PDF",
      exact: true,
    });
    await expect(pdf).toBeInViewport();
    const download = page.waitForEvent("download");
    await pdf.click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Create copy", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const confirm = dialog.getByRole("button", {
      name: "Create copy",
      exact: true,
    });
    await expect(confirm).toBeDisabled();
    await expect(dialog.getByLabel("Destination").locator("option")).toHaveText(
      [
        "Choose a team or club…",
        `Team: ${destination.name}`,
        `Team: ${sourceTeam.name}`,
        `Club: ${org.name}`,
      ],
    );
    await dialog.getByLabel("Destination").selectOption(destination.id);
    if (item.kind === "practices")
      await expect(
        dialog.getByText(/All included drills will also be copied/),
      ).toBeVisible();
    const copied = page.waitForResponse((r) =>
      r.url().endsWith(`/${item.resource}/${item.source.id}/copy`),
    );
    let submitted = 0;
    const count = (r: import("@playwright/test").Request) => {
      if (r.url().endsWith(`/${item.resource}/${item.source.id}/copy`))
        submitted++;
    };
    page.on("request", count);
    await confirm.dblclick();
    const copy = await (await copied).json();
    page.off("request", count);
    expect(submitted).toBe(1);
    expect(copy.id).not.toBe(item.source.id);
    expect(copy.ownership.ownerTeamId).toBe(destination.id);
    await expect(page).toHaveURL(new RegExp(`/${item.kind}/${copy.id}$`));
    await expect(
      page.getByText(`Team: ${destination.name}`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    if (item.kind === "practices") {
      await expect(
        page.getByRole("heading", {
          name: `${drill.title} - Copy`,
          exact: true,
        }),
      ).toHaveCount(2);
      await expect(
        page.getByText("Drill no longer available", { exact: true }),
      ).toHaveCount(0);
      expect(copy.items[0].drillId).toBe(copy.items[1].drillId);
      expect(copy.items[0].drillId).not.toBe(drill.id);
      expect(
        copy.items.map((entry: { durationMinutes: number; notes: string }) => [
          entry.durationMinutes,
          entry.notes,
        ]),
      ).toEqual([
        [8, "First cue"],
        [12, "Second cue"],
      ]);
    }
    await page
      .getByRole("link", { name: `Edit ${item.label}`, exact: true })
      .click();
    const name = page.getByLabel(
      item.kind === "drills" ? "Drill name" : "Practice name",
      { exact: true },
    );
    await name.fill(`${item.source.title} copy`);
    await page
      .getByRole("button", { name: `Save ${item.label}`, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${item.kind}/${copy.id}$`));
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: `${item.source.title} copy`,
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/${item.kind}/${copy.id}$`));
    expect(
      (
        await (
          await request.get(`${base}/${item.resource}/${item.source.id}`, {
            headers,
          })
        ).json()
      ).title,
    ).toBe(item.source.title);
  }
});

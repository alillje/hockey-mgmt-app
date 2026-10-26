import { expect, test, type Route } from "@playwright/test";

const apiBase = "http://127.0.0.1:5280/api";

for (const path of ["/drills/new", "/practices/all"]) {
  test(`${path} waits for permissions and content before showing its page`, async ({
    page,
  }) => {
    let releaseWorkspace!: () => void;
    let releaseContent!: () => void;
    let workspaceRequested = false;
    const contentRequests = new Set<string>();
    const workspaceGate = new Promise<void>((resolve) => {
      releaseWorkspace = resolve;
    });
    const contentGate = new Promise<void>((resolve) => {
      releaseContent = resolve;
    });
    await page.route("**/api/workspace", async (route) => {
      workspaceRequested = true;
      await workspaceGate;
      await route.continue();
    });
    const holdContent = async (route: Route) => {
      contentRequests.add(new URL(route.request().url()).pathname);
      await contentGate;
      await route.fulfill({ json: [] });
    };
    await page.route("**/api/drills", holdContent);
    await page.route("**/api/trainings", holdContent);
    try {
      await page.goto(path);
      await expect.poll(() => workspaceRequested).toBe(true);
      await expect(
        page.getByRole("main", { name: "Loading workspace" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          name: /permission required|not found|No practices found/i,
        }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("combobox", { name: "Organisation", exact: true }),
      ).toHaveCount(0);
      releaseWorkspace();
      await expect.poll(() => contentRequests.size).toBe(2);
      await expect(
        page.getByRole("main", { name: "Loading workspace" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          name: /permission required|not found|No practices found/i,
        }),
      ).toHaveCount(0);
      releaseContent();
      if (path === "/drills/new") {
        await expect(
          page.getByRole("heading", { name: "Create new drill" }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { name: "Coaching notes", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText("Give the drill a purpose", { exact: true }),
        ).toHaveCount(0);
      } else {
        await expect(
          page.getByRole("heading", { name: "No practices found" }),
        ).toBeVisible();
      }
      await expect(
        page.getByRole("main", { name: "Loading workspace" }),
      ).toHaveCount(0);
    } finally {
      releaseWorkspace();
      releaseContent();
    }
  });
}

test("opening a practice from the bottom of search results starts at the top", async ({
  page,
  request,
}) => {
  let drillId = "";
  let practiceId = "";
  try {
    const drill = await (
      await request.post(`${apiBase}/drills`, {
        data: {
          title: "Scroll-test drill",
          categoryId: "skating",
          notes: "Instructions",
          diagram: { version: 1, objects: [], paths: [] },
        },
      })
    ).json();
    drillId = drill.id;
    const practice = await (
      await request.post(`${apiBase}/trainings`, {
        data: {
          title: "Scroll target practice",
          notes: "Practice notes",
          items: Array.from({ length: 12 }, () => ({
            drillId,
            durationMinutes: 5,
            notes: "Coaching cue",
          })),
        },
      })
    ).json();
    practiceId = practice.id;
    await page.route("**/api/trainings", (route) =>
      route.fulfill({
        json: [
          ...Array.from({ length: 30 }, (_, index) => ({
            ...practice,
            id: `11111111-1111-1111-1111-${String(index).padStart(12, "0")}`,
            title: `Scroll filler ${index}`,
          })),
          practice,
        ],
      }),
    );
    await page.goto("/practices/all");
    const link = page.getByRole("link", { name: /Scroll target practice/ });
    await link.scrollIntoViewIfNeeded();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(200);
    await link.click();
    await expect(
      page.getByRole("heading", { name: "Edit practice" }),
    ).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(
      page.getByRole("heading", { name: "Practice notes", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Set the tone for the session", { exact: true }),
    ).toHaveCount(0);
  } finally {
    if (practiceId) await request.delete(`${apiBase}/trainings/${practiceId}`);
    if (drillId) await request.delete(`${apiBase}/drills/${drillId}`);
  }
});

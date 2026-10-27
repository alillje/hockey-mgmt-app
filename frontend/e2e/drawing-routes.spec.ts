import { expect, test, type Page } from "@playwright/test";

const apiBase = "http://127.0.0.1:5280/api";

async function drawRoute(
  page: Page,
  tool: string,
  from: number,
  to: number,
  height = 0.5,
  bendHeight?: number,
) {
  await page.getByRole("button", { name: tool, exact: true }).click();
  const rink = page.locator(".rink-wrap svg");
  const bounds = await rink.boundingBox();
  if (!bounds) throw new Error("Rink is not visible");
  const y = bounds.y + bounds.height * height;
  await page.mouse.move(bounds.x + bounds.width * from, y);
  await page.mouse.down();
  if (bendHeight !== undefined) {
    await page.mouse.move(
      bounds.x + (bounds.width * (from + to)) / 2,
      bounds.y + bounds.height * bendHeight,
      { steps: 6 },
    );
  }
  await page.mouse.move(bounds.x + bounds.width * to, y, { steps: 10 });
  await page.mouse.up();
}

test("backwards skating, shots, and plain line styles save and render", async ({
  page,
  request,
}, testInfo) => {
  let drillId = "";
  try {
    await page.goto("/drills/new");
    await page.getByLabel("Drill name").fill("Route symbols browser check");
    await expect(
      page.getByRole("button", { name: "Skate with puck" }),
    ).toBeVisible();
    await drawRoute(page, "Skate backwards", 0.2, 0.35, 0.3);
    await drawRoute(page, "Shot", 0.55, 0.7, 0.45);
    await drawRoute(page, "Full line", 0.2, 0.35, 0.55);
    await drawRoute(page, "Dotted line", 0.55, 0.7, 0.65);
    await drawRoute(page, "Dashed line", 0.2, 0.35, 0.8);

    const routeShapes = page.locator(".rink-wrap g[data-id] > g");
    await expect(routeShapes).toHaveCount(5);
    await expect(routeShapes.first().locator("path").first()).toHaveAttribute(
      "d",
      /C /,
    );
    await expect(routeShapes.nth(1).locator("path")).toHaveCount(3);
    await expect(routeShapes.nth(1).locator("path").last()).toHaveAttribute(
      "d",
      "M-16 -8L14 0L-16 8",
    );
    await expect(routeShapes.nth(2).locator("path")).toHaveCount(1);
    await expect(routeShapes.nth(2).locator("path")).not.toHaveAttribute(
      "stroke-dasharray",
      /.+/,
    );
    await expect(routeShapes.nth(3).locator("path")).toHaveCount(1);
    await expect(routeShapes.nth(3).locator("path")).toHaveAttribute(
      "stroke-dasharray",
      "1 8",
    );
    await expect(routeShapes.nth(4).locator("path")).toHaveCount(1);
    await expect(routeShapes.nth(4).locator("path")).toHaveAttribute(
      "stroke-dasharray",
      "16 9",
    );
    await page.locator(".diagram-card").screenshot({
      path: testInfo.outputPath("drawing-routes.png"),
    });

    await page.getByRole("button", { name: "Save drill" }).click();
    await expect(page).toHaveURL(/\/drills\/[0-9a-f-]+$/);
    drillId = new URL(page.url()).pathname.split("/").at(-1)!;

    const response = await request.get(`${apiBase}/drills/${drillId}`);
    expect(response.ok()).toBe(true);
    const saved = await response.json();
    expect(
      saved.diagram.paths.map((route: { kind: string }) => route.kind),
    ).toEqual(["skatingBackward", "shooting", "solid", "dotted", "dashed"]);
    await page.reload();
    await page.getByRole("link", { name: "Edit drill", exact: true }).click();
    await expect(page.locator(".rink-wrap g[data-id] > g")).toHaveCount(5);
  } finally {
    if (drillId) await request.delete(`${apiBase}/drills/${drillId}`);
  }
});

test("passes and shots stay straight through a bent pointer gesture", async ({
  page,
  request,
}) => {
  let drillId = "";
  try {
    await page.goto("/drills/new");
    await page.getByLabel("Drill name").fill("Straight route browser check");
    await drawRoute(page, "Pass", 0.2, 0.35, 0.3, 0.55);
    await drawRoute(page, "Shot", 0.55, 0.7, 0.6, 0.3);
    await page.getByRole("button", { name: "Save drill" }).click();
    await expect(page).toHaveURL(/\/drills\/[0-9a-f-]+$/);
    drillId = new URL(page.url()).pathname.split("/").at(-1)!;
    const response = await request.get(`${apiBase}/drills/${drillId}`);
    expect(response.ok()).toBe(true);
    const saved = await response.json();
    expect(
      saved.diagram.paths.map((route: { kind: string }) => route.kind),
    ).toEqual(["passing", "shooting"]);
    expect(
      saved.diagram.paths.map(
        (route: { points: unknown[] }) => route.points.length,
      ),
    ).toEqual([2, 2]);
  } finally {
    if (drillId) await request.delete(`${apiBase}/drills/${drillId}`);
  }
});

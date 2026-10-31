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

test("plain lines stay straight and a box moves, undoes, saves and exports as one shape", async ({
  page,
  request,
}) => {
  let drillId = "";
  try {
    await page.goto("/drills/new");
    await page
      .getByLabel("Drill name")
      .fill(`Straight annotations ${Date.now()}`);
    for (const [index, tool] of [
      "Full line",
      "Dotted line",
      "Dashed line",
    ].entries()) {
      await drawRoute(page, tool, 0.2, 0.4, 0.2 + index * 0.12, 0.7);
    }
    await expect(page.getByRole("checkbox", { name: /arrows/i })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Box", exact: true }).click();
    const rink = page.locator(".rink-wrap svg");
    const bounds = await rink.boundingBox();
    if (!bounds) throw new Error("Rink is missing");
    await page.mouse.move(
      bounds.x + bounds.width * 0.7,
      bounds.y + bounds.height * 0.75,
    );
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width * 0.5,
      bounds.y + bounds.height * 0.55,
      { steps: 8 },
    );
    await page.mouse.up();
    const shapes = rink.locator("g[data-id]");
    await expect(shapes).toHaveCount(4);
    const box = shapes.last().locator(":scope > g > path");
    const original = await box.getAttribute("d");
    expect(original).toMatch(/^M .+ H .+ V .+ H .+ Z$/);
    await page.getByRole("button", { name: "Undo diagram change" }).click();
    await expect(shapes).toHaveCount(3);
    await page.getByRole("button", { name: "Redo diagram change" }).click();
    await expect(shapes).toHaveCount(4);
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page.mouse.move(
      bounds.x + bounds.width * 0.6,
      bounds.y + bounds.height * 0.55,
    );
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width * 0.63,
      bounds.y + bounds.height * 0.58,
      { steps: 6 },
    );
    await page.mouse.up();
    const moved = await box.getAttribute("d");
    expect(moved).not.toBe(original);
    await page.getByRole("button", { name: "Delete selected item" }).click();
    await expect(shapes).toHaveCount(3);
    await page.getByRole("button", { name: "Undo diagram change" }).click();
    await expect(shapes).toHaveCount(4);
    await expect(box).toHaveAttribute("d", moved!);
    await page.getByRole("button", { name: "Save drill", exact: true }).click();
    await expect(page).toHaveURL(/\/drills\/[0-9a-f-]+$/);
    drillId = page.url().split("/").at(-1)!;
    const saved = await (
      await request.get(`${apiBase}/drills/${drillId}`)
    ).json();
    expect(
      saved.diagram.paths.map((path: { kind: string }) => path.kind),
    ).toEqual(["solid", "dotted", "dashed", "box"]);
    for (const path of saved.diagram.paths) expect(path.points).toHaveLength(2);
    for (const path of saved.diagram.paths.slice(0, 3))
      expect(path.points[0].y).toBeCloseTo(path.points[1].y, 5);
    await page.reload();
    await expect(
      page.locator(`.content-rink path[d="${moved}"]`),
    ).toBeVisible();
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export to PDF", exact: true })
      .click();
    expect((await downloaded).suggestedFilename()).toMatch(/\.pdf$/);
  } finally {
    if (drillId) await request.delete(`${apiBase}/drills/${drillId}`);
  }
});

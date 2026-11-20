import { expect, test } from "@playwright/test";
import { animationFixture } from "./helpers/animationFixture";

const api = "http://127.0.0.1:5280/api";

test("half ice persists and changing rink size clears the drawing only after confirmation", async ({
  page,
  request,
}) => {
  const fixture = animationFixture();
  const data = {
    title: `Half ice ${Date.now()}`,
    categoryId: "skating",
    notes: "Keep these notes",
    diagram: {
      ...fixture.diagram,
      rinkSize: "half",
      paths: fixture.diagram.paths.slice(0, 2),
      animation: { version: 1, actions: fixture.actions.slice(0, 2) },
    },
  };
  const invalid = await request.post(`${api}/drills`, {
    data: {
      ...data,
      diagram: { ...data.diagram, paths: fixture.diagram.paths },
    },
  });
  expect(invalid.status()).toBe(400);
  const created = await request.post(`${api}/drills`, { data });
  expect(created.status()).toBe(201);
  const { id } = await created.json();

  try {
    await page.goto(`/drills/${id}`);
    await expect(page.locator(".content-rink > svg")).toHaveAttribute(
      "viewBox",
      "0 0 500 500",
    );
    await page.getByRole("button", { name: "View animation" }).click();
    const viewer = page.getByRole("dialog");
    await expect(viewer.locator(".animation-rink svg")).toHaveAttribute(
      "viewBox",
      "0 0 500 500",
    );
    await viewer.getByRole("button", { name: "Close animation" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export to PDF" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);

    await page.getByRole("link", { name: "Edit drill" }).click();
    const rinkSize = page.getByLabel("Rink size");
    const rink = page.locator(".rink-surface > svg");
    await expect(rinkSize).toHaveValue("half");
    await expect(
      rink.locator('g[transform="translate(0 500) rotate(-90)"]'),
    ).toHaveCount(1);
    await rinkSize.selectOption("full");
    const warning = page.getByRole("alertdialog", {
      name: "Switch rink size?",
    });
    await expect(warning).toContainText("animation");
    await warning.getByRole("button", { name: "Cancel" }).click();
    await expect(rinkSize).toHaveValue("half");
    await expect(rink.locator(`[data-id="${fixture.player}"]`)).toHaveCount(1);

    await page.getByRole("button", { name: "Full line", exact: true }).click();
    await rink.scrollIntoViewIfNeeded();
    const bounds = (await rink.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 80);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y - 10);
    await page.mouse.up();
    await expect(rink.locator("[data-id]")).toHaveCount(5);
    await expect(
      rink.locator("[data-id] > path[stroke='transparent']").last(),
    ).toHaveAttribute("d", /L 500 /);

    await rinkSize.selectOption("full");
    await warning.getByRole("button", { name: "Switch and clear" }).click();
    await expect(rink).toHaveAttribute("viewBox", "0 0 1000 500");
    await expect(rink.locator("[data-id]")).toHaveCount(0);
    await expect(page.getByLabel("Drill name")).toHaveValue(data.title);
    await expect(page.getByLabel("Drill notes")).toHaveValue(data.notes);
    await expect(
      page.getByRole("button", { name: "Undo diagram change" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Save drill", exact: true }).click();
    await expect(page).toHaveURL(`/drills/${id}`);
    await expect(
      page.getByRole("button", { name: "View animation" }),
    ).toHaveCount(0);
  } finally {
    await request.delete(`${api}/drills/${id}`);
  }
});

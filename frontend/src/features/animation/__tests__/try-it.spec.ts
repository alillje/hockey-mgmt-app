import { expect, test } from "@playwright/test";

test("visitors can draw and animate in the public demo without saving or exporting", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) {
      requests.push(request.url());
    }
  });

  await page.goto("/try?source=legacy#rink");
  await expect(page).toHaveURL(/\/draw-drill\?source=legacy#rink$/);
  await page.goto("/about");
  await expect(page).toHaveURL(/\/draw-drill$/);
  const banner = page.getByRole("banner");
  await expect(
    banner.getByRole("link", { name: "Icework home" }),
  ).toBeVisible();
  await expect(banner.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/",
  );
  await expect(
    page.getByRole("heading", { name: "Draw a drill" }),
  ).toBeVisible();
  await expect(page.getByText(/need a registered account/)).toBeVisible();
  const editor = page.getByRole("region", { name: "Drill diagram editor" });
  await editor
    .getByRole("button", { name: "Player", exact: true })
    .first()
    .click();
  const drawingRink = page.getByRole("img", {
    name: /Interactive hockey rink/,
  });
  await drawingRink.click({ position: { x: 150, y: 150 } });
  await page.locator(".animation-settings > summary").click();
  const drawing = page.getByRole("region", { name: "Draw animation" });
  const player = drawing.getByRole("button", { name: "Player 1" });
  await player.click();
  await drawing.getByRole("button", { name: "Skate", exact: true }).click();
  await player.scrollIntoViewIfNeeded();
  const bounds = (await player.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 110, y, { steps: 6 });
  await page.mouse.up();

  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(async () =>
      Number(await page.getByLabel("Animation position").inputValue()),
    )
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("button", { name: /save drill|export/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /save drill|export/i }),
  ).toHaveCount(0);
  await page.reload();
  await expect(editor.getByText("0 objects · 0 routes")).toBeVisible();
  expect(requests).toEqual([]);
});

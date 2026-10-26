import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const apiBase = "http://127.0.0.1:5280/api";

test("new equipment rotates, moves as one item, persists, and appears in practice PDFs", async ({
  page,
  request,
}, testInfo) => {
  const title = `Equipment drill ${Date.now()}`;
  let drillId = "";
  let practiceId = "";
  try {
    await page.goto("/drills/new");
    await page.getByLabel("Drill title", { exact: true }).fill(title);
    const rink = page.getByRole("img", { name: /Interactive hockey rink/ });
    const bounds = await rink.boundingBox();
    if (!bounds) throw new Error("Rink did not render.");
    const place = async (name: string, x: number, y: number, index = 0) => {
      await page.getByRole("button", { name, exact: true }).nth(index).click();
      await rink.click({
        position: { x: bounds.width * x, y: bounds.height * y },
      });
    };

    await place("Goal", 0.25, 0.35);
    const goal = rink.locator("[data-id]").first();
    const goalShape = goal.locator("g[transform]").first();
    const rotate = page.getByRole("button", {
      name: "Rotate selected goal 90 degrees",
      exact: true,
    });
    for (const degrees of [90, 180, 270, 0, 90]) {
      await rotate.click();
      await expect(goalShape).toHaveAttribute(
        "transform",
        new RegExp(`rotate\\(${degrees}\\)`),
      );
    }

    const rotation = page.getByRole("slider", { name: "Goal rotation" });
    for (const degrees of [0, 90, 180, 270, 360]) {
      await rotation.fill(String(degrees));
      await expect(rotation).toHaveValue(String(degrees));
      await expect(goalShape).toHaveAttribute(
        "transform",
        new RegExp(`rotate\\(${degrees}\\)`),
      );
      await expect(page.locator(".tool-settings output")).toHaveText(
        `${degrees}°`,
      );
    }
    await rotation.focus();
    await rotation.press("ArrowRight");
    await expect(rotation).toHaveValue("360");
    await rotation.press("ArrowLeft");
    await expect(rotation).toHaveValue("270");
    await rotation.fill("90");

    await place("Tire", 0.45, 0.35);
    const tire = rink
      .locator("[data-id]")
      .nth(1)
      .locator("g[transform]")
      .first();
    await place("Small tire", 0.58, 0.35);
    const smallTire = rink
      .locator("[data-id]")
      .nth(2)
      .locator("g[transform]")
      .first();
    const tireBounds = await tire.boundingBox();
    const smallBounds = await smallTire.boundingBox();
    if (!tireBounds || !smallBounds)
      throw new Error("Tire shapes did not render.");
    expect(smallBounds.width / tireBounds.width).toBeCloseTo(0.5, 2);
    expect(smallBounds.height / tireBounds.height).toBeCloseTo(0.5, 2);

    await place("Puck pile", 0.35, 0.7);
    await expect(rink.locator("[data-id]")).toHaveCount(4);
    const pile = rink.locator("[data-id]").nth(3);
    const pileId = await pile.getAttribute("data-id");
    expect(await pile.locator("ellipse").count()).toBeGreaterThan(1);
    await page.getByRole("button", { name: "Undo diagram change" }).click();
    await expect(rink.locator("[data-id]")).toHaveCount(3);
    await page.getByRole("button", { name: "Redo diagram change" }).click();
    await expect(rink.locator("[data-id]")).toHaveCount(4);
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await pile.scrollIntoViewIfNeeded();
    const puck = await pile.locator("ellipse").first().boundingBox();
    if (!puck) throw new Error("Pile puck did not render.");
    await page.mouse.move(puck.x + puck.width / 2, puck.y + puck.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      puck.x + puck.width / 2 + 45,
      puck.y + puck.height / 2 + 15,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect(rink.locator("[data-id]")).toHaveCount(4);

    await expect(
      page.getByRole("button", { name: "Player", exact: true }),
    ).toHaveCount(2);
    await place("Player", 0.75, 0.65, 1);

    const savedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/drills") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save drill", exact: true }).click();
    const saved = await (await savedResponse).json();
    drillId = saved.id;
    expect(saved.diagram.objects).toHaveLength(5);
    expect(
      saved.diagram.objects.find(
        (item: { type: string }) => item.type === "goal",
      ).rotation,
    ).toBe(90);
    expect(
      saved.diagram.objects.find(
        (item: { type: string }) => item.type === "player",
      ).color,
    ).toBe("#dc3545");
    expect(
      saved.diagram.objects.find(
        (item: { type: string }) => item.type === "smallTire",
      ),
    ).toBeTruthy();
    const savedPile = saved.diagram.objects.find(
      (item: { type: string }) => item.type === "puckPile",
    );
    expect(savedPile.id).toBe(pileId);
    expect(savedPile.x).toBeGreaterThan(350);
    await page.reload();
    await expect(rink.locator("[data-id]")).toHaveCount(5);
    await page.screenshot({
      path: testInfo.outputPath("rink-equipment.png"),
      fullPage: true,
    });

    const practiceResponse = await request.post(`${apiBase}/trainings`, {
      data: {
        title: `Equipment practice ${Date.now()}`,
        notes: "Bring a puck pile and both tire sizes.",
        tags: ["Skating"],
        items: [{ drillId, durationMinutes: 12, notes: "" }],
      },
    });
    expect(practiceResponse.ok()).toBe(true);
    practiceId = (await practiceResponse.json()).id;
    await page.goto(`/practices/${practiceId}`);
    await expect(
      page.getByRole("img", { name: `Rink preview: ${title}`, exact: true }),
    ).toBeVisible();
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    const file = await (await downloadEvent).path();
    if (!file) throw new Error("Practice PDF was not downloaded.");
    const pdf = await readFile(file);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
    expect(pdf.toString("latin1")).toContain("Bring a puck pile");
  } finally {
    if (practiceId) await request.delete(`${apiBase}/trainings/${practiceId}`);
    if (drillId) await request.delete(`${apiBase}/drills/${drillId}`);
  }
});

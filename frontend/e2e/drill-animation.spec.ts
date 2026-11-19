import { readFile } from "node:fs/promises";
import { expect, test, type Locator } from "@playwright/test";
import { animationFixture } from "./helpers/animationFixture";

const api = "http://127.0.0.1:5280/api";
test("animation stays optional, is saved explicitly, plays on request and downloads a local GIF", async ({
  page,
  request,
}, testInfo) => {
  const fixture = animationFixture();
  const created = await request.post(`${api}/drills`, {
    data: {
      title: `Animated drill ${Date.now()}`,
      categoryId: "skating",
      notes: "Drill instructions",
      tags: [],
      diagram: fixture.diagram,
    },
  });
  expect(created.ok()).toBe(true);
  const drill = await created.json();
  let practiceId = "";
  try {
    await page.goto(`/drills/${drill.id}`);
    await expect(
      page.getByRole("button", { name: "View animation" }),
    ).toHaveCount(0);
    await page.getByRole("link", { name: "Edit drill", exact: true }).click();
    await expect(page.getByLabel("Action 1 marker")).toHaveCount(0);
    await page.locator("summary").filter({ hasText: "Animation" }).click();
    const drawing = page.getByRole("region", { name: "Draw animation" });
    await expect(drawing.getByText("Puck 1", { exact: true })).toBeVisible();
    await drawing
      .getByRole("button", { name: "Player 1", exact: true })
      .click();
    await drawing
      .getByRole("button", { name: "Skate with puck", exact: true })
      .click();
    const rink = drawing.locator("svg[aria-label='Animation drawing rink']");
    async function drag(from: number[], to: number[]) {
      await rink.scrollIntoViewIfNeeded();
      const points = await rink.evaluate(
        (element, coordinates) => {
          const matrix = (element as SVGSVGElement).getScreenCTM()!;
          return coordinates.map(([x, y]) => {
            const point = new DOMPoint(x, y).matrixTransform(matrix);
            return { x: point.x, y: point.y };
          });
        },
        [from, to],
      );
      await page.mouse.move(points[0].x, points[0].y);
      await page.mouse.down();
      await page.mouse.move(points[1].x, points[1].y, { steps: 8 });
      await page.mouse.up();
    }
    await drag([100, 250], [200, 250]);
    await drawing.getByRole("button", { name: "Pass", exact: true }).click();
    await drag([200, 250], [400, 258]);
    await drawing.getByRole("button", { name: "Shot", exact: true }).click();
    await drag([400, 258], [800, 258]);
    await expect(page.getByLabel("Action 1 seconds")).toBeHidden();
    await page.getByText("Adjust animation", { exact: true }).click();
    await expect(page.getByLabel("Action 2 seconds")).toHaveValue("0.75");
    await expect(page.getByLabel("Action 2 marker")).toHaveValue(
      fixture.player,
    );
    await expect(page.getByLabel("Action 2 puck")).toHaveValue(fixture.puck);
    await page.getByLabel("Action 1 seconds").fill("0.5");
    await expect(page.getByLabel("Action 3 seconds")).toHaveValue("0.5");
    await page.getByRole("button", { name: "Save drill", exact: true }).click();
    await expect(page).toHaveURL(`/drills/${drill.id}`);
    await page.reload();
    const saved = await (await request.get(`${api}/drills/${drill.id}`)).json();
    expect(saved.diagram.animation.actions).toHaveLength(3);
    expect(saved.diagram.objects).toEqual(fixture.diagram.objects);
    expect(saved.diagram.paths.slice(0, 3)).toEqual(fixture.diagram.paths);
    expect(saved.diagram.paths).toHaveLength(6);
    const writes: string[] = [];
    page.on("request", (req) => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method()))
        writes.push(req.url());
    });
    await page.getByRole("button", { name: "View animation" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Puck 1", { exact: true })).toHaveCount(0);
    await dialog.screenshot({
      path: testInfo.outputPath("animation-dialog.png"),
    });
    await expect(
      dialog.getByRole("button", { name: "Play", exact: true }),
    ).toBeVisible();
    await expect(dialog.getByLabel("Animation position")).toHaveValue("0");
    await page.waitForTimeout(150);
    await expect(dialog.getByLabel("Animation position")).toHaveValue("0");
    await dialog.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(async () =>
        Number(await dialog.getByLabel("Animation position").inputValue()),
      )
      .toBeGreaterThan(0);
    await dialog.getByRole("button", { name: "Restart animation" }).click();
    await expect(dialog.getByLabel("Animation position")).toHaveValue("0");
    await dialog.getByLabel("Animation position").fill("1.75");
    const puckAtEnd = dialog
      .locator(".animation-rink svg > g[transform]")
      .last();
    await expect
      .poll(async () => {
        const position = await puckAtEnd.getAttribute("transform");
        return Math.abs(Number(position?.match(/translate\((\S+)/)?.[1]) - 800);
      })
      .toBeLessThan(2);
    await dialog
      .getByRole("button", { name: "Export GIF", exact: true })
      .click();
    await expect(
      dialog.getByRole("link", { name: "Save GIF", exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      dialog.getByRole("img", { name: `GIF animation of ${drill.title}` }),
    ).toHaveCount(0);
    const download = page.waitForEvent("download");
    await dialog.getByRole("link", { name: "Save GIF", exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.gif$/);
    const bytes = await readFile((await file.path())!);
    expect(bytes.subarray(0, 6).toString()).toBe("GIF89a");
    expect(bytes.readUInt16LE(6)).toBe(800);
    expect(bytes.readUInt16LE(8)).toBe(440);
    expect(bytes.at(-1)).toBe(0x3b);
    await dialog
      .getByRole("button", { name: "Preview GIF", exact: true })
      .click();
    const image = dialog.getByRole("img", {
      name: `GIF animation of ${drill.title}`,
    });
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate((element: HTMLImageElement) => element.naturalWidth),
      )
      .toBe(800);
    expect(writes).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await dialog.getByRole("button", { name: "Close animation" }).click();
    await expect(dialog).toHaveCount(0);
    const exported = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export to PDF", exact: true })
      .click();
    expect((await exported).suggestedFilename()).toMatch(/\.pdf$/);
    const practice = await request.post(`${api}/trainings`, {
      data: {
        title: `Animation practice ${Date.now()}`,
        items: [{ drillId: drill.id, durationMinutes: 10, notes: "" }],
        tags: [],
      },
    });
    practiceId = (await practice.json()).id;
    await page.goto(`/practices/${practiceId}`);
    await page.getByRole("button", { name: "View animation" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  } finally {
    if (practiceId) await request.delete(`${api}/trainings/${practiceId}`);
    await request.delete(`${api}/drills/${drill.id}`);
  }
});

test("closing the dialog cancels GIF work and referenced drawing parts cannot be deleted accidentally", async ({
  page,
  request,
}) => {
  const fixture = animationFixture();
  const created = await request.post(`${api}/drills`, {
    data: {
      title: `Cancel animation ${Date.now()}`,
      categoryId: "skating",
      notes: "",
      diagram: {
        ...fixture.diagram,
        animation: {
          version: 1,
          actions: [{ ...fixture.actions[0], durationSeconds: 10 }],
        },
      },
    },
  });
  const drill = await created.json();
  try {
    await page.goto(`/drills/${drill.id}`);
    await page.getByRole("button", { name: "View animation" }).click();
    await page.getByRole("button", { name: "Export GIF", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Generating GIF");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Export GIF", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Export GIF", exact: true }).click();
    await page.getByRole("button", { name: "Close animation" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("link", { name: "Edit drill", exact: true }).click();
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page.locator(`.rink-wrap g[data-id="${fixture.player}"]`).click();
    await page.getByRole("button", { name: "Delete selected item" }).click();
    await expect(page.getByRole("status")).toContainText(
      "used by the animation",
    );
    await expect(
      page.locator(`.rink-wrap g[data-id="${fixture.player}"]`),
    ).toHaveCount(1);
    await page.locator("summary").filter({ hasText: "Animation" }).click();
    await page.getByText("Adjust animation", { exact: true }).click();
    await page
      .getByRole("button", { name: "Clear animation", exact: true })
      .click();
    await page.getByRole("button", { name: "Save drill", exact: true }).click();
    await expect(page).toHaveURL(`/drills/${drill.id}`);
    await expect(
      page.getByRole("button", { name: "View animation" }),
    ).toHaveCount(0);
    const saved = await (await request.get(`${api}/drills/${drill.id}`)).json();
    expect(saved.diagram.animation).toBeNull();
    expect(saved.diagram.objects).toEqual(fixture.diagram.objects);
  } finally {
    await request.delete(`${api}/drills/${drill.id}`);
  }
});

test("drawn puck movements use the starting player and preserve the selected tool", async ({
  page,
  request,
}) => {
  const fixture = animationFixture();
  const players = [150, 450, 750].map((x) => ({
    ...fixture.diagram.objects[0],
    id: crypto.randomUUID(),
    x,
  }));
  const created = await request.post(`${api}/drills`, {
    data: {
      title: `Puck movements ${Date.now()}`,
      categoryId: "skating",
      notes: "",
      diagram: { version: 1, objects: players, paths: [] },
    },
  });
  expect(created.ok()).toBe(true);
  const drill = await created.json();
  try {
    await page.goto(`/drills/${drill.id}/edit`);
    await page.locator(".animation-settings > summary").click();
    const drawing = page.getByRole("region", { name: "Draw animation" });
    const rink = drawing.getByLabel("Animation drawing rink");
    const tool = (name: string) =>
      drawing.getByRole("button", { name, exact: true });
    async function drag(x: number, endX: number, endY: number) {
      await rink.scrollIntoViewIfNeeded();
      const bounds = (await rink.boundingBox())!;
      await page.mouse.move(
        bounds.x + (x / 1000) * bounds.width,
        bounds.y + bounds.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        bounds.x + (endX / 1000) * bounds.width,
        bounds.y + (endY / 500) * bounds.height,
        { steps: 8 },
      );
      await page.mouse.up();
    }
    await tool("Player 1").click();
    await tool("Pass").click();
    await drag(450, 560, 250);
    await expect(tool("Player 2")).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByText("Preview animation", { exact: true }).locator(".."),
    ).toHaveAttribute("open", "");
    await tool("Undo animation drawing change").click();
    await expect(tool("Puck 1")).toHaveCount(0);
    await tool("Redo animation drawing change").click();

    await drag(150, 250, 250);
    await tool("Skate with puck").click();
    await drag(450, 450, 350);
    await expect(tool("Skate with puck")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await tool("Shot").click();
    await drag(750, 865, 250);
    await page.getByText("Adjust animation", { exact: true }).click();
    const startsTogether = (index: number) =>
      page.locator(".animation-action").nth(index).getByRole("checkbox", {
        name: "Keep this move in the same step",
      });
    await startsTogether(1).click();
    await expect(startsTogether(1)).toBeChecked();
    await startsTogether(2).click();
    await expect(startsTogether(2)).not.toBeChecked();
    await expect(
      page.getByText(
        "Action 3 uses a player or puck already used in this group.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save drill", exact: true }).click();
    await expect(page).toHaveURL(`/drills/${drill.id}`);
    const saved = await (await request.get(`${api}/drills/${drill.id}`)).json();
    const { objects, paths, animation } = saved.diagram;
    expect(
      animation.actions.map(
        (action: { startWithPrevious?: boolean }) => !!action.startWithPrevious,
      ),
    ).toEqual([false, true, false, false]);
    expect(paths.map((path: { kind: string }) => path.kind)).toEqual([
      "passing",
      "passing",
      "puckHandling",
      "shooting",
    ]);
    expect(
      animation.actions.map((action: { objectId: string }) => action.objectId),
    ).toEqual([players[1].id, players[0].id, players[1].id, players[2].id]);
    expect(objects.slice(3).map((puck: { x: number }) => puck.x)).toEqual([
      450, 150, 450, 750,
    ]);
    expect(
      new Set(
        animation.actions.map((action: { puckId: string }) => action.puckId),
      ).size,
    ).toBe(4);
    expect(
      paths.map((path: { points: { x: number }[] }) => path.points[0].x),
    ).toEqual([450, 150, 450, 750]);
  } finally {
    await request.delete(`${api}/drills/${drill.id}`);
  }
});

test("a full 30-second animation exports a GIF in a phone-sized viewport", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = animationFixture();
  const created = await request.post(`${api}/drills`, {
    data: {
      title: `Full animation ${Date.now()}`,
      categoryId: "skating",
      notes: "",
      diagram: {
        ...fixture.diagram,
        animation: {
          version: 1,
          actions: Array.from({ length: 24 }, () => ({
            id: crypto.randomUUID(),
            objectId: fixture.player,
            pathId: fixture.skate,
            puckId: fixture.puck,
            durationSeconds: 1.25,
          })),
        },
      },
    },
  });
  expect(created.status()).toBe(201);
  const drill = await created.json();
  try {
    await page.goto(`/drills/${drill.id}`);
    await page.getByRole("button", { name: "View animation" }).click();
    const dialog = page.getByRole("dialog");
    const started = Date.now();
    await dialog
      .getByRole("button", { name: "Export GIF", exact: true })
      .click();
    const save = dialog.getByRole("link", { name: "Save GIF", exact: true });
    await expect(save).toBeVisible({ timeout: 90_000 });
    const elapsed = Date.now() - started;
    const pending = page.waitForEvent("download");
    await save.click();
    const bytes = await readFile((await (await pending).path())!);
    expect(bytes.subarray(0, 6).toString()).toBe("GIF89a");
    expect(bytes.at(-1)).toBe(0x3b);
    await testInfo.attach("Full GIF export measurement", {
      body: `${elapsed} ms, ${bytes.length} bytes`,
      contentType: "text/plain",
    });
  } finally {
    await request.delete(`${api}/drills/${drill.id}`);
  }
});

test("add two passes after drawing the three skating routes", async ({
  page,
  request,
}) => {
  page.setDefaultTimeout(10_000);
  const fixture = animationFixture();
  const lanes = [120, 250, 380];
  const objects = lanes.map((y) => ({
    ...fixture.diagram.objects[0],
    id: crypto.randomUUID(),
    x: 100,
    y,
  }));
  objects.push({
    id: crypto.randomUUID(),
    type: "goal",
    x: 800,
    y: 250,
    rotation: 0,
    color: "#bb2d3b",
    label: "",
  });
  const created = await request.post(`${api}/drills`, {
    data: {
      title: `Three skaters ${Date.now()}`,
      categoryId: "skating",
      notes: "",
      diagram: {
        version: 1,
        objects,
        paths: [],
      },
    },
  });
  expect(created.status()).toBe(201);
  const drill = await created.json();
  try {
    await page.goto(`/drills/${drill.id}/edit`);
    await page.locator(".animation-settings > summary").click();
    async function dragPass(
      rink: Locator,
      from: [number, number],
      to: [number, number],
    ) {
      await rink.scrollIntoViewIfNeeded();
      const [start, end] = await rink.evaluate(
        (svg: SVGSVGElement, points) =>
          points.map(([x, y]) => {
            const screen = new DOMPoint(x, y).matrixTransform(
              svg.getScreenCTM()!,
            );
            return { x: screen.x, y: screen.y };
          }),
        [from, to],
      );
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 10 });
      await page.mouse.up();
    }
    const drawing = page.getByRole("region", { name: "Draw animation" });
    const drawingRink = drawing.getByLabel("Animation drawing rink");
    await drawing
      .getByRole("button", { name: "Player 1", exact: true })
      .click();
    await dragPass(drawingRink, [100, 120], [500, 120]);
    await drawing
      .getByRole("button", { name: "Draw in this step", exact: true })
      .click();
    await dragPass(drawingRink, [100, 250], [500, 250]);
    await dragPass(drawingRink, [100, 380], [500, 380]);
    await page
      .getByRole("button", { name: "Pass between skaters", exact: true })
      .click();
    const editor = page.locator(".animation-pass-editor");
    await expect(
      editor.locator('[data-animation-equipment="goal"]'),
    ).toBeVisible();
    const rink = editor.getByLabel("Draw a pass between skating routes");
    await dragPass(rink, [200, 262], [310, 365]);
    await expect(editor.getByRole("alert")).toContainText(
      "End the pass on another",
    );
    await expect(
      editor.getByRole("button", { name: "Cancel pass" }),
    ).toBeVisible();
    await rink.press("Escape");
    await expect(
      editor.getByRole("button", { name: "Cancel pass" }),
    ).toHaveCount(0);
    await dragPass(rink, [200, 262], [310, 365]);
    await dragPass(rink, [310, 380], [310, 380]);
    await expect(
      editor.getByText("Player 2 to Player 3 at 0.5 s"),
    ).toBeVisible();
    await expect(
      editor.getByText("Drag from Player 3’s highlighted route", {
        exact: false,
      }),
    ).toBeVisible();
    await dragPass(rink, [260, 380], [430, 120]);
    await expect(editor.getByRole("alert")).toContainText(
      "after the sender has the puck",
    );
    await dragPass(rink, [360, 380], [360, 120]);
    await expect(
      editor.getByText("Player 3 to Player 1 at 1.5 s"),
    ).toBeVisible();

    await expect(
      editor.getByRole("combobox", { name: "Pass 1 speed" }),
    ).toHaveValue("0.75");
    await editor
      .getByRole("combobox", { name: "Pass 1 speed" })
      .selectOption({ label: "Slow" });
    await expect(editor.getByText("1.15 s in flight")).toBeVisible();
    await page.getByText("Adjust animation", { exact: true }).click();
    const groupSeconds = page.getByLabel("Action 1 seconds");
    await groupSeconds.fill("");
    await expect(groupSeconds).toHaveValue("");
    await groupSeconds.fill("1");
    await groupSeconds.press("Enter");
    await expect(page.getByLabel("Action 2 seconds")).toHaveValue("1");
    await groupSeconds.fill("3");
    await groupSeconds.press("Enter");
    await expect(page.getByLabel("Action 2 seconds")).toHaveValue("3");
    await expect(page.getByLabel("Action 3 seconds")).toHaveValue("3");

    await page.getByRole("button", { name: "Save drill", exact: true }).click();
    await expect(page).toHaveURL(`/drills/${drill.id}`);
    const saved = await (await request.get(`${api}/drills/${drill.id}`)).json();
    expect(saved.diagram.paths).toHaveLength(3);
    await expect(
      page.locator('.content-rink svg path[stroke-dasharray="10 8"]'),
    ).toHaveCount(2);
    const actions = saved.diagram.animation.actions;
    expect(
      actions.map(
        (action: { startWithPrevious: boolean }) => action.startWithPrevious,
      ),
    ).toEqual([false, true, true]);
    expect(
      saved.diagram.objects.filter(
        (object: { type: string }) => object.type === "puck",
      ),
    ).toHaveLength(1);
    expect(
      saved.diagram.animation.actions.map(
        (action: { durationSeconds: number }) => action.durationSeconds,
      ),
    ).toEqual([3, 3, 3]);
    const passes = saved.diagram.animation.actions[1].skatingPassChain.passes;
    expect(
      passes.map((pass: { receiverActionId: string }) => pass.receiverActionId),
    ).toEqual([actions[2].id, actions[0].id]);
    expect(passes[0].flightSeconds).toBe(1.15);
    expect(passes[1].flightSeconds).toBe(0.75);
    expect(passes[0].receiveFraction).toBeCloseTo(0.525, 2);
    expect(passes[1].receiveFraction).toBeCloseTo(0.65, 2);
  } finally {
    await request.delete(`${api}/drills/${drill.id}`);
  }
});

test("a drawn skate remains committed if the rink loses pointer capture", async ({
  page,
  request,
}) => {
  const { diagram } = animationFixture();
  const created = await request.post(`${api}/drills`, {
    data: {
      title: `Captured skate ${Date.now()}`,
      categoryId: "skating",
      notes: "",
      diagram: { ...diagram, objects: [diagram.objects[0]], paths: [] },
    },
  });
  expect(created.status()).toBe(201);
  const drill = await created.json();
  try {
    await page.goto(`/drills/${drill.id}/edit`);
    await page.locator(".animation-settings > summary").click();
    const drawing = page.getByRole("region", { name: "Draw animation" });
    await drawing
      .getByRole("button", { name: "Player 1", exact: true })
      .click();
    const rink = drawing.getByLabel("Animation drawing rink");
    await rink.scrollIntoViewIfNeeded();
    const [start, end] = await rink.evaluate((svg: SVGSVGElement) => {
      let pointerId: number;
      svg.addEventListener("pointerdown", (event) => {
        pointerId = event.pointerId;
      });
      svg.addEventListener("tracking-test-release", () => {
        svg.releasePointerCapture(pointerId);
      });
      const matrix = svg.getScreenCTM()!;
      return [100, 350].map((x) => {
        const point = new DOMPoint(x, 250).matrixTransform(matrix);
        return { x: point.x, y: point.y };
      });
    });
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await rink.dispatchEvent("tracking-test-release");
    await page.mouse.move(end.x + 5, end.y);
    await page.mouse.up();
    await expect(
      drawing.getByRole("button", { name: "Undo animation drawing change" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Save drill", exact: true }).click();
    await expect(page).toHaveURL(`/drills/${drill.id}`);
    const { diagram: saved } = await (
      await request.get(`${api}/drills/${drill.id}`)
    ).json();
    expect(saved.animation.actions).toHaveLength(1);
    expect(saved.paths[0].kind).toBe("skating");
    expect(saved.paths[0].points.at(-1).x).toBeCloseTo(350, 0);
  } finally {
    await request.delete(`${api}/drills/${drill.id}`);
  }
});

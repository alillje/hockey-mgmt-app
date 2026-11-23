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
    const preset = page.getByLabel("Action 1 duration preset");
    await expect(preset.locator("option")).toHaveText([
      "Presets",
      "0.5 s",
      "1 s",
      "2 s",
    ]);
    await preset.selectOption("0.5");
    await expect(page.getByLabel("Action 1 seconds")).toHaveValue("0.5");
    const shotSeconds = page.getByLabel("Action 3 seconds");
    await expect(shotSeconds).toHaveValue("0.5");
    await shotSeconds.fill("1,2");
    await shotSeconds.press("Enter");
    await expect(shotSeconds).toHaveValue("1.2");
    await shotSeconds.fill("10");
    await shotSeconds.press("Enter");
    await expect(shotSeconds).toHaveValue("10");
    await shotSeconds.fill("");
    await shotSeconds.pressSequentially("0,1");
    await shotSeconds.press("Enter");
    await expect(shotSeconds).toHaveValue("0.1");
    await shotSeconds.fill("10");
    await shotSeconds.press("Enter");
    await shotSeconds.fill("");
    await shotSeconds.pressSequentially("0.1");
    await page.getByRole("button", { name: "Save drill", exact: true }).click();
    await expect(page).toHaveURL(`/drills/${drill.id}`);
    await page.reload();
    const saved = await (await request.get(`${api}/drills/${drill.id}`)).json();
    expect(saved.diagram.animation.actions).toHaveLength(3);
    expect(saved.diagram.animation.actions[2].durationSeconds).toBe(0.1);
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
    await dialog.getByLabel("Animation position").fill("1.35");
    const puckAtEnd = dialog
      .locator(".animation-rink svg > g[transform]")
      .last();
    await expect
      .poll(async () => {
        const position = await puckAtEnd.getAttribute("transform");
        return Math.abs(Number(position?.match(/translate\((\S+)/)?.[1]) - 800);
      })
      .toBeLessThan(2);
    const routes = dialog.getByRole("checkbox", {
      name: "Hide all arrows and lines",
    });
    const routeLines = dialog.locator('.animation-rink g[stroke="#b9c6ca"]');
    await expect(routes).not.toBeChecked();
    await expect(routeLines.first()).toBeVisible();
    await routes.check();
    await expect(routeLines).toHaveCount(0);
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
    await routes.uncheck();
    await expect(dialog.getByRole("link", { name: "Save GIF" })).toHaveCount(0);
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
      .getByRole("button", { name: "Pass between players", exact: true })
      .click();
    const editor = page.locator(".animation-pass-editor");
    await expect(
      editor.locator('[data-animation-equipment="goal"]'),
    ).toBeVisible();
    const rink = editor.getByLabel("Draw a pass between players");
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

test("a receiver skates and shoots with the same puck in later steps", async ({
  page,
  request,
}) => {
  const fixture = animationFixture();
  const receiver = {
    ...fixture.diagram.objects[0],
    id: crypto.randomUUID(),
    x: 400,
  };
  const created = await request.post(`${api}/drills`, {
    data: {
      title: `Keep the same puck ${Date.now()}`,
      categoryId: "skating",
      diagram: {
        ...fixture.diagram,
        objects: [...fixture.diagram.objects, receiver],
        paths: [],
      },
    },
  });
  expect(created.ok()).toBe(true);
  const { id } = await created.json();
  try {
    await page.goto(`/drills/${id}/edit`);
    await page.locator(".animation-settings > summary").click();
    const drawing = page.getByRole("region", { name: "Draw animation" });
    const rink = drawing.getByLabel("Animation drawing rink");
    const tool = (name: string) =>
      drawing.getByRole("button", { name, exact: true });
    async function draw(from: number, to: number) {
      await rink.scrollIntoViewIfNeeded();
      const points = await rink.evaluate(
        (svg: SVGSVGElement, xs) =>
          xs.map((x) => {
            const point = new DOMPoint(x, 250).matrixTransform(
              svg.getScreenCTM()!,
            );
            return { x: point.x, y: point.y };
          }),
        [from, to],
      );
      await page.mouse.move(points[0].x, points[0].y);
      await page.mouse.down();
      await page.mouse.move(points[1].x, points[1].y, { steps: 8 });
      await page.mouse.up();
    }
    await tool("Player 1").click();
    await tool("Pass").click();
    await draw(100, 400);
    await tool("Player 2").click();
    await tool("Skate").click();
    await draw(400, 600);
    await tool("Shot").click();
    await draw(600, 800);

    await page.getByRole("button", { name: "Save drill", exact: true }).click();
    await expect(page).toHaveURL(`/drills/${id}`);
    const { diagram } = await (await request.get(`${api}/drills/${id}`)).json();
    expect(
      diagram.objects.filter(({ type }: { type: string }) => type === "puck"),
    ).toHaveLength(1);
    expect(diagram.animation.actions).toHaveLength(3);
    expect(diagram.animation.actions[0].puckId).toBe(fixture.puck);
    expect(diagram.animation.actions[1].objectId).toBe(receiver.id);
    expect(diagram.animation.actions[2].puckId).toBe(fixture.puck);
    expect(diagram.paths[2].points[0].x).toBeCloseTo(608, 0);
  } finally {
    await request.delete(`${api}/drills/${id}`);
  }
});

test("a regular pass snaps to a moving receiver in the same step", async ({
  page,
  request,
}) => {
  const fixture = animationFixture();
  const passer = {
    ...fixture.diagram.objects[0],
    id: crypto.randomUUID(),
    x: 150,
    y: 100,
  };
  const created = await request.post(`${api}/drills`, {
    data: {
      title: `Stationary pass ${Date.now()}`,
      categoryId: "skating",
      diagram: {
        ...fixture.diagram,
        objects: [...fixture.diagram.objects, passer],
        paths: [{ ...fixture.diagram.paths[0], kind: "skating" }],
        animation: {
          version: 1,
          actions: [
            {
              ...fixture.actions[0],
              puckId: null,
              durationSeconds: 4,
            },
          ],
        },
      },
    },
  });
  expect(created.ok()).toBe(true);
  const { id } = await created.json();
  try {
    await page.goto(`/drills/${id}/edit`);
    await page.locator(".animation-settings > summary").click();
    const drawing = page.getByRole("region", { name: "Draw animation" });
    const rink = drawing.getByLabel("Animation drawing rink");
    const tool = (name: string) =>
      drawing.getByRole("button", { name, exact: true });
    await tool("Player 2").click();
    await tool("Draw in this step").click();
    await tool("Pass").click();
    await rink.scrollIntoViewIfNeeded();
    const [from, to] = await rink.evaluate((svg: SVGSVGElement) =>
      [
        [150, 100],
        [175, 254],
      ].map(([x, y]) => {
        const point = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!);
        return { x: point.x, y: point.y };
      }),
    );
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await page.getByRole("button", { name: "Save drill", exact: true }).click();
    await expect(page).toHaveURL(`/drills/${id}`);
    const { diagram } = await (await request.get(`${api}/drills/${id}`)).json();
    const pass = diagram.animation.actions[1];
    expect(pass.objectId).toBe(passer.id);
    expect(pass.skatingPassChain.passes[0]).toMatchObject({
      receiverActionId: fixture.actions[0].id,
      releaseFraction: 0,
    });
    expect(pass.skatingPassChain.passes[0].receiveFraction).toBeCloseTo(
      0.75,
      1,
    );
    expect(diagram.paths[1].points.at(-1).y).toBe(250);
    await expect(
      page.locator(
        '.content-rink g[stroke="#000000"] path[stroke-dasharray="10 8"]',
      ),
    ).toHaveCount(1);
  } finally {
    await request.delete(`${api}/drills/${id}`);
  }
});

test("a skater exchanges a puck with each of two stationary players on one skating route", async ({
  page,
  request,
}) => {
  const fixture = animationFixture();
  const stationary = {
    ...fixture.diagram.objects[0],
    id: crypto.randomUUID(),
    x: 200,
    y: 140,
  };
  const secondStation = { ...stationary, id: crypto.randomUUID(), x: 650 };
  const secondPuck = { ...fixture.diagram.objects[1], x: 658, y: 140 };
  const created = await request.post(`${api}/drills`, {
    data: {
      title: `Timed return ${Date.now()}`,
      categoryId: "skating",
      diagram: {
        ...fixture.diagram,
        objects: [
          fixture.diagram.objects[0],
          stationary,
          secondStation,
          secondPuck,
        ],
        paths: [
          {
            ...fixture.diagram.paths[0],
            kind: "skating",
            points: [
              { x: 100, y: 250 },
              { x: 900, y: 250 },
            ],
          },
        ],
        animation: {
          version: 1,
          actions: [
            { ...fixture.actions[0], puckId: null, durationSeconds: 8 },
          ],
        },
      },
    },
  });
  expect(created.ok()).toBe(true);
  const { id } = await created.json();
  try {
    await page.goto(`/drills/${id}/edit`);
    await page.locator(".animation-settings > summary").click();
    await page
      .getByRole("button", { name: "Pass between players", exact: true })
      .click();
    const editor = page.getByRole("region", { name: /Pass between players/ });
    const rink = editor.getByLabel("Draw a pass between players");
    async function pass(
      from: [number, number],
      to: [number, number],
      target = rink,
    ) {
      await target.scrollIntoViewIfNeeded();
      const [start, end] = await target.evaluate(
        (svg: SVGSVGElement, points) =>
          points.map(([x, y]) => {
            const point = new DOMPoint(x, y).matrixTransform(
              svg.getScreenCTM()!,
            );
            return { x: point.x, y: point.y };
          }),
        [from, to],
      );
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 8 });
      await page.mouse.up();
    }
    await pass([200, 140], [250, 250]);
    await expect(
      editor.getByText(/Player 2 to Player 1 at 0\.[78] s/),
    ).toBeVisible();
    await pass([300, 250], [200, 140]);
    await expect(
      editor.getByText("Player 1 to Player 2 at 2.0 s"),
    ).toBeVisible();
    await pass([200, 140], [475, 250]);
    await expect(
      editor.getByText("Player 2 to Player 1 at 3.0 s"),
    ).toBeVisible();
    await pass([490, 250], [200, 140]);
    await expect(
      editor.getByText("Player 1 to Player 2 at 3.9 s"),
    ).toBeVisible();

    await pass([650, 140], [775, 250]);
    await expect(editor.getByText(/Player 3 to Player 1 at/)).toBeVisible();
    await pass([850, 250], [650, 140]);
    await expect(editor.getByText(/Player 1 to Player 3 at/)).toBeVisible();

    await page.getByRole("button", { name: "Save drill", exact: true }).click();
    await expect(page).toHaveURL(`/drills/${id}`);
    const { diagram } = await (await request.get(`${api}/drills/${id}`)).json();
    expect(diagram.paths).toHaveLength(1);
    expect(
      diagram.objects.filter(({ type }: { type: string }) => type === "puck"),
    ).toHaveLength(2);
    const standing = diagram.animation.actions[1];
    expect(standing).toMatchObject({ objectId: stationary.id, pathId: null });
    expect(
      standing.skatingPassChain.passes.map(
        ({ receiverActionId }: { receiverActionId: string }) =>
          receiverActionId,
      ),
    ).toEqual([
      fixture.actions[0].id,
      standing.id,
      fixture.actions[0].id,
      standing.id,
      fixture.actions[0].id,
      diagram.animation.actions[2].id,
    ]);
    expect(standing.skatingPassChain.passes[4].fromStation).toEqual({
      actionId: diagram.animation.actions[2].id,
      puckId: secondPuck.id,
    });
    expect(diagram.animation.actions[2]).toMatchObject({
      objectId: secondStation.id,
      pathId: null,
    });
  } finally {
    await request.delete(`${api}/drills/${id}`);
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

test("two stationary players exchange separate pucks with skaters in the same step", async ({
  page,
  request,
}) => {
  const lanes = [100, 400].map((y) => {
    const fixture = animationFixture();
    const skater = { ...fixture.diagram.objects[0], x: 100, y };
    const station = { ...skater, id: crypto.randomUUID(), x: 350, y: y + 40 };
    const path = {
      ...fixture.diagram.paths[0],
      kind: "skating",
      points: [skater, { x: 900, y }].map(({ x, y }) => ({ x, y })),
    };
    return {
      skater,
      station,
      path,
      action: { ...fixture.actions[0], puckId: null, durationSeconds: 6 },
    };
  });
  const created = await request.post(`${api}/drills`, {
    data: {
      title: `Parallel exchanges ${Date.now()}`,
      categoryId: "skating",
      diagram: {
        version: 1,
        objects: lanes.flatMap(({ skater, station }) => [skater, station]),
        paths: lanes.map(({ path }) => path),
        animation: {
          version: 1,
          actions: lanes.map(({ action }, index) => ({
            ...action,
            startWithPrevious: index > 0,
          })),
        },
      },
    },
  });
  expect(created.ok()).toBe(true);
  const { id } = await created.json();
  try {
    await page.goto(`/drills/${id}/edit`);
    await page.locator(".animation-settings > summary").click();
    await page
      .getByRole("button", { name: "Pass between players", exact: true })
      .click();
    const editor = page.getByRole("region", { name: /Pass between players/ });
    const rink = editor.getByLabel("Draw a pass between players");
    await rink.scrollIntoViewIfNeeded();
    async function pass(
      from: { x: number; y: number },
      to: { x: number; y: number },
    ) {
      const [start, end] = await rink.evaluate(
        (svg: SVGSVGElement, points) =>
          points.map(({ x, y }) => {
            const point = new DOMPoint(x, y).matrixTransform(
              svg.getScreenCTM()!,
            );
            return { x: point.x, y: point.y };
          }),
        [{ x: from.x, y: from.y }, to],
      );
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 8 });
      await page.mouse.up();
    }
    for (const { skater, station } of lanes) {
      await pass(station, { x: 350, y: skater.y });
    }
    // Both skaters carry their pucks at once. Each can return their own puck.
    for (const { skater, station } of lanes) {
      await pass({ x: 550, y: skater.y }, station);
    }
    await expect(editor.locator("ol li")).toHaveCount(4);
    await page.getByRole("button", { name: "Save drill", exact: true }).click();
    await expect(page).toHaveURL(`/drills/${id}`);
    const { diagram } = await (await request.get(`${api}/drills/${id}`)).json();
    const [first, second] = diagram.animation.actions.slice(2);
    expect(first.skatingPassChain.passes).toHaveLength(2);
    expect(second.skatingPassChain.passes).toHaveLength(2);
    expect(first.skatingPassChain.puckId).not.toBe(
      second.skatingPassChain.puckId,
    );
    expect(second.startWithPrevious).toBe(true);

    await page.getByRole("button", { name: "View animation" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Animation position").fill("1.5");
    const pucks = dialog.locator('g[transform]:has(> ellipse[rx="4.2"])');
    await expect(pucks).toHaveCount(2);
    for (const [index, { skater }] of lanes.entries()) {
      const transform = await pucks.nth(index).getAttribute("transform");
      const [, x, y] = transform?.match(/translate\((\S+) (\S+)\)/) ?? [];
      expect(Number(x)).toBeCloseTo(350, 0);
      expect(Number(y)).toBeCloseTo(skater.y + 20, 0);
    }
  } finally {
    await request.delete(`${api}/drills/${id}`);
  }
});

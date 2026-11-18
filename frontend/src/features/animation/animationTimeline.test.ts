import { expect, it } from "vitest";
import type { Diagram } from "../../lib/types";
import {
  animationFrame,
  nearestRelease,
  pointAlongRoute,
} from "./animationTimeline";
import {
  animationErrors,
  animationSeconds,
  retimeSkatingPassGroup,
} from "./animationRules";
import { animationMarkers, animationMarkerNames } from "./animationMarkers";

function diagram(): Diagram {
  return {
    version: 1,
    objects: [
      {
        id: "player",
        type: "player",
        x: 100,
        y: 200,
        rotation: 0,
        color: "#167e83",
        label: "P",
      },
      {
        id: "puck",
        type: "puck",
        x: 108,
        y: 208,
        rotation: 0,
        color: "#000000",
        label: "",
      },
      {
        id: "cone",
        type: "cone",
        x: 250,
        y: 150,
        rotation: 0,
        color: "#ff8800",
        label: "",
      },
    ],
    paths: [
      {
        id: "skate",
        kind: "puckHandling",
        color: "#000000",
        points: [
          { x: 100, y: 200 },
          { x: 200, y: 200 },
        ],
      },
      {
        id: "pass",
        kind: "passing",
        color: "#000000",
        points: [
          { x: 208, y: 208 },
          { x: 400, y: 208 },
        ],
      },
    ],
    animation: {
      version: 1,
      actions: [
        {
          id: "a",
          objectId: "player",
          pathId: "skate",
          puckId: "puck",
          durationSeconds: 2,
        },
        { id: "b", objectId: "puck", pathId: "pass", durationSeconds: 1 },
      ],
    },
  };
}
it("moves at constant distance along unevenly sampled and duplicate points", () => {
  expect(
    pointAlongRoute(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 0 },
        { x: 100, y: 0 },
      ],
      0.5,
    ),
  ).toEqual({ x: 50, y: 0 });
  expect(
    pointAlongRoute(
      [
        { x: 2, y: 3 },
        { x: 2, y: 3 },
      ],
      0.8,
    ),
  ).toEqual({ x: 2, y: 3 });
});
it("carries a puck and then passes it while leaving equipment and source data intact", () => {
  const source = diagram();
  const before = JSON.stringify(source);
  const mid = animationFrame(source, 1);
  expect(mid.objects[0].x).toBe(150);
  expect(mid.objects[1].x).toBe(158);
  expect(mid.objects[2]).toEqual(source.objects[2]);
  const passing = animationFrame(source, 2.5);
  expect(passing.objects[0].x).toBe(200);
  expect(passing.objects[1].x).toBe(304);
  expect(animationFrame(source, 99).objects[1].x).toBe(400);
  expect(JSON.stringify(source)).toBe(before);
});
it("starts independent actions together and waits for the longer action", () => {
  const source = diagram();
  source.paths[0].kind = "skating";
  const [skate, pass] = source.animation!.actions;
  source.animation!.actions = [
    { ...skate, puckId: null },
    { ...pass, startWithPrevious: true },
    { ...skate, id: "next", pathId: "return", puckId: null },
  ];
  source.paths.push({
    ...source.paths[0],
    id: "return",
    points: [...source.paths[0].points].reverse(),
  });

  expect(animationErrors(source)).toEqual([]);
  expect(animationSeconds(source)).toBe(4);
  const simultaneous = animationFrame(source, 0.5);
  expect(simultaneous.objects[0].x).toBe(125);
  expect(simultaneous.objects[1].x).toBe(304);
  expect(simultaneous.paths.slice(0, 2).map((path) => path.color)).toEqual([
    "#167e83",
    "#167e83",
  ]);
  expect(animationFrame(source, 1.5).objects[1].x).toBe(400);
  expect(animationFrame(source, 1.5).objects[0].x).toBe(175);
  expect(animationFrame(source, 2.5).objects[0].x).toBe(175);
});

it("snaps the release to the skating route and lets the puck travel independently", () => {
  const source = diagram();
  const [skate, pass] = source.paths;
  const release = nearestRelease(skate.points, { x: 150, y: 212 })!;
  expect(release).toEqual({ point: { x: 150, y: 200 }, fraction: 0.5 });
  expect(nearestRelease(skate.points, { x: 150, y: 260 })).toBeUndefined();
  const movement = source.animation!.actions[0];
  movement.passRelease = { pathId: pass.id, fraction: release.fraction };
  source.animation!.actions = [movement];
  expect(animationErrors(source)).toEqual([]);
  expect(animationFrame(source, 0.5).objects[1].x).toBe(133);
  expect(animationFrame(source, 1).objects[1].x).toBe(150);
  const inFlight = animationFrame(source, 1.25);
  expect(inFlight.objects[0].x).toBe(162.5);
  expect(inFlight.objects[1].x).toBe(275);
  expect(animationFrame(source, 1.9).objects[1].x).toBe(400);

  movement.passRelease.fraction = 0.9;
  expect(animationSeconds(source)).toBe(2.3);
  expect(animationFrame(source, 2.3).objects[0].x).toBe(200);
  movement.passRelease.fraction = 1;
  expect(animationErrors(source)).toContain(
    "Action 1 needs a pass released along its skating route.",
  );
});

it("leads moving receivers and hands the same puck from one skater to the next", () => {
  const source = diagram();
  source.paths[0].kind = "skating";
  const lanes = [200, 260, 320];
  source.objects.push(
    ...lanes.slice(1).map((y) => ({
      ...source.objects[0],
      id: `player-${y}`,
      y,
    })),
  );
  source.paths.push(
    ...lanes.slice(1).map((y) => ({
      ...source.paths[0],
      id: `skate-${y}`,
      points: [
        { x: 100, y },
        { x: 200, y },
      ],
    })),
  );
  source.animation!.actions = [
    {
      id: "a",
      objectId: "player",
      pathId: "skate",
      durationSeconds: 2,
      skatingPassChain: {
        puckId: "puck",
        passes: [
          { receiverActionId: "b", releaseFraction: 0.25 },
          { receiverActionId: "c", releaseFraction: 0.625 },
        ],
      },
    },
    ...lanes.slice(1).map((y, index) => ({
      id: index === 0 ? "b" : "c",
      objectId: `player-${y}`,
      pathId: `skate-${y}`,
      durationSeconds: 2,
      startWithPrevious: true,
    })),
  ];
  expect(animationErrors(source)).toEqual([]);
  expect(animationSeconds(source)).toBe(2);
  expect(animationFrame(source, 0.75).objects[1]).toMatchObject({
    x: 137.5,
    y: 230,
  });
  expect(animationFrame(source, 1).objects[1]).toMatchObject({
    x: 150,
    y: 260,
  });
  expect(animationFrame(source, 1.5).objects[1]).toMatchObject({
    x: 175,
    y: 290,
  });
  expect(animationFrame(source, 1.75).objects[1]).toMatchObject({
    x: 187.5,
    y: 320,
  });
  const actions = source.animation!.actions;
  const resized: Diagram = {
    ...source,
    animation: {
      version: 1,
      actions: retimeSkatingPassGroup(actions, actions[0], 4),
    },
  };
  expect(animationErrors(resized)).toEqual([]);
  expect(animationSeconds(resized)).toBe(4);
  expect(
    resized.animation!.actions[0].skatingPassChain!.passes.map(
      (pass) => pass.receiveFraction,
    ),
  ).toEqual([0.5, 0.875]);
  expect(animationFrame(resized, 2).objects[1]).toMatchObject({
    x: 150,
    y: 260,
  });
  expect(animationFrame(resized, 3.5).objects[1]).toMatchObject({
    x: 187.5,
    y: 320,
  });
  source.animation!.actions[0].skatingPassChain!.passes[1].releaseFraction = 0.4;
  expect(animationErrors(source)[0]).toContain("after the sender has the puck");
});

it("catches a sideways pass at the exact drawn point by adjusting the receiver’s speed", () => {
  const source = diagram();
  source.paths[0].kind = "skating";
  source.objects.push({ ...source.objects[0], id: "receiver", y: 260 });
  source.paths.push({
    id: "receiver-route",
    kind: "skating",
    color: "#000000",
    points: [
      { x: 100, y: 260 },
      { x: 200, y: 260 },
    ],
  });
  source.animation!.actions = [
    {
      id: "sender",
      objectId: "player",
      pathId: "skate",
      durationSeconds: 2,
      skatingPassChain: {
        puckId: "puck",
        passes: [
          {
            receiverActionId: "receiver",
            releaseFraction: 0.9,
            receiveFraction: 0.1,
          },
        ],
      },
    },
    {
      id: "receiver",
      objectId: "receiver",
      pathId: "receiver-route",
      durationSeconds: 2,
      startWithPrevious: true,
    },
  ];
  expect(animationErrors(source)).toEqual([]);
  const arrival = animationFrame(source, 1.9);
  expect(arrival.objects[1].x).toBeCloseTo(110);
  expect(arrival.objects[1].y).toBeCloseTo(260);
  expect(arrival.objects.at(-1)?.x).toBeCloseTo(110);
  expect(animationFrame(source, 2).objects.at(-1)?.x).toBeCloseTo(200);

  const pass = source.animation!.actions[0].skatingPassChain!.passes[0];
  pass.releaseFraction = 1;
  pass.receiveFraction = 0;
  expect(animationErrors(source)).toEqual([]);
  expect(animationSeconds(source)).toBeCloseTo(4.1);
  expect(animationFrame(source, 2.1).objects.at(-1)?.x).toBe(100);
  expect(animationFrame(source, 4.1).objects.at(-1)?.x).toBe(200);
});

it("rejects two simultaneous actions using the same puck", () => {
  const source = diagram();
  source.animation!.actions[1].startWithPrevious = true;
  expect(animationErrors(source)).toContain(
    "Action 2 uses a player or puck already used in this group.",
  );
});

it("seeking produces the same frame regardless of playback history", () => {
  const source = diagram();
  const originalFrame = animationFrame(source, 0.5);
  animationFrame(source, 3);
  expect(animationFrame(source, 0.5)).toEqual(originalFrame);
  expect(animationSeconds(source)).toBe(3);
});
it("supports old diagrams without animation", () => {
  const source = { ...diagram(), animation: null };
  expect(animationSeconds(source)).toBe(0);
  expect(animationErrors(source)).toEqual([]);
});
it("rejects missing references, incompatible actors, missing pucks and excessive duration", () => {
  const source = diagram();
  expect(animationErrors(source)).toEqual([]);
  expect(
    animationErrors({
      ...source,
      objects: source.objects.filter((object) => object.type !== "puck"),
    }),
  ).not.toEqual([]);
  expect(
    animationErrors({
      ...source,
      animation: {
        version: 1,
        actions: [{ ...source.animation!.actions[1], objectId: "player" }],
      },
    }),
  ).not.toEqual([]);
  const actions = Array.from({ length: 24 }, (_, index) => ({
    ...source.animation!.actions[1],
    id: String(index),
    durationSeconds: 1.25,
  }));
  expect(
    animationErrors({ ...source, animation: { version: 1, actions } }),
  ).toEqual([]);
  expect(
    animationErrors({
      ...source,
      animation: {
        version: 1,
        actions: [{ ...actions[0], durationSeconds: 1.5 }, ...actions.slice(1)],
      },
    }),
  ).toContain("Keep the animation within 30 seconds.");
  expect(
    animationErrors({
      ...source,
      animation: {
        version: 1,
        actions: [
          ...actions.map((action) => ({ ...action, durationSeconds: 1 })),
          { ...actions[0], id: "extra", durationSeconds: 1 },
        ],
      },
    }),
  ).toContain("Add between 1 and 24 actions.");
});

it("moves only the selected puck when a player passes after skating", () => {
  const source = diagram();
  source.animation!.actions[1] = {
    ...source.animation!.actions[1],
    objectId: "player",
    puckId: "puck",
  };
  expect(animationErrors(source)).toEqual([]);
  const passing = animationFrame(source, 2.5);
  expect(passing.objects[0].x).toBe(200);
  expect(passing.objects[1].x).toBe(304);
  expect(animationFrame(source, 3).objects[1].x).toBe(400);
});

it("uses consistent type-based names and excludes piles and equipment", () => {
  const source = diagram();
  source.objects.push(
    { ...source.objects[0], id: "coach", label: "C" },
    { ...source.objects[1], id: "puck2" },
    { ...source.objects[2], id: "pile", type: "puckPile" },
  );
  expect(animationMarkers(source).map((object) => object.id)).toEqual([
    "player",
    "puck",
    "coach",
    "puck2",
  ]);
  expect([...animationMarkerNames(source).values()]).toEqual([
    "Player 1",
    "Puck 1",
    "Coach 1",
    "Puck 2",
  ]);
  source.animation!.actions[0] = {
    ...source.animation!.actions[0],
    objectId: "coach",
    pathId: "pass",
  };
  expect(animationErrors(source)).toEqual([]);
  expect(
    animationFrame(source, 1).objects.find((object) => object.id === "coach")!
      .x,
  ).toBe(100);
  source.animation!.actions[0] = {
    ...source.animation!.actions[0],
    objectId: "pile",
  };
  expect(animationErrors(source).length).toBeGreaterThan(0);
});

import { expect, it } from "vitest";
import type { Diagram } from "../../lib/types";
import { animationFrame, pointAlongRoute } from "./animationTimeline";
import { animationErrors, animationSeconds } from "./animationRules";
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

import { expect, it } from "vitest";
import { limitPoints } from "./geometry";
it("retains route endpoints and bounds long gestures to API limits", () => {
  const points = Array.from({ length: 1501 }, (_, i) => ({
    x: i / 2,
    y: i / 4,
  }));
  const sampled = limitPoints(points);
  expect(sampled.length).toBe(500);
  expect(sampled[0]).toEqual(points[0]);
  expect(sampled.at(-1)).toEqual(points.at(-1));
  expect(sampled.every((p, i) => !i || p.x >= sampled[i - 1].x)).toBe(true);
});
it("preserves ordinary routes without resampling", () => {
  const points = [
    { x: 1, y: 2 },
    { x: 3, y: 4 },
  ];
  expect(limitPoints(points)).toBe(points);
});
import { nextRotation } from "./geometry";
it("rotates goals through cardinal directions and advances legacy angles to the next cardinal", () => {
  expect(
    [0, 90, 180, 270].map((rotation) => nextRotation(rotation, true)),
  ).toEqual([90, 180, 270, 0]);
  expect(nextRotation(45, true)).toBe(90);
  expect(nextRotation(-45, true)).toBe(0);
  expect(nextRotation(765, true)).toBe(90);
  expect(nextRotation(45, false)).toBe(90);
});

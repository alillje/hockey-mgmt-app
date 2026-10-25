import { expect, it } from "vitest";
import {
  backwardSkatingData,
  extendRoute,
  limitPoints,
  pathEndAngle,
  shotRailData,
} from "./geometry";
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
it("keeps new passes and shots straight while freehand routes retain their bends", () => {
  const start = { x: 100, y: 100 };
  const bend = { x: 120, y: 130 };
  const end = { x: 150, y: 100 };
  expect(extendRoute("passing", [start, bend], end)).toEqual([start, end]);
  expect(extendRoute("shooting", [start, bend], end)).toEqual([start, end]);
  expect(extendRoute("skating", [start, bend], end)).toEqual([
    start,
    bend,
    end,
  ]);
});
it("aims arrows along the final stretch instead of a tiny pointer jitter", () => {
  const points = [
    { x: 100, y: 100 },
    { x: 120, y: 100 },
    { x: 145, y: 100 },
    { x: 145, y: 101 },
  ];
  expect(pathEndAngle(points)).toBeCloseTo(2.29, 1);
  expect(
    pathEndAngle([
      { x: 100, y: 100 },
      { x: 100, y: 130 },
    ]),
  ).toBe(90);
  expect(pathEndAngle([{ x: 100, y: 100 }])).toBeNull();
});
it("draws repeated backwards-skating marks without consuming the arrow endpoint", () => {
  const marks = backwardSkatingData([
    { x: 100, y: 100 },
    { x: 200, y: 100 },
  ]);
  expect(marks.match(/M /g)?.length).toBe(4);
  expect(marks.match(/C /g)?.length).toBe(4);
  expect(marks).not.toContain(" L ");
  expect(marks).not.toContain("NaN");
  const markEnds = [
    ...marks.matchAll(
      /M ([\d.-]+) [\d.-]+ C [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+ ([\d.-]+) [\d.-]+/g,
    ),
  ];
  expect(Number(markEnds[0][2]) - Number(markEnds[0][1])).toBeGreaterThan(5);
  expect(Number(markEnds[1][2]) - Number(markEnds[1][1])).toBeLessThan(-5);
  expect(backwardSkatingData([{ x: 100, y: 100 }])).toBe("");
});
it("keeps shot rails parallel and separated through their open start", () => {
  const points = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
  ];
  expect(shotRailData(points, -1)).toBe("M 100 95 L 200 95");
  expect(shotRailData(points, 1)).toBe("M 100 105 L 200 105");
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

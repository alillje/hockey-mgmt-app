import type { Point } from "./types";
/** Advance goals to the next cardinal direction; other equipment keeps 45° steps. */
export function nextRotation(rotation: number, isGoal: boolean): number {
  const normalized = Number.isFinite(rotation)
    ? ((rotation % 360) + 360) % 360
    : 0;
  return isGoal
    ? ((Math.floor(normalized / 90 + 1e-10) + 1) * 90) % 360
    : (normalized + 45) % 360;
}
/** Evenly sample a long gesture while preserving its start and final arrow endpoint. */
export function limitPoints(points: Point[], limit = 500): Point[] {
  if (points.length <= limit) return points;
  return Array.from(
    { length: limit },
    (_, i) => points[Math.round((i * (points.length - 1)) / (limit - 1))],
  );
}

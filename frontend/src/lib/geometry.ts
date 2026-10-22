import type { Point } from "./types";
/** Evenly sample a long gesture while preserving its start and final arrow endpoint. */
export function limitPoints(points: Point[], limit = 500): Point[] {
  if (points.length <= limit) return points;
  return Array.from(
    { length: limit },
    (_, i) => points[Math.round((i * (points.length - 1)) / (limit - 1))],
  );
}

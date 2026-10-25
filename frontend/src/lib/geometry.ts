import type { PathKind, Point } from "./types";
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

/** Passes and shots are straight between their starting point and the current pointer. */
export function extendRoute(
  kind: PathKind,
  points: Point[],
  pointer: Point,
): Point[] {
  if (!points.length) return [pointer];
  if (kind === "passing" || kind === "shooting") {
    return [points[0], pointer];
  }
  return [...points, pointer];
}

/** Aim an arrow using the last short stretch of a route, ignoring tiny final pointer jitters. */
export function pathEndAngle(points: Point[], lookback = 24): number | null {
  if (points.length < 2) return null;
  const end = points[points.length - 1];
  let distance = 0;
  for (let i = points.length - 2; i >= 0; i--) {
    distance += Math.hypot(
      points[i + 1].x - points[i].x,
      points[i + 1].y - points[i].y,
    );
    const dx = end.x - points[i].x;
    const dy = end.y - points[i].y;
    if (distance >= lookback && Math.hypot(dx, dy) > 1) {
      return (Math.atan2(dy, dx) * 180) / Math.PI;
    }
  }
  for (let i = 0; i < points.length - 1; i++) {
    const dx = end.x - points[i].x;
    const dy = end.y - points[i].y;
    if (Math.hypot(dx, dy) > 1) {
      return (Math.atan2(dy, dx) * 180) / Math.PI;
    }
  }
  return null;
}

/** Small repeating skate marks follow the drawn route and leave room for its arrow. */
export function backwardSkatingData(points: Point[]): string {
  const segments = points.slice(1).map((end, i) => ({
    start: points[i],
    end,
    length: Math.hypot(end.x - points[i].x, end.y - points[i].y),
  }));
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  const count = Math.min(200, Math.max(0, Math.floor((total - 24) / 20) + 1));
  if (!count) return "";
  const spacing = Math.max(20, (total - 24) / count);
  let segmentIndex = 0;
  let passed = 0;
  const marks: string[] = [];
  const coordinate = (value: number) => Number(value.toFixed(1));
  for (let i = 0; i < count; i++) {
    const target = 10 + i * spacing;
    while (
      segmentIndex < segments.length - 1 &&
      passed + segments[segmentIndex].length < target
    ) {
      passed += segments[segmentIndex].length;
      segmentIndex++;
    }
    const segment = segments[segmentIndex];
    if (!segment?.length) continue;
    const fraction = Math.min(
      1,
      Math.max(0, (target - passed) / segment.length),
    );
    const x = segment.start.x + (segment.end.x - segment.start.x) * fraction;
    const y = segment.start.y + (segment.end.y - segment.start.y) * fraction;
    const ux = (segment.end.x - segment.start.x) / segment.length;
    const uy = (segment.end.y - segment.start.y) / segment.length;
    const nx = -uy;
    const ny = ux;
    const side = i % 2 === 0 ? -2 : 2;
    const lean = ((i % 2 === 0 ? -35 : 35) * Math.PI) / 180;
    const place = (along: number, across: number) => {
      const forward = along * Math.cos(lean) - across * Math.sin(lean);
      const sideways = along * Math.sin(lean) + across * Math.cos(lean) + side;
      return `${coordinate(x + forward * ux + sideways * nx)} ${coordinate(y + forward * uy + sideways * ny)}`;
    };
    marks.push(
      `M ${place(-4, -5)} C ${place(3, -6)} ${place(3, 6)} ${place(-4, 5)}`,
    );
  }
  return marks.join(" ");
}

/** Parallel shot rails stay open at their starting ends and meet one arrowhead. */
export function shotRailData(points: Point[], side: -1 | 1): string {
  return points
    .map((point, index) => {
      const before = points[Math.max(0, index - 1)];
      const after = points[Math.min(points.length - 1, index + 1)];
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const length = Math.hypot(dx, dy);
      const offset = side * 5;
      const x = point.x + (length ? (-dy / length) * offset : 0);
      const y = point.y + (length ? (dx / length) * offset : 0);
      return `${index ? "L" : "M"} ${Number(x.toFixed(1))} ${Number(y.toFixed(1))}`;
    })
    .join(" ");
}

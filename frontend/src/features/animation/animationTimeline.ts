import type { Diagram, Point } from "../../lib/types";

/** Distance-based movement is independent of how densely the route was drawn. */
export function pointAlongRoute(points: Point[], fraction: number): Point {
  if (!points.length) return { x: 0, y: 0 };
  const lengths = points
    .slice(1)
    .map((point, index) =>
      Math.hypot(point.x - points[index].x, point.y - points[index].y),
    );
  let distance =
    lengths.reduce((sum, value) => sum + value, 0) *
    Math.max(0, Math.min(1, fraction));
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index];
    if (!length) continue;
    if (distance <= length) {
      const start = points[index],
        end = points[index + 1];
      return {
        x: start.x + ((end.x - start.x) * distance) / length,
        y: start.y + ((end.y - start.y) * distance) / length,
      };
    }
    distance -= length;
  }
  return { ...points.at(-1)! };
}

/** A deterministic frame: playback, seeking and GIF export use the same evaluator. */
export function animationFrame(diagram: Diagram, seconds: number): Diagram {
  const positions = new Map<string, Point>();
  let start = 0;
  let activePath: string | undefined;
  for (const action of diagram.animation?.actions ?? []) {
    if (seconds < start) break;
    const path = diagram.paths.find((item) => item.id === action.pathId);
    if (!path) continue;
    const progress = Math.min(
      1,
      Math.max(0, (seconds - start) / action.durationSeconds),
    );
    const position = pointAlongRoute(path.points, progress);
    const puckOnly =
      (path.kind === "passing" || path.kind === "shooting") && action.puckId;
    if (puckOnly) {
      // The passer/shooter remains stationary while their selected puck follows the route.
      positions.set(puckOnly, position);
    } else {
      positions.set(action.objectId, position);
    }
    if (action.puckId && !puckOnly)
      positions.set(action.puckId, {
        x: Math.min(995, position.x + 8),
        y: Math.min(495, position.y + 8),
      });
    activePath = path.id;
    start += action.durationSeconds;
    if (seconds < start) break;
  }
  return {
    ...diagram,
    objects: diagram.objects.map((object) => ({
      ...object,
      ...positions.get(object.id),
    })),
    paths: diagram.paths.map((path) => ({
      ...path,
      color: path.id === activePath ? "#167e83" : "#b9c6ca",
    })),
  };
}

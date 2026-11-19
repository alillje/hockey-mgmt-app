import type {
  AnimationAction,
  Diagram,
  Point,
  RinkPath,
} from "../../lib/types";
import {
  animationGroups,
  animationSchedule,
  isPuckDelivery,
} from "./animationRules";
import { fractionAtTime, skatingPassPlan } from "./skatingPassTiming";

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

/** Project a click onto the route and return its fraction of the travel distance. */
export function nearestRoutePoint(
  points: Point[],
  click: Point,
  tolerance = 24,
) {
  let distance = 0;
  let bestDistance = Infinity;
  let bestTravel = 0;
  let point: Point | undefined;
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (!length) continue;
    const projection =
      ((click.x - start.x) * dx + (click.y - start.y) * dy) / (length * length);
    const fraction = Math.min(1, Math.max(0, projection));
    const projected = {
      x: start.x + fraction * dx,
      y: start.y + fraction * dy,
    };
    const gap = Math.hypot(click.x - projected.x, click.y - projected.y);
    if (gap < bestDistance) {
      point = projected;
      bestDistance = gap;
      bestTravel = distance + length * fraction;
    }
    distance += length;
  }
  const fraction = bestTravel / distance;
  if (point && bestDistance <= tolerance)
    return { point, fraction, gap: bestDistance };
}

function skaterPosition(
  diagram: Diagram,
  action: AnimationAction,
  fraction: number,
) {
  const route = diagram.paths.find((path) => path.id === action.pathId);
  return pointAlongRoute(route?.points ?? [], fraction);
}

export function skatingPassLegs(
  diagram: Diagram,
  group: AnimationAction[],
  starter: AnimationAction,
  plan = skatingPassPlan(group, starter),
) {
  let sender = starter;
  return plan.legs.map((leg, index) => {
    const { receiver, release, catch: reception } = leg;
    const route: RinkPath = {
      id: `skating-pass-${starter.id}-${index}`,
      kind: "passing",
      color: "#b9c6ca",
      points: [
        skaterPosition(diagram, sender, release.fraction),
        skaterPosition(diagram, receiver, reception.fraction),
      ],
    };
    sender = receiver;
    return { release: release.time, arrival: reception.time, receiver, route };
  });
}

export function skatingExchangePaths(diagram: Diagram): RinkPath[] {
  return animationGroups(diagram.animation?.actions ?? []).flatMap((group) => {
    const starter = group.find((action) => action.skatingPassChain);
    if (!starter) return [];
    return skatingPassLegs(diagram, group, starter).map(({ route }) => ({
      ...route,
      color: "#000000",
    }));
  });
}

function exchangePuckPosition(
  diagram: Diagram,
  starter: AnimationAction,
  passes: ReturnType<typeof skatingPassLegs>,
  plan: ReturnType<typeof skatingPassPlan>,
  elapsed: number,
) {
  let carrier = starter;
  let receivedAt = -Infinity;
  let nextRelease = Infinity;
  for (const { arrival, receiver, release, route } of passes) {
    if (elapsed < release) {
      nextRelease = release;
      break;
    }
    if (elapsed <= arrival) {
      return pointAlongRoute(
        route.points,
        (elapsed - release) / (arrival - release),
      );
    }
    carrier = receiver;
    receivedAt = arrival;
  }
  const trajectory = plan.trajectories.get(carrier.id);
  const fraction = trajectory
    ? fractionAtTime(trajectory, elapsed, passes.length > 1)
    : elapsed / carrier.durationSeconds;
  const position = skaterPosition(diagram, carrier, fraction);
  const offset =
    8 *
    Math.min(1, (elapsed - receivedAt) / 0.15, (nextRelease - elapsed) / 0.15);
  return {
    x: Math.min(995, position.x + offset),
    y: Math.min(495, position.y + offset),
  };
}

/** A deterministic frame: playback, seeking and GIF export use the same evaluator. */
export function animationFrame(diagram: Diagram, seconds: number): Diagram {
  const positions = new Map<string, Point>();
  const activePaths = new Set<string>();
  const exchangeRoutes: RinkPath[] = [];
  const schedule = animationSchedule(diagram);
  const duration = schedule.at(-1)?.end ?? 0;
  for (const { start, timings, starter, plan } of schedule) {
    if (seconds < start) break;
    const elapsed = seconds - start;
    for (const { action, end: actionEnd, trajectory } of timings) {
      const path = diagram.paths.find((item) => item.id === action.pathId);
      if (!path) continue;
      const progress = trajectory
        ? fractionAtTime(trajectory, elapsed, (plan?.legs.length ?? 0) > 1)
        : Math.min(1, Math.max(0, elapsed / action.durationSeconds));
      const position = pointAlongRoute(path.points, progress);
      const puckOnly = isPuckDelivery(path.kind) && action.puckId;
      if (puckOnly) {
        // The passer/shooter remains stationary while their selected puck follows the route.
        positions.set(puckOnly, position);
      } else {
        positions.set(action.objectId, position);
      }
      if (action.puckId && !puckOnly) {
        positions.set(action.puckId, {
          x: Math.min(995, position.x + 8),
          y: Math.min(495, position.y + 8),
        });
      }
      if (
        elapsed < (trajectory?.end ?? action.durationSeconds) ||
        start + actionEnd === duration
      ) {
        activePaths.add(path.id);
      }
    }
    if (starter?.skatingPassChain && plan) {
      const passes = skatingPassLegs(
        diagram,
        timings.map(({ action }) => action),
        starter,
        plan,
      );
      for (const { route, release, arrival } of passes) {
        exchangeRoutes.push(route);
        if (elapsed >= release && elapsed <= arrival) activePaths.add(route.id);
      }
      positions.set(
        starter.skatingPassChain.puckId,
        exchangePuckPosition(diagram, starter, passes, plan, elapsed),
      );
    }
  }
  return {
    ...diagram,
    objects: diagram.objects.map((object) => ({
      ...object,
      ...positions.get(object.id),
    })),
    paths: [...diagram.paths, ...exchangeRoutes].map((path) => ({
      ...path,
      color: activePaths.has(path.id) ? "#167e83" : "#b9c6ca",
    })),
  };
}

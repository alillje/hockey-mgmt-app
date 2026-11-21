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
  isStationaryPass,
} from "./animationRules";
import { fractionAtTime, skatingPassPlan } from "./skatingPassTiming";
import {
  carriedPuckPosition,
  PuckPossession,
  puckPickupDistance,
} from "./puckPossession";

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
    const legs = skatingPassLegs(diagram, group, starter);
    return legs
      .slice(isStationaryPass(diagram, starter) ? 1 : 0)
      .map(({ route }) => ({
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
  return carriedPuckPosition(diagram, position, { x: offset, y: offset });
}

export type AnimationRouteMode = "drawing" | "show" | "hide";

/** A deterministic frame: playback, seeking and GIF export use the same evaluator. */
export function animationFrame(
  diagram: Diagram,
  seconds: number,
  routeMode: AnimationRouteMode = "drawing",
): Diagram {
  return animationScene(diagram, seconds, routeMode).frame;
}

export function animationScene(
  diagram: Diagram,
  seconds: number,
  routeMode: AnimationRouteMode = "drawing",
  includeStartingStep = true,
) {
  const positions = new Map<string, Point>();
  const possession = new PuckPossession();
  const skaters = diagram.objects.filter((item) => item.type === "player");
  const activePaths = new Set<string>();
  const liveDeliveries = new Set<string>();
  const snappedPaths = new Set<string>();
  const exchangeRoutes: RinkPath[] = [];
  const schedule = animationSchedule(diagram);
  const duration = schedule.at(-1)?.end ?? 0;
  for (const { start, end, timings, starter, plan } of schedule) {
    if (seconds < start || (!includeStartingStep && seconds === start)) break;
    const elapsed = seconds - start;
    const stationaryPass =
      starter && isStationaryPass(diagram, starter) ? starter : undefined;
    if (stationaryPass) snappedPaths.add(stationaryPass.pathId);
    const motions = timings.flatMap(({ action, end, trajectory }) => {
      if (action === stationaryPass) return [];
      const path = diagram.paths.find((item) => item.id === action.pathId);
      if (!path) return [];
      const delivery = isPuckDelivery(path.kind);
      const positionAt = (time: number) =>
        pointAlongRoute(
          path.points,
          trajectory
            ? fractionAtTime(trajectory, time, (plan?.legs.length ?? 0) > 1)
            : time / action.durationSeconds,
        );
      return [{ action, path, end, delivery, positionAt }];
    });
    const movingSkaters = new Set(
      motions
        .filter((motion) => !motion.delivery)
        .map(({ action }) => action.objectId),
    );
    const chainPuck = starter?.skatingPassChain?.puckId;
    const exchangeReceivers = new Set(
      starter?.skatingPassChain?.passes.map(
        ({ receiverActionId }) => receiverActionId,
      ),
    );
    const exchangeSkaters = new Set(
      motions
        .filter(
          ({ action }) =>
            action === starter || exchangeReceivers.has(action.id),
        )
        .map(({ action }) => action.objectId),
    );
    if (chainPuck) possession.release(chainPuck);

    for (const { action, delivery } of motions) {
      if (delivery) possession.release(action.puckId ?? action.objectId);
      else if (action.puckId && action.puckId !== chainPuck) {
        const held = possession.get(action.objectId);
        if (held?.puckId !== action.puckId) {
          possession.claim(action.objectId, action.puckId);
        }
      }
    }

    const catches = motions
      .filter(({ path, end }) => path.kind === "passing" && elapsed >= end)
      .sort((left, right) => left.end - right.end);
    for (const { action, path } of catches) {
      const point = path.points.at(-1)!;
      const receivers = skaters
        .flatMap((skater) => {
          if (
            skater.id === action.objectId ||
            movingSkaters.has(skater.id) ||
            possession.get(skater.id) ||
            exchangeSkaters.has(skater.id)
          )
            return [];
          const position = positions.get(skater.id) ?? skater;
          const distance = Math.hypot(
            point.x - position.x,
            point.y - position.y,
          );
          return distance <= puckPickupDistance
            ? [{ skater, point: position, distance }]
            : [];
        })
        .sort((left, right) => left.distance - right.distance);
      const [receiver, other] = receivers;
      if (receiver && (!other || other.distance - receiver.distance >= 1)) {
        const offset =
          receiver.distance >= 5
            ? { x: point.x - receiver.point.x, y: point.y - receiver.point.y }
            : undefined;
        possession.claim(
          receiver.skater.id,
          action.puckId ?? action.objectId,
          offset,
        );
      }
    }

    for (const {
      action,
      path,
      end: actionEnd,
      delivery,
      positionAt,
    } of motions) {
      if (delivery && elapsed < actionEnd) liveDeliveries.add(path.id);
      positions.set(
        delivery ? (action.puckId ?? action.objectId) : action.objectId,
        positionAt(elapsed),
      );
      if (elapsed < actionEnd || start + actionEnd === duration)
        activePaths.add(path.id);
    }
    possession.place(diagram, positions);
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
        if (elapsed >= release && elapsed < arrival)
          liveDeliveries.add(route.id);
      }
      positions.set(
        starter.skatingPassChain.puckId,
        exchangePuckPosition(diagram, starter, passes, plan, elapsed),
      );
      const finalCarrier = passes.at(-1)?.receiver;
      if (finalCarrier && seconds >= end) {
        possession.claim(
          finalCarrier.objectId,
          starter.skatingPassChain.puckId,
        );
      }
    }
  }
  const frame = {
    ...diagram,
    objects: diagram.objects.map((object) => ({
      ...object,
      ...positions.get(object.id),
    })),
    paths: [
      ...diagram.paths.filter(
        (path) => !snappedPaths.has(path.id) || liveDeliveries.has(path.id),
      ),
      ...exchangeRoutes,
    ]
      .filter((path) => {
        if (routeMode === "drawing") return true;
        if (routeMode === "hide") return false;
        if (isPuckDelivery(path.kind)) return liveDeliveries.has(path.id);
        return true;
      })
      .map((path) => ({
        ...path,
        color: activePaths.has(path.id) ? "#167e83" : "#b9c6ca",
      })),
  };
  return { frame, possession };
}

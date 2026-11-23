import type {
  AnimationAction,
  Diagram,
  Point,
  RinkPath,
} from "../../lib/types";
import {
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
  positions?: ReadonlyMap<string, Point>,
) {
  if (action.pathId === null) {
    return (
      positions?.get(action.objectId) ??
      diagram.objects.find(({ id }) => id === action.objectId) ?? { x: 0, y: 0 }
    );
  }
  const route = diagram.paths.find((path) => path.id === action.pathId);
  return pointAlongRoute(route?.points ?? [], fraction);
}

export function skatingPassLegs(
  diagram: Diagram,
  group: AnimationAction[],
  starter: AnimationAction,
  plan = skatingPassPlan(group, starter),
  positions?: ReadonlyMap<string, Point>,
) {
  return plan.legs.map((leg, index) => {
    const { sender, puckId, receiver, release, catch: reception } = leg;
    const route: RinkPath = {
      id: `skating-pass-${starter.id}-${index}`,
      kind: "passing",
      color: "#b9c6ca",
      points: [
        skaterPosition(diagram, sender, release.fraction, positions),
        skaterPosition(diagram, receiver, reception.fraction, positions),
      ],
    };
    return {
      release: release.time,
      arrival: reception.time,
      sender,
      receiver,
      puckId,
      route,
    };
  });
}

export function skatingExchangePaths(diagram: Diagram): RinkPath[] {
  return animationSchedule(diagram).flatMap(({ exchanges, timings, start }) => {
    if (!exchanges.length) return [];
    const group = timings.map(({ action }) => action);
    const positions = group.some(({ pathId }) => pathId === null)
      ? new Map(
          animationScene(diagram, start, "drawing", false).frame.objects.map(
            (object) => [object.id, object],
          ),
        )
      : undefined;
    return exchanges.flatMap(({ starter, plan }) =>
      skatingPassLegs(diagram, group, starter, plan, positions)
        .slice(isStationaryPass(diagram, starter) ? 1 : 0)
        .map(({ route }) => ({
          ...route,
          color: "#000000",
        })),
    );
  });
}

function exchangePuckPosition(
  diagram: Diagram,
  starter: AnimationAction,
  passes: ReturnType<typeof skatingPassLegs>,
  plan: ReturnType<typeof skatingPassPlan>,
  elapsed: number,
  positions: ReadonlyMap<string, Point>,
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
    ? fractionAtTime(trajectory, elapsed, plan.legs.length > 1)
    : elapsed / carrier.durationSeconds;
  const position = skaterPosition(diagram, carrier, fraction, positions);
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
  for (const { start, end, timings, exchanges } of schedule) {
    if (seconds < start || (!includeStartingStep && seconds === start)) break;
    const elapsed = seconds - start;
    const stationaryPasses = new Set(
      exchanges
        .map(({ starter }) => starter)
        .filter((action) => isStationaryPass(diagram, action)),
    );
    for (const action of stationaryPasses) {
      if (action.pathId) snappedPaths.add(action.pathId);
    }
    const motions = timings.flatMap(({ action, end, trajectory, smooth }) => {
      if (stationaryPasses.has(action)) return [];
      const path = diagram.paths.find((item) => item.id === action.pathId);
      if (!path) return [];
      const delivery = isPuckDelivery(path.kind);
      const positionAt = (time: number) =>
        pointAlongRoute(
          path.points,
          trajectory
            ? fractionAtTime(trajectory, time, smooth)
            : time / action.durationSeconds,
        );
      return [{ action, path, end, delivery, positionAt }];
    });
    const movingSkaters = new Set(
      motions
        .filter((motion) => !motion.delivery)
        .map(({ action }) => action.objectId),
    );
    const exchangeLegs = exchanges.flatMap(({ plan }) => plan.legs);
    const exchangePucks = new Set(exchangeLegs.map(({ puckId }) => puckId));
    const exchangeSkaters = new Set(
      exchangeLegs.flatMap(({ sender, receiver }) => [
        sender.objectId,
        receiver.objectId,
      ]),
    );
    for (const puckId of exchangePucks) possession.release(puckId);

    for (const { action, delivery } of motions) {
      if (delivery) possession.release(action.puckId ?? action.objectId);
      else if (action.puckId && !exchangePucks.has(action.puckId)) {
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
    for (const { starter, plan } of exchanges) {
      const passes = skatingPassLegs(
        diagram,
        timings.map(({ action }) => action),
        starter,
        plan,
        positions,
      );
      const passesByPuck = new Map<string, typeof passes>();
      for (const pass of passes) {
        const { route, release, arrival, puckId } = pass;
        exchangeRoutes.push(route);
        if (elapsed >= release && elapsed <= arrival) activePaths.add(route.id);
        if (elapsed >= release && elapsed < arrival)
          liveDeliveries.add(route.id);
        const puckPasses = passesByPuck.get(puckId);
        if (puckPasses) puckPasses.push(pass);
        else passesByPuck.set(puckId, [pass]);
      }
      for (const [puckId, puckPasses] of passesByPuck) {
        positions.set(
          puckId,
          exchangePuckPosition(
            diagram,
            puckPasses[0].sender,
            puckPasses,
            plan,
            elapsed,
            positions,
          ),
        );
        if (seconds >= end) {
          const finalCarrier = puckPasses.at(-1)!.receiver;
          if (
            finalCarrier.pathId === null &&
            !positions.has(finalCarrier.objectId)
          ) {
            const skater = diagram.objects.find(
              ({ id }) => id === finalCarrier.objectId,
            );
            if (skater) positions.set(skater.id, skater);
          }
          possession.claim(finalCarrier.objectId, puckId);
        }
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

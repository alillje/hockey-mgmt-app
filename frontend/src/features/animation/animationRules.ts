import type {
  AnimationAction,
  Diagram,
  RinkObject,
  RinkPath,
} from "../../lib/types";

import {
  defaultPassFlightSeconds,
  passFlightSeconds,
  skatingPassPlan,
} from "./skatingPassTiming";

export const animationLimits = {
  actions: 24,
  seconds: 30,
  minimumAction: 0.1,
  maximumAction: 10,
};
export const routeNames: Record<string, string> = {
  skating: "Skate",
  skatingBackward: "Skate backwards",
  puckHandling: "Skate with puck",
  passing: "Pass",
  shooting: "Shot",
};
export function compatibleRoutes(
  diagram: Diagram,
  actor?: RinkObject,
): RinkPath[] {
  return diagram.paths.filter((path) =>
    actor?.type === "player"
      ? [
          "skating",
          "skatingBackward",
          "puckHandling",
          "passing",
          "shooting",
        ].includes(path.kind)
      : actor?.type === "puck" && ["passing", "shooting"].includes(path.kind),
  );
}
export function needsSelectedPuck(
  actor: RinkObject | undefined,
  path: RinkPath | undefined,
): boolean {
  return (
    actor?.type === "player" &&
    !!path &&
    ["puckHandling", "passing", "shooting"].includes(path.kind)
  );
}

export function isPuckDelivery(kind?: RinkPath["kind"]): boolean {
  return kind === "passing" || kind === "shooting";
}

export function defaultActionSeconds(path?: RinkPath): number {
  if (path?.kind === "passing") return defaultPassFlightSeconds;
  return path?.kind === "shooting" ? passFlightSeconds : 2;
}
export function animationGroups(actions: AnimationAction[]) {
  const groups: AnimationAction[][] = [];
  for (const action of actions) {
    if (!action.startWithPrevious || !groups.length) groups.push([]);
    groups.at(-1)!.push(action);
  }
  return groups;
}

export function scalesSkatingPassGroup(
  group: AnimationAction[],
  action: AnimationAction,
) {
  return group.some(
    (member) =>
      member.skatingPassChain && (member === action || group[0] === action),
  );
}

export function retimeSkatingPassGroup(
  group: AnimationAction[],
  parent: AnimationAction,
  durationSeconds: number,
): AnimationAction[] {
  return group.map((action) => {
    const resized = {
      ...action,
      durationSeconds: Math.max(
        animationLimits.minimumAction,
        (action.durationSeconds / parent.durationSeconds) * durationSeconds,
      ),
    };
    const chain = action.skatingPassChain;
    if (!chain) return resized;

    const { legs } = skatingPassPlan(group, action);
    return {
      ...resized,
      skatingPassChain: {
        ...chain,
        passes: chain.passes.map((pass, index) => ({
          ...pass,
          receiveFraction: pass.receiveFraction ?? legs[index]?.catch.fraction,
        })),
      },
    };
  });
}

export function canSkateAndPass(
  diagram: Diagram,
  action: AnimationAction,
): boolean {
  const kind = diagram.paths.find((item) => item.id === action.pathId)?.kind;
  return (
    kind === "skating" || kind === "skatingBackward" || kind === "puckHandling"
  );
}

export function isStationaryPass(diagram: Diagram, action: AnimationAction) {
  return (
    !!action.puckId &&
    diagram.paths.some(
      (path) => path.id === action.pathId && path.kind === "passing",
    )
  );
}

export function skatingPassError(diagram: Diagram): string | undefined {
  for (const group of animationGroups(diagram.animation?.actions ?? [])) {
    const participants = new Set<string>();
    const pucks = new Set<string>();
    for (const starter of group.filter((action) => action.skatingPassChain)) {
      const error = exchangeError(diagram, group, starter, participants, pucks);
      if (error) return error;
    }
    if (
      group.some(
        (action) => action.pathId === null && !participants.has(action.id),
      )
    )
      return "Stationary participants must be part of a pass exchange.";
  }
}

export function exchangeParticipants(starter: AnimationAction) {
  const participants = new Set([starter.id]);
  for (const pass of starter.skatingPassChain?.passes ?? []) {
    participants.add(pass.receiverActionId);
    if (pass.fromStation) participants.add(pass.fromStation.actionId);
  }
  return participants;
}

function exchangeError(
  diagram: Diagram,
  group: AnimationAction[],
  starter: AnimationAction,
  participants: Set<string>,
  pucks: Set<string>,
): string | undefined {
  const chain = starter.skatingPassChain!;
  const stationary = isStationaryPass(diagram, starter);
  if (
    !(
      canSkateAndPass(diagram, starter) ||
      stationary ||
      starter.pathId === null
    ) ||
    !diagram.objects.some(
      (item) => item.id === chain.puckId && item.type === "puck",
    ) ||
    (starter.puckId && starter.puckId !== chain.puckId) ||
    group.some(
      (action) =>
        action !== starter &&
        (action.objectId === chain.puckId || action.puckId === chain.puckId),
    )
  )
    return "This puck must be available to the players in the exchange.";
  if (!chain.passes.length || chain.passes.length > animationLimits.actions)
    return "Add between 1 and 24 passes to the exchange.";
  if (
    stationary &&
    (chain.passes[0].releaseFraction !== 0 ||
      chain.passes[0].receiveFraction == null)
  )
    return "A pass from a stationary player must start at the puck and end on a skating route.";
  let sender = starter;
  let puckId = chain.puckId;
  const usedPucks = new Set([puckId]);
  const parkedPucks = new Map<string, string>();
  for (const pass of chain.passes) {
    if (pass.fromStation) {
      const next = group.find(({ id }) => id === pass.fromStation!.actionId);
      puckId = pass.fromStation.puckId;
      if (
        !next ||
        next.pathId !== null ||
        !diagram.objects.some(
          (item) => item.type === "puck" && item.id === puckId,
        ) ||
        group.some(
          (action) =>
            action !== starter &&
            (action.objectId === puckId || action.puckId === puckId),
        ) ||
        (usedPucks.has(puckId) && parkedPucks.get(puckId) !== next.id)
      )
        return "Choose a puck available at this station.";
      usedPucks.add(puckId);
      parkedPucks.delete(puckId);
      sender = next;
    }
    const receiver = group.find(
      (action) => action.id === pass.receiverActionId,
    );
    if (
      !receiver ||
      receiver === sender ||
      !(canSkateAndPass(diagram, receiver) || receiver.pathId === null) ||
      (receiver !== starter && receiver.puckId)
    ) {
      return "Choose a different skater in the same group who can receive the puck.";
    }
    if (
      [...parkedPucks].some(
        ([held, carrier]) => held !== puckId && carrier === receiver.id,
      )
    )
      return "That player is already holding another puck.";
    if (receiver.pathId === null) parkedPucks.set(puckId, receiver.id);
    else parkedPucks.delete(puckId);
    sender = receiver;
  }
  for (const id of exchangeParticipants(starter)) {
    if (participants.has(id))
      return "Use different players for simultaneous exchanges.";
    participants.add(id);
  }
  for (const id of usedPucks) {
    if (pucks.has(id)) return "Use different pucks for simultaneous exchanges.";
    pucks.add(id);
  }
  return skatingPassPlan(group, starter).error;
}

export function animationSchedule(diagram: Diagram) {
  let start = 0;
  return animationGroups(diagram.animation?.actions ?? []).map((group) => {
    const exchanges = group
      .filter((action) => action.skatingPassChain)
      .map((starter) => ({ starter, plan: skatingPassPlan(group, starter) }));
    const trajectories = new Map(
      exchanges.flatMap(({ plan }) => [...plan.trajectories]),
    );
    const duration = Math.max(
      ...exchanges.map(({ plan }) => plan.legs.at(-1)?.catch.time ?? 0),
      ...group.map(
        (action) => trajectories.get(action.id)?.end ?? action.durationSeconds,
      ),
    );
    const hasExchange = exchanges.some(
      ({ plan }) => !plan.error && plan.legs.length,
    );
    const timings = group.map((action) => {
      const exchange = exchanges.find(({ plan }) =>
        plan.trajectories.has(action.id),
      );
      const trajectory = trajectories.get(action.id);
      // Let skaters finish together without moving any release or catch waypoint.
      const waypoints = trajectory?.waypoints ?? [{ time: 0, fraction: 0 }];
      const adjusted =
        hasExchange &&
        canSkateAndPass(diagram, action) &&
        waypoints.at(-1)!.fraction < 1
          ? { waypoints, end: duration }
          : trajectory;
      if (adjusted && exchange)
        exchange.plan.trajectories.set(action.id, adjusted);
      return {
        action,
        end: adjusted?.end ?? action.durationSeconds,
        trajectory: adjusted,
        smooth: (exchange?.plan.legs.length ?? 0) > 1,
      };
    });
    const end = start + duration;
    const scheduled = { start, end, timings, exchanges };
    start = end;
    return scheduled;
  });
}

export function animationSeconds(diagram: Diagram): number {
  return animationSchedule(diagram).at(-1)?.end ?? 0;
}

export function sharedMarkerConflict(
  actions: AnimationAction[],
): string | undefined {
  if (actions[0]?.startWithPrevious)
    return "The first action must start a new group.";
  const markers = new Set<string>();
  for (const [index, action] of actions.entries()) {
    if (!action.startWithPrevious) markers.clear();
    if (
      markers.has(action.objectId) ||
      (action.puckId && markers.has(action.puckId))
    ) {
      return `Action ${index + 1} uses a player or puck already used in this group.`;
    }
    markers.add(action.objectId);
    if (action.puckId) markers.add(action.puckId);
  }
}

export function animationErrors(diagram: Diagram): string[] {
  const animation = diagram.animation;
  if (!animation) return [];
  const errors: string[] = [];
  if (animation.version !== 1) errors.push("Unsupported animation version.");
  if (
    animation.actions.length < 1 ||
    animation.actions.length > animationLimits.actions
  )
    errors.push(`Add between 1 and ${animationLimits.actions} actions.`);
  if (animationSeconds(diagram) > animationLimits.seconds)
    errors.push(
      `Keep the animation within ${animationLimits.seconds} seconds.`,
    );
  const exchangeError = skatingPassError(diagram);
  if (exchangeError) errors.push(exchangeError);
  const conflict = sharedMarkerConflict(animation.actions);
  if (conflict) errors.push(conflict);
  const ids = new Set<string>();
  animation.actions.forEach((action, index) => {
    const actor = diagram.objects.find((item) => item.id === action.objectId);
    const path = compatibleRoutes(diagram, actor).find(
      (item) => item.id === action.pathId,
    );
    if (ids.has(action.id))
      errors.push(`Action ${index + 1} has a duplicate ID.`);
    ids.add(action.id);
    if (action.pathId === null ? actor?.type !== "player" : !path)
      errors.push(
        `Choose a matching marker and route for action ${index + 1}.`,
      );
    if (
      !Number.isFinite(action.durationSeconds) ||
      action.durationSeconds < animationLimits.minimumAction ||
      action.durationSeconds > animationLimits.maximumAction
    )
      errors.push(
        `Set action ${index + 1} to ${animationLimits.minimumAction}–${animationLimits.maximumAction} seconds.`,
      );
    if (
      needsSelectedPuck(actor, path) &&
      !diagram.objects.some(
        (item) => item.id === action.puckId && item.type === "puck",
      )
    )
      errors.push(`Choose a puck for action ${index + 1}.`);
    if (!needsSelectedPuck(actor, path) && action.puckId != null)
      errors.push(
        `A separate puck can only be selected for a player or coach carrying, passing or shooting it.`,
      );
  });
  return errors;
}
export function usesAnimationObject(
  action: AnimationAction,
  id: string,
): boolean {
  return (
    action.objectId === id ||
    action.pathId === id ||
    action.puckId === id ||
    action.skatingPassChain?.puckId === id ||
    (action.skatingPassChain?.passes.some(
      ({ fromStation }) => fromStation?.puckId === id,
    ) ??
      false)
  );
}

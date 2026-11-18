import type {
  AnimationAction,
  Diagram,
  RinkObject,
  RinkPath,
} from "../../lib/types";

import { passFlightSeconds, skatingPassPlan } from "./skatingPassTiming";
export { passFlightSeconds } from "./skatingPassTiming";

export const animationLimits = {
  actions: 24,
  seconds: 30,
  minimumAction: 0.5,
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
  return isPuckDelivery(path?.kind) ? passFlightSeconds : 2;
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
  const scale = durationSeconds / parent.durationSeconds;
  return group.map((action) => {
    const resized = {
      ...action,
      durationSeconds:
        action === parent ? durationSeconds : action.durationSeconds * scale,
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
    !action.passRelease &&
    (kind === "skating" ||
      kind === "skatingBackward" ||
      kind === "puckHandling")
  );
}

export function skatingPassError(diagram: Diagram): string | undefined {
  for (const group of animationGroups(diagram.animation?.actions ?? [])) {
    const owners = group.filter((action) => action.skatingPassChain);
    if (!owners.length) continue;
    if (owners.length > 1) return "Keep one puck exchange per group.";
    const starter = owners[0];
    const chain = starter.skatingPassChain!;
    if (
      !canSkateAndPass(diagram, starter) ||
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
    let sender = starter;
    for (const pass of chain.passes) {
      const receiver = group.find(
        (action) => action.id === pass.receiverActionId,
      );
      if (
        !receiver ||
        receiver === sender ||
        !canSkateAndPass(diagram, receiver) ||
        (receiver !== starter && receiver.puckId)
      ) {
        return "Choose a different skater in the same group who can receive the puck.";
      }
      sender = receiver;
    }
    const { error } = skatingPassPlan(group, starter);
    if (error) return error;
  }
}

export function animationSchedule(actions: AnimationAction[]) {
  let start = 0;
  return animationGroups(actions).map((group) => {
    const starter = group.find((action) => action.skatingPassChain);
    const plan = starter && skatingPassPlan(group, starter);
    const timings = group.map((action) => {
      const passEnd = action.passRelease
        ? action.durationSeconds * action.passRelease.fraction +
          passFlightSeconds
        : 0;
      const trajectory = plan?.trajectories.get(action.id);
      const end = Math.max(
        action.durationSeconds,
        passEnd,
        trajectory?.end ?? 0,
      );
      return { action, end, trajectory };
    });
    const end = start + Math.max(...timings.map((timing) => timing.end));
    const scheduled = { start, end, timings, starter, plan };
    start = end;
    return scheduled;
  });
}

export function animationSeconds(diagram: Diagram): number {
  return animationSchedule(diagram.animation?.actions ?? []).at(-1)?.end ?? 0;
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
    if (!path)
      errors.push(
        `Choose a matching marker and route for action ${index + 1}.`,
      );
    if (
      !Number.isFinite(action.durationSeconds) ||
      action.durationSeconds < 0.5 ||
      action.durationSeconds > 10
    )
      errors.push(`Set action ${index + 1} to 0.5–10 seconds.`);
    if (
      needsSelectedPuck(actor, path) &&
      !diagram.objects.some(
        (item) => item.id === action.puckId && item.type === "puck",
      )
    )
      errors.push(`Choose a puck for action ${index + 1}.`);
    if (action.passRelease) {
      const { pathId, fraction } = action.passRelease;
      const pass = diagram.paths.find((item) => item.id === pathId);
      if (
        path?.kind !== "puckHandling" ||
        pass?.kind !== "passing" ||
        pass.points.length !== 2 ||
        !Number.isFinite(fraction) ||
        fraction <= 0 ||
        fraction >= 1
      ) {
        errors.push(
          `Action ${index + 1} needs a pass released along its skating route.`,
        );
      }
    }
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
    action.passRelease?.pathId === id ||
    action.skatingPassChain?.puckId === id
  );
}

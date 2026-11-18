import type {
  AnimationAction,
  Diagram,
  RinkObject,
  RinkPath,
} from "../../lib/types";

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
  return isPuckDelivery(path?.kind) ? 0.5 : 2;
}
export function animationSeconds(diagram: Diagram): number {
  return (
    diagram.animation?.actions.reduce(
      (total, action) => total + action.durationSeconds,
      0,
    ) ?? 0
  );
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
  return action.objectId === id || action.pathId === id || action.puckId === id;
}

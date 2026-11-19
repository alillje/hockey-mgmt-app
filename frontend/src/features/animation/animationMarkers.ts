import type { Diagram, RinkObject } from "../../lib/types";

export function animationMarkers(diagram: Diagram): RinkObject[] {
  return diagram.objects.filter(
    (object) => object.type === "player" || object.type === "puck",
  );
}

/** Stable type-based numbering, shared by selectors, rink labels and exported frames. */
export function animationMarkerNames(diagram: Diagram): Map<string, string> {
  const counts = new Map<string, number>();
  return new Map(
    animationMarkers(diagram).map((object) => {
      const kind =
        object.type === "puck"
          ? "Puck"
          : object.label === "C"
            ? "Coach"
            : "Player";
      const number = (counts.get(kind) ?? 0) + 1;
      counts.set(kind, number);
      return [object.id, `${kind} ${number}`];
    }),
  );
}

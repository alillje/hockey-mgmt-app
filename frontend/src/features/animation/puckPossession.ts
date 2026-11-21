import { rinkWidth } from "../../lib/geometry";
import type { Diagram, Point } from "../../lib/types";

export const puckPickupDistance = 22;
export const defaultPuckOffset = { x: 8, y: 8 };

type HeldPuck = { puckId: string; offset: Point };

export class PuckPossession {
  private readonly bySkater = new Map<string, HeldPuck>();

  get(skaterId: string) {
    return this.bySkater.get(skaterId);
  }

  isHeld(puckId: string) {
    return [...this.bySkater.values()].some((held) => held.puckId === puckId);
  }

  release(puckId: string) {
    for (const [skaterId, held] of this.bySkater) {
      if (held.puckId === puckId) this.bySkater.delete(skaterId);
    }
  }

  claim(skaterId: string, puckId: string, offset = defaultPuckOffset) {
    this.release(puckId);
    this.bySkater.set(skaterId, { puckId, offset });
  }

  place(diagram: Diagram, positions: Map<string, Point>) {
    for (const [skaterId, { puckId, offset }] of this.bySkater) {
      const skater = positions.get(skaterId);
      if (skater)
        positions.set(puckId, carriedPuckPosition(diagram, skater, offset));
    }
  }
}

export function carriedPuckPosition(
  diagram: Diagram,
  skater: Point,
  offset: Point,
): Point {
  return {
    x: Math.max(
      0,
      Math.min(rinkWidth(diagram.rinkSize) - 5, skater.x + offset.x),
    ),
    y: Math.max(0, Math.min(495, skater.y + offset.y)),
  };
}

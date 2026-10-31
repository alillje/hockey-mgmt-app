import type { ObjectKind, PathKind } from "../lib/types";
import { ObjectShape, PathShape } from "./Rink";

export function EquipmentToolIcon({
  type,
  color = "#167e83",
  label = "",
}: {
  type: ObjectKind;
  color?: string;
  label?: string;
}) {
  const viewBox =
    type === "goal"
      ? "-32 -32 64 64"
      : type === "cone"
        ? "-18 -22 36 44"
        : type === "puck"
          ? "-12 -12 24 24"
          : "-24 -24 48 48";
  return (
    <svg
      className="equipment-tool-icon"
      width="24"
      height="24"
      viewBox={viewBox}
      aria-hidden="true"
      focusable="false"
    >
      <ObjectShape
        object={{
          id: "tool-preview",
          type,
          color,
          x: 0,
          y: 0,
          rotation: 0,
          label,
        }}
      />
    </svg>
  );
}

export function PathToolIcon({ kind }: { kind: PathKind }) {
  return (
    <svg
      className="path-tool-icon"
      width="18"
      height="18"
      viewBox="0 0 80 60"
      aria-hidden="true"
      focusable="false"
    >
      <PathShape
        path={{
          id: "tool-preview",
          kind,
          color: "#000000",
          points: [
            { x: 10, y: 44 },
            { x: 60, y: 14 },
          ],
        }}
      />
    </svg>
  );
}

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
        ? "-11 -13 22 26"
        : type === "puck"
          ? "-12 -12 24 24"
          : type === "smallTire"
            ? "-15 -15 30 30"
            : type === "tire"
              ? "-18 -18 36 36"
              : type === "player"
                ? "-17 -17 34 34"
                : type === "longBlock"
                  ? "-50 -11 100 22"
                  : "-24 -24 48 48";
  return (
    <svg
      className={
        type === "cone" ||
        type === "smallTire" ||
        type === "player" ||
        type === "longBlock"
          ? "equipment-tool-icon emphasized"
          : "equipment-tool-icon"
      }
      width="28"
      height="28"
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
      width="26"
      height="26"
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

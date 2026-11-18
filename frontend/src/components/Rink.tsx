import { RinkMarkings } from "./RinkMarkings";
import { useId, type ReactNode } from "react";
export { RinkMarkings };
import type { Diagram, RinkObject, RinkPath } from "../lib/types";
import {
  backwardSkatingData,
  shotRailData,
  pathEndAngle,
} from "../lib/geometry";
export const goalFrameColor = "#bb2d3b";
const longBlockWidth = 85;
const longBlockHeight = 9;
/** Clip strokes, arrowheads and box corners to the same outline as the ice. */
export function RinkDrawingLayer({ children }: { children: ReactNode }) {
  const id = `rink-drawing-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <>
      <defs>
        <clipPath id={id}>
          <rect width="1000" height="500" rx="100" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>{children}</g>
    </>
  );
}
export function pathData(path: RinkPath) {
  if (path.kind === "box" && path.points.length >= 2) {
    const start = path.points[0];
    const end = path.points.at(-1)!;
    return `M ${start.x} ${start.y} H ${end.x} V ${end.y} H ${start.x} Z`;
  }
  return path.points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
}
export function ObjectShape({ object: o }: { object: RinkObject }) {
  return (
    <g transform={`translate(${o.x} ${o.y}) rotate(${o.rotation})`}>
      {o.type === "cone" && (
        <g transform="scale(0.8 0.9)">
          <path
            d="M0 -11L6 8H-6Z"
            fill={o.color}
            stroke="#fff"
            strokeWidth="1.5"
          />
          <path
            d="M-8 9H8"
            stroke={o.color}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      )}
      {o.type === "goal" && (
        <g transform="scale(1.15)">
          {/* Keep the front on the right so saved rotations retain their direction. */}
          <path
            d="M13 -22 C-4 -26 -13 -21 -13 -13 V13 C-13 21 -4 26 13 22 Z"
            fill="#fff"
            stroke={goalFrameColor}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M-7 -21H11 M-10 -18H11 M-11 -15H11 M-11 -12H11 M-11 -9H11 M-11 -6H11 M-11 -3H11 M-11 0H11 M-11 3H11 M-11 6H11 M-11 9H11 M-11 12H11 M-11 15H11 M-10 18H11 M-7 21H11 M-10 -18V18 M-7 -21V21 M-4 -22V22 M-1 -22V22 M2 -22V22 M5 -22V22 M8 -22V22 M11 -21V21"
            fill="none"
            stroke="#bcc9cf"
            strokeWidth="0.55"
          />
          <path
            d="M13 -22 C3 -22 -1 -18 -1 -12 V12 C-1 18 3 22 13 22 M-13 0 H-1"
            fill="none"
            stroke={goalFrameColor}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="13" cy="-22" r="1.6" fill={goalFrameColor} />
          <circle cx="13" cy="22" r="1.6" fill={goalFrameColor} />
        </g>
      )}
      {(o.type === "tire" || o.type === "smallTire") && (
        <g transform={o.type === "smallTire" ? "scale(0.425)" : "scale(0.85)"}>
          <circle r="13" fill="#fff" stroke={o.color} strokeWidth="8" />
        </g>
      )}
      {o.type === "player" && (
        <g transform="scale(0.85)">
          <circle r="15" fill={o.color} stroke="#fff" strokeWidth="2" />
          <text
            textAnchor="middle"
            y="5"
            fill="white"
            fontSize="13"
            fontFamily="Arial"
            fontWeight="700"
          >
            {o.label || "P"}
          </text>
        </g>
      )}
      {o.type === "puck" && (
        <ellipse
          rx="3.5"
          ry="2.1"
          fill={o.color}
          stroke="#fff"
          strokeWidth="0.84"
        />
      )}
      {o.type === "puckPile" && (
        <g fill={o.color} stroke="#fff" strokeWidth="0.77">
          {[
            [-3, -12],
            [7, -14],
            [-12, -3],
            [1, -4],
            [11, 3],
            [-8, 8],
            [-1, 6],
            [4, 13],
          ].map(([x, y]) => (
            <ellipse
              key={`${x}:${y}`}
              cx={x * 0.75}
              cy={y * 0.75}
              rx="3.5"
              ry="2.1"
            />
          ))}
        </g>
      )}
      {o.type === "longBlock" && (
        <rect
          x={-longBlockWidth / 2}
          y={-longBlockHeight / 2}
          width={longBlockWidth}
          height={longBlockHeight}
          rx={1}
          fill={o.color}
        />
      )}
      {o.type === "number" && (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fill="#000"
          fontSize="28"
          fontFamily="Arial"
          fontWeight="600"
        >
          {o.label}
        </text>
      )}
      {o.type === "text" && (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fill={o.color}
          stroke="#fff"
          strokeWidth="3"
          strokeLinejoin="round"
          paintOrder="stroke"
          fontSize="16"
          fontFamily="Arial"
          fontWeight="600"
        >
          {o.label}
        </text>
      )}
      {o.label &&
        o.type !== "player" &&
        o.type !== "number" &&
        o.type !== "text" && (
          <text
            y="31"
            textAnchor="middle"
            fill="#183746"
            fontSize="13"
            fontFamily="Arial"
          >
            {o.label}
          </text>
        )}
    </g>
  );
}
export function PathShape({ path: p }: { path: RinkPath }) {
  return (
    <g
      fill="none"
      stroke={p.color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {p.kind === "shooting" ? (
        <>
          <path d={shotRailData(p.points, -1)} />
          <path d={shotRailData(p.points, 1)} />
        </>
      ) : (
        <path
          d={
            p.kind === "skatingBackward"
              ? backwardSkatingData(p.points)
              : pathData(p)
          }
          strokeDasharray={
            p.kind === "passing"
              ? "10 8"
              : p.kind === "puckHandling"
                ? "2 5"
                : p.kind === "dotted"
                  ? "1 8"
                  : p.kind === "dashed"
                    ? "16 9"
                    : undefined
          }
        />
      )}
      {p.points.length > 1 &&
        p.kind !== "solid" &&
        p.kind !== "dotted" &&
        p.kind !== "dashed" &&
        p.kind !== "box" &&
        (() => {
          const end = p.points.at(-1)!;
          const angle = pathEndAngle(p.points);
          if (angle === null) return null;
          return (
            <path
              d={
                p.kind === "shooting"
                  ? "M-16 -8L14 0L-16 8"
                  : "M-13 -7L0 0L-13 7"
              }
              transform={`translate(${end.x} ${end.y}) rotate(${angle})`}
            />
          );
        })()}
    </g>
  );
}
export function DiagramSvg({ diagram }: { diagram: Diagram }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1000 500"
      width="1000"
      height="500"
    >
      <RinkMarkings />
      <RinkDrawingLayer>
        {diagram.paths.map((p) => (
          <PathShape key={p.id} path={p} />
        ))}
      </RinkDrawingLayer>
      {diagram.objects.map((o) => (
        <ObjectShape key={o.id} object={o} />
      ))}
    </svg>
  );
}

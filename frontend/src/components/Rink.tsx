import type { Diagram, RinkObject, RinkPath } from "../lib/types";
import {
  backwardSkatingData,
  shotRailData,
  pathEndAngle,
} from "../lib/geometry";
export function pathData(path: RinkPath) {
  return path.points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
}
export function RinkMarkings() {
  return (
    <>
      <rect width="1000" height="500" rx="100" fill="#fff" />
      <g fill="none" strokeWidth="3">
        <path d="M500 0V500" stroke="#d9848d" strokeDasharray="10 7" />
        <path d="M330 0V500M670 0V500" stroke="#71a6ca" strokeWidth="7" />
        <path d="M95 2V498M905 2V498" stroke="#d9848d" />
        <circle cx="500" cy="250" r="66" stroke="#71a6ca" />
        {[190, 810].map((x) =>
          [125, 375].map((y) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="62" stroke="#dfa2a7" />
              <circle cx={x} cy={y} r="4" fill="#d9848d" stroke="none" />
            </g>
          )),
        )}
        <path
          d="M95 210A40 40 0 0 1 95 290ZM905 210A40 40 0 0 0 905 290Z"
          fill="#dceff6"
          stroke="#d9848d"
        />
        <circle cx="500" cy="250" r="4" fill="#71a6ca" stroke="none" />
      </g>
      <rect
        x="2"
        y="2"
        width="996"
        height="496"
        rx="98"
        fill="none"
        stroke="#c1cfd4"
        strokeWidth="4"
      />
    </>
  );
}
export function ObjectShape({ object: o }: { object: RinkObject }) {
  return (
    <g transform={`translate(${o.x} ${o.y}) rotate(${o.rotation})`}>
      {o.type === "cone" && (
        <>
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
        </>
      )}
      {o.type === "goal" && (
        <g transform="scale(1.15)">
          {/* The front crossbar is on the right at zero rotation. */}
          <path
            d="M13 -22H-2C-18 -22 -19 -4 -11 0C-19 4 -18 22 -2 22H13Z"
            fill="#eef1f2"
          />
          <path
            d="M-11 -16H12M-13 -8H12M-11 0H12M-13 8H12M-11 16H12M-9 -17V-3M-9 3V17M-3 -20V20M3 -21V21M9 -21V21"
            fill="none"
            stroke="#a8b4ba"
            strokeWidth="1"
          />
          <path
            d="M13 -22H-2C-18 -22 -19 -4 -11 0C-19 4 -18 22 -2 22H13"
            fill="none"
            stroke="#dc3545"
            strokeWidth="5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path d="M13 -22V22" stroke="#dc3545" strokeWidth="3" />
          <circle cx="13" cy="-22" r="4" fill="#dc3545" />
          <circle cx="13" cy="22" r="4" fill="#dc3545" />
        </g>
      )}
      {(o.type === "tire" || o.type === "smallTire") && (
        <g transform={o.type === "smallTire" ? "scale(0.5)" : undefined}>
          <circle r="13" fill="#fff" stroke={o.color} strokeWidth="8" />
        </g>
      )}
      {o.type === "player" && (
        <>
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
        </>
      )}
      {o.type === "puck" && (
        <ellipse rx="5" ry="3" fill={o.color} stroke="#fff" strokeWidth="1.2" />
      )}
      {o.type === "puckPile" && (
        <g fill={o.color} stroke="#fff" strokeWidth="1.1">
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
            <ellipse key={`${x}:${y}`} cx={x} cy={y} rx="5" ry="3" />
          ))}
        </g>
      )}
      {o.label && o.type !== "player" && (
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
      strokeWidth="3.5"
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
      {diagram.paths.map((p) => (
        <PathShape key={p.id} path={p} />
      ))}
      {diagram.objects.map((o) => (
        <ObjectShape key={o.id} object={o} />
      ))}
    </svg>
  );
}

import type { Diagram, RinkObject, RinkPath } from "../lib/types";
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
        <path d="M95 37V463M905 37V463" stroke="#d9848d" />
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
            d="M0 -15L12 12H-12Z"
            fill={o.color}
            stroke="#fff"
            strokeWidth="2"
          />
          <path
            d="M-16 14H16"
            stroke={o.color}
            strokeWidth="5"
            strokeLinecap="round"
          />
        </>
      )}
      {o.type === "goal" && (
        <>
          <path
            d="M-20 -12H20V13H-20Z"
            fill="#fff"
            fillOpacity=".8"
            stroke={o.color}
            strokeWidth="4"
          />
          <path
            d="M-15 -8L15 9M-5 -8L20 9M-20 -1L0 10M-15 9L8 -9M0 9L19 -6"
            stroke={o.color}
            strokeWidth="1"
          />
        </>
      )}
      {o.type === "tire" && (
        <circle r="13" fill="#fff" stroke={o.color} strokeWidth="8" />
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
        <ellipse rx="8" ry="6" fill={o.color} stroke="#fff" strokeWidth="1.5" />
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
      <path
        d={pathData(p)}
        strokeDasharray={
          p.kind === "passing"
            ? "10 8"
            : p.kind === "puckHandling"
              ? "2 5"
              : undefined
        }
      />
      {p.points.length > 1 &&
        (() => {
          const end = p.points.at(-1)!,
            prev = p.points.at(-2)!;
          const angle =
            (Math.atan2(end.y - prev.y, end.x - prev.x) * 180) / Math.PI;
          return (
            <path
              d="M-13 -7L0 0L-13 7"
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

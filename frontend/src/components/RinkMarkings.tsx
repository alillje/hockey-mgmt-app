const blueLinePositions = [365, 635];
const neutralFaceoffPositions = [395, 605];
const faceoffRows = [125, 375];

function EndZoneFaceoff({ x, y }: { x: number; y: number }) {
  const radius = 62;
  const hashOffset = 10;
  const circleEdge = Math.sqrt(radius ** 2 - hashOffset ** 2);
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={radius} stroke="#dfa2a7" />
      <circle r="4" fill="#d9848d" stroke="none" />
      <g stroke="#dfa2a7" strokeWidth="2">
        <path
          d={`M-25 -6H-${hashOffset}V-24M25 -6H${hashOffset}V-24M-25 6H-${hashOffset}V24M25 6H${hashOffset}V24`}
        />
        {[-1, 1].flatMap((side) =>
          [-1, 1].map((end) => (
            <path
              key={`${side}-${end}`}
              d={`M${side * hashOffset} ${end * circleEdge}V${end * (circleEdge + 12)}`}
            />
          )),
        )}
      </g>
    </g>
  );
}

export function RinkMarkings() {
  return (
    <>
      <rect width="1000" height="500" rx="100" fill="#fff" />
      <g fill="none" strokeWidth="3">
        <path d="M500 0V500" stroke="#d9848d" strokeWidth="7" />
        {blueLinePositions.map((x) => (
          <path key={x} d={`M${x} 0V500`} stroke="#71a6ca" strokeWidth="7" />
        ))}
        <path d="M72 6V494M928 6V494" stroke="#d9848d" />
        <circle cx="500" cy="250" r="66" stroke="#71a6ca" />
        {neutralFaceoffPositions.flatMap((x) =>
          faceoffRows.map((y) => (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r="4"
              fill="#d9848d"
              stroke="none"
            />
          )),
        )}
        {[190, 810].flatMap((x) =>
          faceoffRows.map((y) => (
            <EndZoneFaceoff key={`${x}-${y}`} x={x} y={y} />
          )),
        )}
        <path
          d="M72 210A40 40 0 0 1 72 290ZM928 210A40 40 0 0 0 928 290Z"
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

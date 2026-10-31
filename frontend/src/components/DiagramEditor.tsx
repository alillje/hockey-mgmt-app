import { Fragment, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { MousePointer2, Undo2, Redo2, RotateCw, Trash2 } from "lucide-react";
import type { Diagram, ObjectKind, PathKind, Point } from "../lib/types";
import { commit, initialHistory, redo, undo } from "../lib/history";
import {
  extendRoute,
  limitPoints,
  nextRotation,
  translateRoute,
} from "../lib/geometry";
import {
  ObjectShape,
  PathShape,
  RinkMarkings,
  pathData,
  goalFrameColor,
} from "./Rink";
import { EquipmentToolIcon, PathToolIcon } from "./EditorToolIcon";
type Tool = "select" | "redPlayer" | "coach" | ObjectKind | PathKind;
const objects: {
  id: ObjectKind | "redPlayer" | "coach";
  type: ObjectKind;
  name: string;
  defaultColor?: string;
  defaultLabel?: string;
}[] = [
  {
    id: "cone",
    type: "cone",
    name: "Cone",
    defaultColor: "#e69346",
  },
  {
    id: "goal",
    type: "goal",
    name: "Goal",
    defaultColor: goalFrameColor,
  },
  {
    id: "tire",
    type: "tire",
    name: "Tire",
    defaultColor: "#233b45",
  },
  {
    id: "smallTire",
    type: "smallTire",
    name: "Small tire",
    defaultColor: "#233b45",
  },
  { id: "player", type: "player", name: "Player" },
  {
    id: "redPlayer",
    type: "player",
    name: "Player",
    defaultColor: "#dc3545",
  },
  {
    id: "coach",
    type: "player",
    name: "Coach",
    defaultColor: "#233b45",
    defaultLabel: "C",
  },
  {
    id: "puck",
    type: "puck",
    name: "Puck",
    defaultColor: "#233b45",
  },
  {
    id: "puckPile",
    type: "puckPile",
    name: "Puck pile",
    defaultColor: "#233b45",
  },
];
export default function DiagramEditor({
  diagram,
  onChange,
}: {
  diagram: Diagram;
  onChange: (d: Diagram) => void;
}) {
  const [history, setHistory] = useState(() => initialHistory(diagram));
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Diagram | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const gesture = useRef<{
    id: string;
    kind: "object" | "path";
    start: Point;
    original: Diagram;
  } | null>(null);
  const current = draft || history.present;
  function save(d: Diagram) {
    const next = commit(history, d);
    setHistory(next);
    onChange(next.present);
  }
  function navigate(direction: "undo" | "redo") {
    const next = direction === "undo" ? undo(history) : redo(history);
    setHistory(next);
    onChange(next.present);
    setSelected(null);
  }
  function point(e: PointerEvent): Point {
    const matrix = svg.current!.getScreenCTM()!;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      matrix.inverse(),
    );
    return {
      x: Math.max(18, Math.min(982, p.x)),
      y: Math.max(18, Math.min(482, p.y)),
    };
  }
  function start(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const p = point(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    const id = crypto.randomUUID();
    if (tool === "select") {
      const target = (e.target as Element).closest("[data-id]");
      const found = target?.getAttribute("data-id") || null;
      setSelected(found);
      if (found)
        gesture.current = {
          id: found,
          kind: "object",
          start: p,
          original: history.present,
        };
      return;
    }
    const objectTool = objects.find((o) => o.id === tool);
    if (objectTool) {
      if (current.objects.length >= 200) return;
      save({
        ...current,
        objects: [
          ...current.objects,
          {
            id,
            type: objectTool.type,
            ...p,
            rotation: 0,
            color: objectTool.defaultColor || "#167e83",
            label: objectTool.defaultLabel || "",
          },
        ],
      });
      setSelected(id);
      return;
    }
    if (current.paths.length >= 100) return;
    const d = {
      ...history.present,
      paths: [
        ...history.present.paths,
        {
          id,
          kind: tool as PathKind,
          points: [p],
          color: "#000000",
        },
      ],
    };
    gesture.current = { id, kind: "path", start: p, original: history.present };
    setDraft(d);
    setSelected(id);
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g) return;
    const p = point(e);
    if (g.kind === "path")
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              paths: prev.paths.map((path) =>
                path.id === g.id
                  ? { ...path, points: extendRoute(path.kind, path.points, p) }
                  : path,
              ),
            }
          : prev,
      );
    else
      setDraft({
        ...g.original,
        objects: g.original.objects.map((o) =>
          o.id === g.id
            ? {
                ...o,
                x: Math.max(18, Math.min(982, o.x + p.x - g.start.x)),
                y: Math.max(18, Math.min(482, o.y + p.y - g.start.y)),
              }
            : o,
        ),
        paths: g.original.paths.map((path) =>
          path.id === g.id
            ? {
                ...path,
                points: translateRoute(path.points, {
                  x: p.x - g.start.x,
                  y: p.y - g.start.y,
                }),
              }
            : path,
        ),
      });
  }
  function finish() {
    if (draft) {
      const cleaned = {
        ...draft,
        paths: draft.paths
          .filter(
            (p) =>
              p.points.length > 1 &&
              (p.kind !== "box" ||
                (Math.abs(p.points[0].x - p.points.at(-1)!.x) >= 1 &&
                  Math.abs(p.points[0].y - p.points.at(-1)!.y) >= 1)),
          )
          .map((p) => ({ ...p, points: limitPoints(p.points) })),
      };
      save(cleaned);
    }
    setDraft(null);
    gesture.current = null;
  }
  function remove() {
    if (selected) {
      save({
        ...current,
        objects: current.objects.filter((o) => o.id !== selected),
        paths: current.paths.filter((p) => p.id !== selected),
      });
      setSelected(null);
    }
  }
  const selectedObject = current.objects.find((o) => o.id === selected);
  return (
    <section className="diagram-card" aria-label="Drill diagram editor">
      <div className="tool-row">
        <button
          className={tool === "select" ? "tool active" : "tool"}
          onClick={() => setTool("select")}
          title="Select and move"
          aria-pressed={tool === "select"}
        >
          <MousePointer2 size={18} />
          <span>Select</span>
        </button>
        <span className="tool-divider" />
        {objects.map((o) => (
          <button
            key={o.id}
            className={tool === o.id ? "tool active" : "tool"}
            onClick={() => setTool(o.id)}
            aria-pressed={tool === o.id}
            disabled={current.objects.length >= 200}
          >
            <EquipmentToolIcon
              type={o.type}
              color={o.defaultColor}
              label={o.defaultLabel}
            />
            <span>{o.name}</span>
          </button>
        ))}
        <span className="tool-divider" />
        {(
          [
            ["skating", "Skate"],
            ["skatingBackward", "Skate backwards"],
            ["passing", "Pass"],
            ["puckHandling", "Skate with puck"],
            ["shooting", "Shot"],
            ["solid", "Full line"],
            ["dotted", "Dotted line"],
            ["dashed", "Dashed line"],
            ["box", "Box"],
          ] as [PathKind, string][]
        ).map(([id, name]) => (
          <Fragment key={id}>
            {id === "solid" && (
              <span className="tool-divider" aria-hidden="true" />
            )}
            <button
              className={tool === id ? "tool active" : "tool"}
              onClick={() => setTool(id)}
              aria-pressed={tool === id}
              disabled={current.paths.length >= 100}
            >
              <PathToolIcon kind={id} />
              <span>{name}</span>
            </button>
          </Fragment>
        ))}
      </div>
      <div
        className={
          "rink-wrap " + (tool === "select" ? "select-cursor" : "draw-cursor")
        }
      >
        <svg
          ref={svg}
          viewBox="0 0 1000 500"
          role="img"
          aria-label="Interactive hockey rink. Choose a tool then click to place objects, drag to draw paths, or select and drag items to move them."
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={() => {
            setDraft(null);
            gesture.current = null;
          }}
        >
          <RinkMarkings />
          {current.paths.map((p) => (
            <g data-id={p.id} key={p.id}>
              <path
                d={pathData(p)}
                fill="none"
                stroke="transparent"
                strokeWidth="22"
              />
              {selected === p.id && (
                <path
                  d={pathData(p)}
                  fill="none"
                  stroke="#20acb0"
                  strokeWidth="11"
                  opacity=".2"
                />
              )}
              <PathShape path={p} />
            </g>
          ))}
          {current.objects.map((o) => (
            <g data-id={o.id} key={o.id}>
              {selected === o.id && (
                <circle
                  cx={o.x}
                  cy={o.y}
                  r="25"
                  fill="#b5eeee"
                  fillOpacity=".4"
                  stroke="#16868b"
                  strokeDasharray="4 3"
                />
              )}
              <ObjectShape object={o} />
            </g>
          ))}
        </svg>
      </div>
      <div className="editor-footer">
        <div className="inline">
          <button
            className="icon-button"
            aria-label="Undo diagram change"
            disabled={!history.past.length}
            onClick={() => navigate("undo")}
          >
            <Undo2 size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Redo diagram change"
            disabled={!history.future.length}
            onClick={() => navigate("redo")}
          >
            <Redo2 size={18} />
          </button>
          <span className="tool-divider" />
          <button
            className="icon-button"
            aria-label={
              selectedObject?.type === "goal"
                ? "Rotate selected goal 90 degrees"
                : "Rotate selected object 45 degrees"
            }
            disabled={!selectedObject}
            onClick={() =>
              save({
                ...current,
                objects: current.objects.map((o) =>
                  o.id === selected
                    ? {
                        ...o,
                        rotation: nextRotation(o.rotation, o.type === "goal"),
                      }
                    : o,
                ),
              })
            }
          >
            <RotateCw size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Delete selected item"
            disabled={!selected}
            onClick={remove}
          >
            <Trash2 size={18} />
          </button>
        </div>
        <span className="small muted">
          {current.objects.length} objects · {current.paths.length} routes
        </span>
      </div>
    </section>
  );
}

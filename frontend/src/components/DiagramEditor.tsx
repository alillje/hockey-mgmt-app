import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import {
  MousePointer2,
  Undo2,
  Redo2,
  RotateCw,
  Trash2,
  MoveUpRight,
} from "lucide-react";
import type { Diagram, ObjectKind, PathKind, Point } from "../lib/types";
import { commit, initialHistory, redo, undo } from "../lib/history";
import { limitPoints } from "../lib/geometry";
import { ObjectShape, PathShape, RinkMarkings, pathData } from "./Rink";
type Tool = "select" | ObjectKind | PathKind;
const objects: { id: ObjectKind; name: string; symbol: string }[] = [
  { id: "cone", name: "Cone", symbol: "▲" },
  { id: "goal", name: "Goal", symbol: "▥" },
  { id: "tire", name: "Tire", symbol: "◉" },
  { id: "player", name: "Player", symbol: "●" },
  { id: "puck", name: "Puck", symbol: "⬤" },
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
  const [color, setColor] = useState("#167e83");
  const [label, setLabel] = useState("");
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
    if (objects.some((o) => o.id === tool)) {
      if (current.objects.length >= 200) return;
      save({
        ...current,
        objects: [
          ...current.objects,
          {
            id,
            type: tool as ObjectKind,
            ...p,
            rotation: 0,
            color:
              tool === "puck" || tool === "tire"
                ? "#233b45"
                : tool === "cone"
                  ? "#e69346"
                  : color,
            label,
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
        { id, kind: tool as PathKind, points: [p], color },
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
                  ? { ...path, points: [...path.points, p] }
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
                points: path.points.map((pt) => ({
                  x: Math.max(18, Math.min(982, pt.x + p.x - g.start.x)),
                  y: Math.max(18, Math.min(482, pt.y + p.y - g.start.y)),
                })),
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
          .filter((p) => p.points.length > 1)
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
      <div className="diagram-heading">
        <div>
          <span className="eyebrow">THE ICE</span>
          <h2>Build the next play</h2>
        </div>
        <span className="small muted">Full rink · drag to draw or move</span>
      </div>
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
            <span aria-hidden="true" className={"object-icon " + o.id}>
              {o.symbol}
            </span>
            <span>{o.name}</span>
          </button>
        ))}
        <span className="tool-divider" />
        {(["skating", "passing", "puckHandling"] as PathKind[]).map((id, i) => (
          <button
            key={id}
            className={tool === id ? "tool active" : "tool"}
            onClick={() => setTool(id)}
            aria-pressed={tool === id}
            disabled={current.paths.length >= 100}
          >
            <MoveUpRight size={18} strokeDasharray={i ? "3 3" : undefined} />
            <span>{["Skate", "Pass", "Puck handling"][i]}</span>
          </button>
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
            aria-label="Rotate selected object 45 degrees"
            disabled={!selectedObject}
            onClick={() =>
              save({
                ...current,
                objects: current.objects.map((o) =>
                  o.id === selected
                    ? { ...o, rotation: (o.rotation + 45) % 360 }
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
        <div className="inline tool-settings">
          <label>
            Color{" "}
            <input
              type="color"
              aria-label="Drawing and player color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <label>
            Label{" "}
            <input
              placeholder="e.g. 1"
              maxLength={16}
              value={selectedObject?.label ?? label}
              onChange={(e) =>
                selectedObject
                  ? save({
                      ...current,
                      objects: current.objects.map((o) =>
                        o.id === selected ? { ...o, label: e.target.value } : o,
                      ),
                    })
                  : setLabel(e.target.value)
              }
            />
          </label>
        </div>
        <span className="small muted">
          {current.objects.length} objects · {current.paths.length} routes
        </span>
      </div>
    </section>
  );
}

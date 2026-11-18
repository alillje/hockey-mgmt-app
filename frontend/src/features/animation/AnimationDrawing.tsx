import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import {
  ObjectShape,
  PathShape,
  RinkDrawingLayer,
  RinkMarkings,
} from "../../components/Rink";
import { constrainToRink, extendRoute, limitPoints } from "../../lib/geometry";
import type {
  Diagram,
  PathKind,
  Point,
  RinkObject,
  RinkPath,
} from "../../lib/types";
import { animationMarkerNames } from "./animationMarkers";
import {
  animationLimits,
  animationSeconds,
  defaultActionSeconds,
  isPuckDelivery,
  needsSelectedPuck,
  routeNames,
} from "./animationRules";
import { animationFrame } from "./animationTimeline";
import { Redo2, Undo2 } from "lucide-react";

const skaterTools: PathKind[] = [
  "skating",
  "skatingBackward",
  "puckHandling",
  "passing",
  "shooting",
];
const puckTools: PathKind[] = ["passing", "shooting"];

function rinkPoint(event: PointerEvent<SVGSVGElement>): Point {
  const matrix = event.currentTarget.getScreenCTM();
  const point = new DOMPoint(event.clientX, event.clientY);
  return constrainToRink(
    matrix ? point.matrixTransform(matrix.inverse()) : point,
  );
}

type DrawingGesture = {
  pointerId: number;
  path?: RinkPath;
  actor?: RinkObject;
  target?: RinkObject;
  puck?: RinkObject;
  newPuck?: RinkObject;
  start: Point;
  moved: boolean;
};

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export default function AnimationDrawing({
  diagram,
  onChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  diagram: Diagram;
  onChange: (diagram: Diagram) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const [actorId, setActorId] = useState<string>();
  const [kind, setKind] = useState<PathKind>("skating");
  const [objectLimitReached, setObjectLimitReached] = useState(false);
  const [stroke, setStroke] = useState<RinkPath>();
  const gesture = useRef<DrawingGesture | null>(null);
  const actions = diagram.animation?.actions ?? [];
  const duration = animationSeconds(diagram);
  const scene = actions.length ? animationFrame(diagram, duration) : diagram;
  const names = animationMarkerNames(diagram);
  const actor = scene.objects.find(
    (item) => item.id === actorId && names.has(item.id),
  );
  const tool =
    actor?.type === "puck" && !puckTools.includes(kind) ? "passing" : kind;
  const limit =
    actions.length >= animationLimits.actions ||
    duration > animationLimits.seconds - animationLimits.minimumAction ||
    diagram.paths.length >= 100;

  function select(item: RinkObject) {
    setActorId(item.id);
    setObjectLimitReached(false);
  }

  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || !event.isPrimary || gesture.current) return;
    const marker = (event.target as Element).closest("[data-animation-object]");
    const target = scene.objects.find(
      (item) => item.id === marker?.getAttribute("data-animation-object"),
    );
    const start = rinkPoint(event);
    // A puck can cover a player's hit target. Dragging from their feet still
    // starts with that player, while clicking can select the puck itself.
    const playerAtPuck =
      target?.type === "puck" && target.id !== actor?.id
        ? scene.objects.find(
            (item) => item.type === "player" && distance(item, target) <= 14,
          )
        : undefined;
    const source =
      playerAtPuck ??
      (target?.type === "puck" && tool === "puckHandling" ? actor : target) ??
      actor;

    const active: DrawingGesture = {
      pointerId: event.pointerId,
      target,
      actor: source,
      start,
      moved: false,
    };
    setObjectLimitReached(false);
    if (source && !limit) {
      const path: RinkPath = {
        id: crypto.randomUUID(),
        kind:
          source.type === "puck" && !puckTools.includes(tool)
            ? "passing"
            : tool,
        points: [],
        color: "#167e83",
      };
      const needsPuck = needsSelectedPuck(source, path);
      if (needsPuck) {
        active.puck = scene.objects
          .filter(
            (item) => item.type === "puck" && distance(item, source) <= 22,
          )
          .sort((a, b) => distance(a, source) - distance(b, source))[0];
        if (!active.puck && diagram.objects.length < 200) {
          active.newPuck = {
            id: crypto.randomUUID(),
            type: "puck",
            x: source.x,
            y: source.y,
            rotation: 0,
            color: "#233b45",
            label: "",
          };
          active.puck = active.newPuck;
        }
      }
      if (!needsPuck || active.puck) {
        const origin =
          isPuckDelivery(path.kind) && active.puck ? active.puck : source;
        active.path = { ...path, points: [constrainToRink(origin)] };
      } else {
        setObjectLimitReached(true);
      }
    }
    if (!active.path && !target) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = active;
  }

  function move(event: PointerEvent<SVGSVGElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const point = rinkPoint(event);
    active.moved ||= distance(point, active.start) >= 2;
    if (!active.moved || !active.path) return;
    active.path = {
      ...active.path,
      points: extendRoute(active.path.kind, active.path.points, point),
    };
    setStroke(active.path);
  }

  function cancel(event: PointerEvent<SVGSVGElement>) {
    if (gesture.current?.pointerId !== event.pointerId) return;
    gesture.current = null;
    setStroke(undefined);
  }

  function finish(event: PointerEvent<SVGSVGElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    cancel(event);
    const end = rinkPoint(event);
    if (!active.moved && distance(end, active.start) < 2) {
      if (active.target) select(active.target);
      return;
    }
    if (!active.path || !active.actor) return;
    const points = limitPoints(
      extendRoute(active.path.kind, active.path.points, end),
    );
    const [origin] = points;
    if (
      !points.some(
        (point) => Math.hypot(point.x - origin.x, point.y - origin.y) >= 2,
      )
    )
      return;
    const path = { ...active.path, color: "#000000", points };
    setActorId(active.actor.id);
    onChange({
      ...diagram,
      objects: active.newPuck
        ? [...diagram.objects, active.newPuck]
        : diagram.objects,
      paths: [...diagram.paths, path],
      animation: {
        version: 1,
        actions: [
          ...actions,
          {
            id: crypto.randomUUID(),
            objectId: active.actor.id,
            pathId: path.id,
            puckId: active.puck?.id ?? null,
            durationSeconds: Math.min(
              defaultActionSeconds(path),
              animationLimits.seconds - duration,
            ),
          },
        ],
      },
    });
  }

  let instruction = "Select a player, coach or puck on the rink.";
  if (actor) instruction = "Drag across the ice to draw the next movement.";
  if (objectLimitReached)
    instruction = "Remove an object to make room for a puck at this player.";
  if (limit)
    instruction = "This drawing has reached the animation or route limit.";

  return (
    <section aria-label="Draw animation">
      <div className="animation-draw-tools">
        <button
          type="button"
          className="button secondary"
          aria-label="Undo animation drawing change"
          disabled={!canUndo || !!stroke}
          onClick={onUndo}
        >
          <Undo2 size={16} /> Undo
        </button>
        <button
          type="button"
          className="button secondary"
          aria-label="Redo animation drawing change"
          disabled={!canRedo || !!stroke}
          onClick={onRedo}
        >
          <Redo2 size={16} /> Redo
        </button>
        {actor &&
          (actor.type === "puck" ? puckTools : skaterTools).map((value) => (
            <button
              key={value}
              type="button"
              className="button secondary"
              aria-pressed={tool === value}
              disabled={!!stroke || limit}
              onClick={() => {
                setKind(value);
                setObjectLimitReached(false);
              }}
            >
              {routeNames[value]}
            </button>
          ))}
      </div>
      <p className="muted animation-draw-instruction" role="status">
        {instruction}
      </p>
      <div className="animation-rink animation-draw-rink">
        <svg
          viewBox="0 0 1000 500"
          aria-label="Animation drawing rink"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={cancel}
          onLostPointerCapture={cancel}
        >
          <RinkMarkings />
          <RinkDrawingLayer>
            <g pointerEvents="none">
              {scene.paths.map((path) => (
                <PathShape key={path.id} path={{ ...path, color: "#b9c6ca" }} />
              ))}
              {stroke && <PathShape path={stroke} />}
            </g>
          </RinkDrawingLayer>
          {scene.objects.map((item) => {
            const name = names.get(item.id);
            return name ? (
              <g
                key={item.id}
                data-animation-object={item.id}
                role="button"
                tabIndex={0}
                aria-label={name}
                aria-pressed={item.id === actor?.id}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (!gesture.current) select(item);
                  }
                }}
              >
                <circle
                  className="animation-marker-target"
                  cx={item.x}
                  cy={item.y}
                  r={item.type === "puck" ? 10 : 22}
                  fill="transparent"
                />
                <ObjectShape object={item} />
              </g>
            ) : (
              <ObjectShape key={item.id} object={item} />
            );
          })}
          <g className="animation-marker-labels" aria-hidden="true">
            {scene.objects.map(({ id, type, x, y }) => {
              const name = names.get(id);
              if (!name) return null;
              const nearRightEdge = x > 870;
              return (
                <text
                  key={id}
                  x={x + (nearRightEdge ? -12 : 12)}
                  y={Math.max(
                    16,
                    Math.min(487, y + (type === "puck" ? 19 : -21)),
                  )}
                  textAnchor={nearRightEdge ? "end" : "start"}
                >
                  {name}
                </text>
              );
            })}
          </g>
        </svg>
      </div>
    </section>
  );
}

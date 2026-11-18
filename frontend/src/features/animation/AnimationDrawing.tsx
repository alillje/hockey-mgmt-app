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
  AnimationAction,
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
  passFlightSeconds,
  routeNames,
} from "./animationRules";
import { animationFrame, nearestRelease } from "./animationTimeline";
import { Redo2, Undo2 } from "lucide-react";

type DrawingTool = PathKind | "passWhileSkating";

const skaterTools: DrawingTool[] = [
  "skating",
  "skatingBackward",
  "puckHandling",
  "passing",
  "shooting",
  "passWhileSkating",
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
  diagram: Diagram;
  path?: RinkPath;
  actor?: RinkObject;
  target?: RinkObject;
  puck?: RinkObject;
  newPuck?: RinkObject;
  start: Point;
  moved: boolean;
};

type PassDraft = {
  diagram: Diagram;
  actor: RinkObject;
  puck: RinkObject;
  newPuck?: RinkObject;
  skate: RinkPath;
  release?: NonNullable<ReturnType<typeof nearestRelease>>;
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
  const [kind, setKind] = useState<DrawingTool>("skating");
  const [passDraft, setPassDraft] = useState<PassDraft>();
  const pendingPass = passDraft?.diagram === diagram ? passDraft : undefined;
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
    actor?.type === "puck" && kind !== "passing" && kind !== "shooting"
      ? "passing"
      : kind;
  const drawingKind = tool === "passWhileSkating" ? "puckHandling" : tool;
  const limit =
    actions.length >= animationLimits.actions ||
    duration > animationLimits.seconds - animationLimits.minimumAction ||
    diagram.paths.length >= 100;
  const remaining = animationLimits.seconds - duration;
  const passLimit = diagram.paths.length > 98 || remaining < 1;

  function select(item: RinkObject) {
    setActorId(item.id);
    setObjectLimitReached(false);
  }

  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || !event.isPrimary || gesture.current) return;
    const start = rinkPoint(event);
    if (pendingPass) {
      if (!pendingPass.release) {
        const release = nearestRelease(pendingPass.skate.points, start);
        if (release) setPassDraft({ ...pendingPass, release });
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = {
        pointerId: event.pointerId,
        diagram,
        actor: pendingPass.actor,
        path: {
          id: crypto.randomUUID(),
          kind: "passing",
          points: [pendingPass.release.point],
          color: "#167e83",
        },
        start,
        moved: false,
      };
      return;
    }
    const marker = (event.target as Element).closest("[data-animation-object]");
    const target = scene.objects.find(
      (item) => item.id === marker?.getAttribute("data-animation-object"),
    );
    // A puck can cover a player's hit target. Dragging from their feet still
    // starts with that player, while clicking can select the puck itself.
    const playerAtPuck =
      target?.type === "puck" && target.id !== actor?.id
        ? scene.objects.find(
            (item) => item.type === "player" && distance(item, target) <= 14,
          )
        : undefined;
    const skatingTool = !puckTools.includes(drawingKind);
    const source =
      playerAtPuck ??
      (target?.type === "puck" && skatingTool ? actor : target) ??
      actor;

    const active: DrawingGesture = {
      pointerId: event.pointerId,
      diagram,
      target,
      actor: source,
      start,
      moved: false,
    };
    setObjectLimitReached(false);
    if (
      source &&
      !limit &&
      (tool !== "passWhileSkating" || (!passLimit && source.type === "player"))
    ) {
      const path: RinkPath = {
        id: crypto.randomUUID(),
        kind:
          source.type === "puck" && !puckTools.includes(drawingKind)
            ? "passing"
            : drawingKind,
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
    if (active.path) event.preventDefault();
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
    completeGesture(active, rinkPoint(event));
  }

  function finishLostCapture(event: PointerEvent<SVGSVGElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    cancel(event);
    const end = active.path?.points.at(-1);
    if (active.moved && end) completeGesture(active, end);
  }

  function completeGesture(active: DrawingGesture, end: Point) {
    if (active.diagram !== diagram) return;
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
    if (pendingPass?.release) {
      const { actor, puck, newPuck, skate, release } = pendingPass;
      const durationSeconds = Math.min(
        defaultActionSeconds(skate),
        remaining,
        (remaining - passFlightSeconds) / release.fraction,
      );
      commitMovement(
        {
          objectId: actor.id,
          pathId: skate.id,
          puckId: puck.id,
          durationSeconds,
          passRelease: { pathId: path.id, fraction: release.fraction },
        },
        [skate, path],
        newPuck,
      );
      setPassDraft(undefined);
      return;
    }

    if (tool === "passWhileSkating" && active.puck) {
      setActorId(active.actor.id);
      setPassDraft({
        diagram,
        actor: active.actor,
        puck: active.puck,
        newPuck: active.newPuck,
        skate: path,
      });
      return;
    }

    commitMovement(
      {
        objectId: active.actor.id,
        pathId: path.id,
        puckId: active.puck?.id ?? null,
        durationSeconds: Math.min(defaultActionSeconds(path), remaining),
      },
      [path],
      active.newPuck,
    );
  }

  function commitMovement(
    movement: Omit<AnimationAction, "id">,
    paths: RinkPath[],
    newPuck?: RinkObject,
  ) {
    setActorId(movement.objectId);
    onChange({
      ...diagram,
      objects: newPuck ? [...diagram.objects, newPuck] : diagram.objects,
      paths: [...diagram.paths, ...paths],
      animation: {
        version: 1,
        actions: [...actions, { ...movement, id: crypto.randomUUID() }],
      },
    });
  }

  let instruction = "Select a player, coach or puck on the rink.";
  if (actor) instruction = "Drag across the ice to draw the next movement.";
  if (tool === "passWhileSkating")
    instruction = "Draw the skating route first.";
  if (pendingPass)
    instruction = pendingPass.release
      ? "Drag toward the pass destination."
      : "Click along the skating route to set where the player releases the puck.";
  if (tool === "passWhileSkating" && passLimit)
    instruction = "A skating pass needs room for two routes and one second.";
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
          disabled={!canUndo || !!stroke || !!pendingPass}
          onClick={onUndo}
        >
          <Undo2 size={16} /> Undo
        </button>
        <button
          type="button"
          className="button secondary"
          aria-label="Redo animation drawing change"
          disabled={!canRedo || !!stroke || !!pendingPass}
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
              disabled={
                !!stroke ||
                !!pendingPass ||
                limit ||
                (value === "passWhileSkating" && passLimit)
              }
              onClick={() => {
                setKind(value);
                setObjectLimitReached(false);
              }}
            >
              {value === "passWhileSkating"
                ? "Pass while skating"
                : routeNames[value]}
            </button>
          ))}
        {pendingPass && (
          <button
            type="button"
            className="button secondary"
            disabled={!!stroke}
            onClick={() => setPassDraft(undefined)}
          >
            Cancel skating pass
          </button>
        )}
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
          onLostPointerCapture={finishLostCapture}
          onDragStart={(event) => event.preventDefault()}
        >
          <RinkMarkings />
          <RinkDrawingLayer>
            <g pointerEvents="none">
              {scene.paths.map((path) => (
                <PathShape key={path.id} path={{ ...path, color: "#b9c6ca" }} />
              ))}
              {pendingPass && (
                <PathShape path={{ ...pendingPass.skate, color: "#167e83" }} />
              )}
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
                    if (!gesture.current && !pendingPass) select(item);
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
          {pendingPass?.release && (
            <circle
              cx={pendingPass.release.point.x}
              cy={pendingPass.release.point.y}
              r="7"
              fill="#167e83"
              stroke="white"
              strokeWidth="2"
              pointerEvents="none"
            />
          )}
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

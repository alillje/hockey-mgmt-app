import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import {
  ObjectShape,
  PathShape,
  RinkDrawingLayer,
  RinkMarkings,
  RinkOrientation,
} from "../../components/Rink";
import {
  constrainToRink,
  extendRoute,
  limitPoints,
  rinkViewBox,
  rinkToView,
  viewToRink,
  rinkWidth,
} from "../../lib/geometry";
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
  animationErrors,
  animationGroups,
  animationLimits,
  animationSchedule,
  canSkateAndPass,
  defaultActionSeconds,
  isPuckDelivery,
  needsSelectedPuck,
  routeNames,
} from "./animationRules";
import { animationScene, nearestRoutePoint } from "./animationTimeline";
import { puckPickupDistance } from "./puckPossession";
import { Redo2, Undo2 } from "lucide-react";

const skaterTools: PathKind[] = [
  "skating",
  "skatingBackward",
  "puckHandling",
  "passing",
  "shooting",
];
const puckTools: PathKind[] = ["passing", "shooting"];

function rinkPoint(
  event: PointerEvent<SVGSVGElement>,
  size: Diagram["rinkSize"],
): Point {
  const matrix = event.currentTarget.getScreenCTM();
  const point = new DOMPoint(event.clientX, event.clientY);
  return constrainToRink(
    viewToRink(matrix ? point.matrixTransform(matrix.inverse()) : point, size),
    size,
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
  snapDistance: number;
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
  onOpenPasses,
}: {
  diagram: Diagram;
  onChange: (diagram: Diagram) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenPasses?: () => void;
}) {
  const [alongside, setAlongside] = useState(false);
  const [drawError, setDrawError] = useState("");
  const [actorId, setActorId] = useState<string>();
  const [kind, setKind] = useState<PathKind>("skating");
  const [objectLimitReached, setObjectLimitReached] = useState(false);
  const [stroke, setStroke] = useState<RinkPath>();
  const [catchPoint, setCatchPoint] = useState<Point>();
  const gesture = useRef<DrawingGesture | null>(null);
  const actions = diagram.animation?.actions ?? [];
  const lastGroup = animationSchedule(diagram).at(-1);
  const currentStep = Math.max(1, animationGroups(actions).length);
  const startTogether = alongside && !!lastGroup;
  const nextRouteStep =
    lastGroup && !startTogether ? currentStep + 1 : currentStep;
  const drawTime = lastGroup
    ? startTogether
      ? lastGroup.start
      : lastGroup.end
    : 0;
  const { frame: scene, possession } = animationScene(
    diagram,
    drawTime,
    "drawing",
    !startTogether,
  );
  const names = animationMarkerNames(diagram);
  const actor = scene.objects.find(
    (item) => item.id === actorId && names.has(item.id),
  );
  const tool =
    actor?.type === "puck" && kind !== "passing" && kind !== "shooting"
      ? "passing"
      : kind;
  const limit =
    actions.length >= animationLimits.actions ||
    drawTime > animationLimits.seconds - animationLimits.minimumAction ||
    diagram.paths.length >= 100;
  const remaining = animationLimits.seconds - drawTime;

  function select(item: RinkObject) {
    setActorId(item.id);
    setObjectLimitReached(false);
  }

  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || !event.isPrimary || gesture.current) return;
    const start = rinkPoint(event, diagram.rinkSize);
    const marker = (event.target as Element).closest("[data-animation-object]");
    const target = scene.objects.find(
      (item) => item.id === marker?.getAttribute("data-animation-object"),
    );
    // A puck can cover a player's hit target. Dragging from their feet still
    // starts with that player, while clicking can select the puck itself.
    const playerAtPuck =
      target?.type === "puck" && target.id !== actor?.id
        ? (scene.objects.find(
            (item) => possession.get(item.id)?.puckId === target.id,
          ) ??
          scene.objects.find(
            (item) => item.type === "player" && distance(item, target) <= 14,
          ))
        : undefined;
    const skatingTool = !puckTools.includes(tool);
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
      snapDistance:
        (rinkWidth(diagram.rinkSize) *
          (event.pointerType === "touch" ? 14 : 9)) /
        event.currentTarget.getBoundingClientRect().width,
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
        const held = possession.get(source.id);
        active.puck =
          scene.objects.find((item) => item.id === held?.puckId) ??
          scene.objects
            .filter(
              (item) =>
                item.type === "puck" &&
                !possession.isHeld(item.id) &&
                distance(item, source) <= puckPickupDistance,
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
        active.path = {
          ...path,
          points: [constrainToRink(origin, diagram.rinkSize)],
        };
      } else {
        setObjectLimitReached(true);
      }
    }
    if (!active.path && !target) return;
    if (active.path) event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = active;
  }

  function catchOnRoute(active: DrawingGesture, point: Point) {
    if (
      !startTogether ||
      active.path?.kind !== "passing" ||
      active.actor?.type !== "player" ||
      !active.puck
    )
      return;
    const matches = (lastGroup?.timings ?? [])
      .flatMap(({ action }) => {
        if (
          action.objectId === active.actor?.id ||
          action.puckId ||
          lastGroup?.exchanges.some(({ plan }) =>
            plan.trajectories.has(action.id),
          ) ||
          possession.get(action.objectId) ||
          !canSkateAndPass(diagram, action)
        )
          return [];
        const path = diagram.paths.find((item) => item.id === action.pathId);
        const hit =
          path && nearestRoutePoint(path.points, point, active.snapDistance);
        return hit ? [{ action, hit }] : [];
      })
      .sort((a, b) => a.hit.gap - b.hit.gap);
    const [closest, other] = matches;
    if (closest && (!other || other.hit.gap - closest.hit.gap >= 0.5))
      return closest;
  }

  function move(event: PointerEvent<SVGSVGElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const point = rinkPoint(event, diagram.rinkSize);
    active.moved ||= distance(point, active.start) >= 2;
    if (!active.moved || !active.path) return;
    const target = catchOnRoute(active, point);
    setCatchPoint(target?.hit.point);
    active.path = {
      ...active.path,
      points: extendRoute(
        active.path.kind,
        active.path.points,
        target?.hit.point ?? point,
      ),
    };
    setStroke(active.path);
  }

  function cancel(event: PointerEvent<SVGSVGElement>) {
    if (gesture.current?.pointerId !== event.pointerId) return;
    gesture.current = null;
    setStroke(undefined);
    setCatchPoint(undefined);
  }

  function finish(event: PointerEvent<SVGSVGElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    cancel(event);
    completeGesture(active, rinkPoint(event, diagram.rinkSize));
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
    const target = catchOnRoute(active, end);
    const points = limitPoints(
      extendRoute(
        active.path.kind,
        active.path.points,
        target?.hit.point ?? end,
      ),
    );
    const [origin] = points;
    if (
      !points.some(
        (point) => Math.hypot(point.x - origin.x, point.y - origin.y) >= 2,
      )
    )
      return;
    const path = { ...active.path, color: "#000000", points };
    commitMovement(
      {
        objectId: active.actor.id,
        pathId: path.id,
        puckId: active.puck?.id ?? null,
        durationSeconds: Math.min(defaultActionSeconds(path), remaining),
        skatingPassChain:
          target && active.puck
            ? {
                puckId: active.puck.id,
                passes: [
                  {
                    receiverActionId: target.action.id,
                    releaseFraction: 0,
                    receiveFraction: target.hit.fraction,
                    flightSeconds: defaultActionSeconds(path),
                  },
                ],
              }
            : undefined,
      },
      path,
      active.newPuck,
    );
  }

  function commitMovement(
    movement: Omit<AnimationAction, "id">,
    path: RinkPath,
    newPuck?: RinkObject,
  ) {
    const updated: Diagram = {
      ...diagram,
      objects: newPuck ? [...diagram.objects, newPuck] : diagram.objects,
      paths: [...diagram.paths, path],
      animation: {
        version: 1,
        actions: [
          ...actions,
          {
            ...movement,
            id: crypto.randomUUID(),
            startWithPrevious: startTogether || undefined,
          },
        ],
      },
    };
    const error = animationErrors(updated)[0];
    if (error) {
      setDrawError(error);
      return;
    }
    setDrawError("");
    setActorId(movement.objectId);
    onChange(updated);
  }

  let instruction = "Select a player, coach or puck on the rink.";
  if (actor)
    instruction = onOpenPasses
      ? "Drag to draw a route. Use Pass between players to time an exchange."
      : "Drag to draw a route. Add a second player to use Pass between players.";
  if (actor && tool === "passing")
    instruction = startTogether
      ? "End near a skating route to time the catch, or drag into open ice."
      : "Drag into open ice, or choose Draw in this step to aim at a skating route.";
  if (objectLimitReached)
    instruction = "Remove an object to make room for a puck at this player.";
  if (limit)
    instruction = "This drawing has reached the animation or route limit.";

  return (
    <section aria-label="Draw animation">
      <div className="animation-draw-tools">
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
      <div className="animation-draw-tools animation-history-controls">
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
        <button
          type="button"
          className="button secondary"
          disabled={!onOpenPasses || !!stroke}
          title={
            onOpenPasses
              ? undefined
              : "Draw a skating route and add a second player first"
          }
          onClick={onOpenPasses}
        >
          Pass between players
        </button>
        <div
          className="animation-step-controls"
          role="group"
          aria-label="Animation step"
        >
          <strong>Step {currentStep}</strong>
          {actions.length > 0 && (
            <>
              <button
                type="button"
                className="button secondary"
                aria-pressed={startTogether}
                disabled={!!stroke}
                onClick={() => {
                  setAlongside(true);
                  setDrawError("");
                }}
              >
                Draw in this step
              </button>
              <button
                type="button"
                className="button secondary"
                aria-pressed={!startTogether}
                disabled={!!stroke}
                onClick={() => {
                  setAlongside(false);
                  setDrawError("");
                }}
              >
                Start next step
              </button>
            </>
          )}
        </div>
      </div>
      <p className="small muted animation-step-hint">
        The next route you draw starts in Step {nextRouteStep}.
      </p>
      <p className="muted animation-draw-instruction" role="status">
        {instruction}
      </p>
      {drawError && (
        <p className="alert error" role="alert">
          {drawError}
        </p>
      )}
      <div className="animation-rink animation-draw-rink">
        <svg
          viewBox={rinkViewBox(diagram.rinkSize)}
          className={diagram.rinkSize === "half" ? "half-rink" : undefined}
          aria-label="Animation drawing rink"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={cancel}
          onLostPointerCapture={finishLostCapture}
          onDragStart={(event) => event.preventDefault()}
        >
          <RinkOrientation size={diagram.rinkSize}>
            <RinkMarkings size={diagram.rinkSize} />
            <RinkDrawingLayer size={diagram.rinkSize}>
              <g pointerEvents="none">
                {scene.paths.map((path) => (
                  <PathShape
                    key={path.id}
                    path={{ ...path, color: "#b9c6ca" }}
                  />
                ))}
                {stroke && <PathShape path={stroke} />}
                {catchPoint && (
                  <circle
                    cx={catchPoint.x}
                    cy={catchPoint.y}
                    r="6"
                    fill="#167e83"
                    stroke="white"
                    strokeWidth="2"
                  />
                )}
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
                  <ObjectShape object={item} rinkSize={diagram.rinkSize} />
                </g>
              ) : (
                <ObjectShape
                  key={item.id}
                  object={item}
                  rinkSize={diagram.rinkSize}
                />
              );
            })}
          </RinkOrientation>
          <g className="animation-marker-labels" aria-hidden="true">
            {scene.objects.map(({ id, type, x, y }) => {
              const name = names.get(id);
              if (!name) return null;
              const position = rinkToView({ x, y }, diagram.rinkSize);
              const nearRightEdge =
                position.x > rinkWidth(diagram.rinkSize) - 130;
              return (
                <text
                  key={id}
                  x={position.x + (nearRightEdge ? -12 : 12)}
                  y={Math.max(
                    16,
                    Math.min(487, position.y + (type === "puck" ? 19 : -21)),
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

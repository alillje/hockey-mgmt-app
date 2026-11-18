import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import {
  ObjectShape,
  PathShape,
  RinkDrawingLayer,
  RinkMarkings,
} from "../../components/Rink";
import type {
  AnimationAction,
  Diagram,
  Point,
  RinkObject,
} from "../../lib/types";
import { animationMarkerNames } from "./animationMarkers";
import {
  canSkateAndPass,
  animationLimits,
  animationSeconds,
  skatingPassError,
} from "./animationRules";
import { nearestRoutePoint, skatingPassLegs } from "./animationTimeline";

type PassDrag = {
  pointerId: number;
  diagram: Diagram;
  sender: AnimationAction;
  release: { point: Point; fraction: number };
};

function pointerPosition(event: PointerEvent<SVGSVGElement>, starting = false) {
  const matrix = event.currentTarget.getScreenCTM();
  if (!matrix) return;
  const scale = Math.hypot(matrix.a, matrix.b);
  if (!scale) return;

  const tolerancePixels = starting
    ? event.pointerType === "touch"
      ? 18
      : 14
    : event.pointerType === "touch"
      ? 10
      : 7;
  return {
    point: new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    ),
    tolerance: tolerancePixels / scale,
  };
}

export default function SkatingPassEditor({
  diagram,
  group,
  number,
  onChange,
}: {
  diagram: Diagram;
  group: AnimationAction[];
  number: number;
  onChange: (diagram: Diagram) => void;
}) {
  const drag = useRef<PassDrag | null>(null);
  const [stroke, setStroke] = useState<{
    from: Point;
    to: Point;
    catchPoint?: Point;
  }>();
  const [error, setError] = useState<string>();
  const skaters = group.filter((action) => canSkateAndPass(diagram, action));
  const starter = group.find((action) => action.skatingPassChain);
  const chain = starter?.skatingPassChain;
  const legs = starter ? skatingPassLegs(diagram, group, starter) : [];
  const sender = legs.at(-1)?.receiver;
  const names = animationMarkerNames(diagram);

  function routeAt(point: Point, tolerance: number) {
    const routes = skaters.flatMap((action) => {
      const route = diagram.paths.find((path) => path.id === action.pathId);
      const hit = route && nearestRoutePoint(route.points, point, tolerance);
      return hit ? [{ action, hit }] : [];
    });
    const [match, next] = routes.sort((a, b) => a.hit.gap - b.hit.gap);
    if (match && (!next || Math.abs(next.hit.gap - match.hit.gap) >= 0.5))
      return match;
  }

  function receiverAt(
    point: Point,
    tolerance: number,
    passer: AnimationAction,
  ) {
    const match = routeAt(point, tolerance);
    if (
      match &&
      match.action !== passer &&
      (match.action === starter || !match.action.puckId)
    ) {
      return match;
    }
  }

  function startPass(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || !event.isPrimary || drag.current) return;
    const position = pointerPosition(event, true);
    const match = position && routeAt(position.point, position.tolerance);
    if (!match || (sender && match.action !== sender)) {
      setError(
        sender
          ? "Start the pass on the puck carrier’s highlighted route."
          : "Start the pass near the route of the player with the puck.",
      );
      return;
    }
    const release = match.hit;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      diagram,
      sender: match.action,
      release,
    };
    setStroke({ from: release.point, to: release.point });
  }

  function movePass(event: PointerEvent<SVGSVGElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const position = pointerPosition(event);
    if (!position) return;
    const target = receiverAt(
      position.point,
      position.tolerance,
      active.sender,
    );
    setStroke({
      from: active.release.point,
      to: position.point,
      catchPoint: target?.hit.point,
    });
  }

  function cancelPass(event: PointerEvent<SVGSVGElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setStroke(undefined);
  }

  function finishPass(event: PointerEvent<SVGSVGElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    cancelPass(event);
    if (active.diagram !== diagram) return;
    const position = pointerPosition(event);
    const { release } = active;
    const target =
      position && receiverAt(position.point, position.tolerance, active.sender);
    if (
      !position ||
      !target ||
      Math.hypot(
        position.point.x - release.point.x,
        position.point.y - release.point.y,
      ) < 2
    ) {
      setError("End the pass on another player's skating route.");
      return;
    }

    const first = starter ?? active.sender;
    let puckId = chain?.puckId ?? first.puckId;
    let objects = diagram.objects;
    if (!puckId) {
      if (objects.length >= 200) {
        setError("Remove a rink object to make room for the puck.");
        return;
      }
      const start = diagram.paths.find((path) => path.id === first.pathId)!
        .points[0];
      const puck: RinkObject = {
        id: crypto.randomUUID(),
        type: "puck",
        ...start,
        rotation: 0,
        color: "#233b45",
        label: "",
      };
      puckId = puck.id;
      objects = [...objects, puck];
    }
    const next = updateChain(
      first,
      {
        puckId,
        passes: [
          ...(chain?.passes ?? []),
          {
            receiverActionId: target.action.id,
            releaseFraction: release.fraction,
            receiveFraction: target.hit.fraction,
          },
        ],
      },
      objects,
    );
    const conflict =
      skatingPassError(next) ??
      (animationSeconds(next) > animationLimits.seconds
        ? `Keep the animation within ${animationLimits.seconds} seconds.`
        : undefined);
    if (conflict) {
      setError(conflict);
      return;
    }
    setError(undefined);
    onChange(next);
  }

  function updateChain(
    first: AnimationAction,
    value: AnimationAction["skatingPassChain"],
    objects = diagram.objects,
  ): Diagram {
    const animation = diagram.animation!;
    return {
      ...diagram,
      objects,
      animation: {
        ...animation,
        actions: animation.actions.map((action) =>
          action.id === first.id
            ? { ...action, skatingPassChain: value }
            : action,
        ),
      },
    };
  }

  function removeLast() {
    if (!starter || !chain) return;
    const passes = chain.passes.slice(0, -1);
    onChange(updateChain(starter, passes.length ? { ...chain, passes } : null));
    setError(undefined);
  }

  return (
    <details className="animation-pass-editor">
      <summary>Passes between skaters · Group {number}</summary>
      <p className="small muted">
        {sender
          ? `Drag from ${names.get(sender.objectId)}’s highlighted route to the catch point on another player’s route.`
          : "Drag from the first passer’s route to the catch point on another player’s route."}
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <div className="animation-rink animation-pass-rink">
        <svg
          viewBox="0 0 1000 500"
          aria-label="Draw a pass between skating routes"
          onPointerDown={startPass}
          onPointerMove={movePass}
          onPointerUp={finishPass}
          onPointerCancel={cancelPass}
          onLostPointerCapture={cancelPass}
          onDragStart={(event) => event.preventDefault()}
        >
          <RinkMarkings />
          <RinkDrawingLayer>
            {skaters.map((action) => {
              const path = diagram.paths.find(
                (item) => item.id === action.pathId,
              );
              if (!path) return null;
              return (
                <PathShape
                  key={action.id}
                  path={{
                    ...path,
                    color: !sender || action === sender ? "#167e83" : "#a6b6bc",
                  }}
                />
              );
            })}
            {stroke && (
              <PathShape
                path={{
                  id: "pass-draft",
                  kind: "passing",
                  points: [stroke.from, stroke.to],
                  color: "#167e83",
                }}
              />
            )}
            {stroke?.catchPoint && (
              <circle
                cx={stroke.catchPoint.x}
                cy={stroke.catchPoint.y}
                r="5"
                fill="#167e83"
                stroke="white"
                strokeWidth="1.5"
                pointerEvents="none"
              />
            )}
            {legs.map(({ route }) => (
              <PathShape key={route.id} path={{ ...route, color: "#23619d" }} />
            ))}
          </RinkDrawingLayer>
          {skaters.map((action) => {
            const start = diagram.paths.find(
              (path) => path.id === action.pathId,
            )?.points[0];
            const object = diagram.objects.find(
              (item) => item.id === action.objectId,
            );
            return object && start ? (
              <ObjectShape key={action.id} object={{ ...object, ...start }} />
            ) : null;
          })}
        </svg>
      </div>
      {legs.length > 0 && (
        <>
          <ol className="animation-pass-list">
            {legs.map(({ route, release, receiver }, index) => {
              const from = index ? legs[index - 1].receiver : starter;
              return (
                <li key={route.id}>
                  {names.get(from!.objectId)} to {names.get(receiver.objectId)}{" "}
                  at {release.toFixed(1)} s
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="button secondary"
            onClick={removeLast}
          >
            Remove last pass
          </button>
        </>
      )}
    </details>
  );
}

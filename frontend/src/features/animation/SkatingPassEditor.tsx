import { rinkViewBox, viewToRink } from "../../lib/geometry";
import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import {
  ObjectShape,
  PathShape,
  RinkDrawingLayer,
  RinkMarkings,
  RinkOrientation,
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
  animationSchedule,
  animationSeconds,
  skatingPassError,
} from "./animationRules";
import {
  animationScene,
  nearestRoutePoint,
  skatingPassLegs,
} from "./animationTimeline";

import { defaultPassFlightSeconds } from "./skatingPassTiming";

const passSpeeds = [
  { label: "Quick", seconds: 0.35 },
  { label: "Normal", seconds: defaultPassFlightSeconds },
  { label: "Slow", seconds: 1.15 },
];

type PassDrag = {
  pointerId: number;
  diagram: Diagram;
  sender: AnimationAction;
  release: { point: Point; fraction: number };
};

function pointerPosition(
  event: PointerEvent<SVGSVGElement>,
  size: Diagram["rinkSize"],
  starting = false,
) {
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
    point: viewToRink(
      new DOMPoint(event.clientX, event.clientY).matrixTransform(
        matrix.inverse(),
      ),
      size,
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
  const [pendingRelease, setPendingRelease] = useState<PassDrag>();
  const retry =
    pendingRelease?.diagram === diagram ? pendingRelease : undefined;
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
    const position = pointerPosition(event, diagram.rinkSize, true);
    const match = position && routeAt(position.point, position.tolerance);
    const reusingRelease = retry && match?.action !== retry.sender;
    if (!reusingRelease && (!match || (sender && match.action !== sender))) {
      setError(
        sender
          ? "Start the pass on the puck carrier’s highlighted route."
          : "Start the pass near the route of the player with the puck.",
      );
      return;
    }
    const release = reusingRelease ? retry.release : match!.hit;
    const passer = reusingRelease ? retry.sender : match!.action;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      diagram,
      sender: passer,
      release,
    };
    setStroke({
      from: release.point,
      to: reusingRelease ? (position?.point ?? release.point) : release.point,
    });
  }

  function movePass(event: PointerEvent<SVGSVGElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const position = pointerPosition(event, diagram.rinkSize);
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
    const position = pointerPosition(event, diagram.rinkSize);
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
      setPendingRelease(active);
      setError(
        "End the pass on another player’s skating route. Your release point is still marked.",
      );
      event.currentTarget.focus({ preventScroll: true });
      return;
    }

    const first = starter ?? active.sender;
    let puckId = chain?.puckId ?? first.puckId;
    let objects = diagram.objects;
    if (!puckId) {
      const step = animationSchedule(diagram).find(({ timings }) =>
        timings.some(({ action }) => action.id === first.id),
      );
      if (step) {
        const { possession } = animationScene(
          diagram,
          step.start,
          "drawing",
          false,
        );
        puckId = possession.get(first.objectId)?.puckId;
      }
    }
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
            flightSeconds: defaultPassFlightSeconds,
          },
        ],
      },
      objects,
    );
    commit(next);
  }

  function commit(next: Diagram) {
    const conflict =
      skatingPassError(next) ??
      (animationSeconds(next) > animationLimits.seconds
        ? `Keep the animation within ${animationLimits.seconds} seconds.`
        : undefined);
    if (conflict) {
      setError(conflict);
      return;
    }
    setPendingRelease(undefined);
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

  function changePassSpeed(index: number, flightSeconds: number) {
    if (!starter || !chain) return;
    const passes = chain.passes.map((pass, position) =>
      position === index ? { ...pass, flightSeconds } : pass,
    );
    commit(updateChain(starter, { ...chain, passes }));
  }

  function clearRetry() {
    drag.current = null;
    setStroke(undefined);
    setPendingRelease(undefined);
    setError(undefined);
  }

  function removeLast() {
    if (!starter || !chain) return;
    const passes = chain.passes.slice(0, -1);
    onChange(updateChain(starter, passes.length ? { ...chain, passes } : null));
    setError(undefined);
  }

  return (
    <section
      className="animation-pass-editor"
      aria-label={`Pass between skaters · Step ${number}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && retry) {
          event.preventDefault();
          clearRetry();
        }
      }}
    >
      <p className="small muted">
        {retry
          ? "Click the receiver’s route to finish this pass."
          : sender
            ? `Drag from ${names.get(sender.objectId)}’s highlighted route to the catch point on another player’s route.`
            : "Drag from the first passer’s route to the catch point on another player’s route."}
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {retry && (
        <button type="button" className="button secondary" onClick={clearRetry}>
          Cancel pass
        </button>
      )}
      <div className="animation-rink animation-pass-rink">
        <svg
          viewBox={rinkViewBox(diagram.rinkSize)}
          className={diagram.rinkSize === "half" ? "half-rink" : undefined}
          aria-label="Draw a pass between skating routes"
          tabIndex={0}
          onPointerDown={startPass}
          onPointerMove={movePass}
          onPointerUp={finishPass}
          onPointerCancel={cancelPass}
          onLostPointerCapture={cancelPass}
          onDragStart={(event) => event.preventDefault()}
        >
          <RinkOrientation size={diagram.rinkSize}>
            <RinkMarkings size={diagram.rinkSize} />
            <RinkDrawingLayer size={diagram.rinkSize}>
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
                      color:
                        !sender || action === sender ? "#167e83" : "#a6b6bc",
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
              {retry && !stroke && (
                <circle
                  cx={retry.release.point.x}
                  cy={retry.release.point.y}
                  r="7"
                  fill="#167e83"
                  stroke="white"
                  strokeWidth="2"
                  pointerEvents="none"
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
                <PathShape
                  key={route.id}
                  path={{ ...route, color: "#23619d" }}
                />
              ))}
            </RinkDrawingLayer>
            {diagram.objects
              .filter((item) => item.type !== "player" && item.type !== "puck")
              .map((item) => (
                <g key={item.id} data-animation-equipment={item.type}>
                  <ObjectShape object={item} rinkSize={diagram.rinkSize} />
                </g>
              ))}
            {skaters.map((action) => {
              const start = diagram.paths.find(
                (path) => path.id === action.pathId,
              )?.points[0];
              const object = diagram.objects.find(
                (item) => item.id === action.objectId,
              );
              return object && start ? (
                <ObjectShape
                  key={action.id}
                  object={{ ...object, ...start }}
                  rinkSize={diagram.rinkSize}
                />
              ) : null;
            })}
          </RinkOrientation>
        </svg>
      </div>
      {legs.length > 0 && (
        <>
          <ol className="animation-pass-list">
            {legs.map(({ route, release, arrival, receiver }, index) => {
              const from = index ? legs[index - 1].receiver : starter;
              const flightSeconds = chain?.passes[index]?.flightSeconds;
              const listedSpeed = passSpeeds.some(
                ({ seconds }) => seconds === flightSeconds,
              );
              return (
                <li key={route.id}>
                  <span>
                    {names.get(from!.objectId)} to{" "}
                    {names.get(receiver.objectId)} at {release.toFixed(1)} s
                  </span>
                  <label>
                    Pass speed
                    <select
                      className="animation-picker"
                      aria-label={`Pass ${index + 1} speed`}
                      value={flightSeconds ?? ""}
                      onChange={(event) =>
                        changePassSpeed(
                          index,
                          Number(event.currentTarget.value),
                        )
                      }
                    >
                      {!listedSpeed && (
                        <option value={flightSeconds ?? ""}>
                          {flightSeconds == null
                            ? "Original"
                            : `${flightSeconds} s`}
                        </option>
                      )}
                      {passSpeeds.map(({ label, seconds }) => (
                        <option key={label} value={seconds}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="muted">
                    {(arrival - release).toFixed(2)} s in flight
                  </span>
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
    </section>
  );
}

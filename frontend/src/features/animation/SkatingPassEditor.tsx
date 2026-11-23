import { rinkViewBox, viewToRink } from "../../lib/geometry";
import { useMemo, useRef, useState } from "react";
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
  exchangeParticipants,
} from "./animationRules";
import {
  animationScene,
  nearestRoutePoint,
  skatingPassLegs,
} from "./animationTimeline";

import { defaultPassFlightSeconds } from "./skatingPassTiming";
import { puckPickupDistance } from "./puckPossession";

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
  const stepStart =
    animationSchedule(diagram).find(
      ({ timings }) => timings[0]?.action.id === group[0]?.id,
    )?.start ?? 0;
  const { frame: stepFrame, possession } = useMemo(
    () => animationScene(diagram, stepStart, "drawing", false),
    [diagram, stepStart],
  );
  const positions = useMemo(
    () => new Map(stepFrame.objects.map((object) => [object.id, object])),
    [stepFrame],
  );
  const stationers = useMemo(() => {
    const used = new Set(group.map(({ objectId }) => objectId));
    return [
      ...group.filter(({ pathId }) => pathId === null),
      ...stepFrame.objects
        .filter(({ type, id }) => type === "player" && !used.has(id))
        .map(({ id }) => ({
          id: crypto.randomUUID(),
          objectId: id,
          pathId: null,
          durationSeconds: animationLimits.minimumAction,
          startWithPrevious: true,
        })),
    ];
  }, [group, stepFrame]);
  const exchanges = group
    .filter((action) => action.skatingPassChain)
    .map((starter) => {
      const legs = skatingPassLegs(
        diagram,
        group,
        starter,
        undefined,
        positions,
      );
      return {
        starter,
        participants: exchangeParticipants(starter),
        legs,
        carrier: legs.at(-1)?.receiver,
      };
    });
  const passes = exchanges.flatMap(({ starter, legs }) =>
    legs.map((leg, index) => ({ ...leg, starter, index })),
  );
  const carriers = new Set(exchanges.map(({ carrier }) => carrier?.id));
  const loneCarrier = exchanges.length === 1 ? exchanges[0].carrier : undefined;
  const exchangeFor = (action: AnimationAction) =>
    exchanges.find(({ participants }) => participants.has(action.id));
  const names = animationMarkerNames(diagram);

  function routeAt(point: Point, tolerance: number) {
    const routes = skaters.flatMap((action) => {
      const route = diagram.paths.find((path) => path.id === action.pathId);
      const hit = route && nearestRoutePoint(route.points, point, tolerance);
      return hit ? [{ action, hit }] : [];
    });
    for (const action of stationers) {
      const marker = positions.get(action.objectId);
      if (!marker) continue;
      const gap = Math.hypot(marker.x - point.x, marker.y - point.y);
      if (gap <= Math.max(tolerance, 14))
        routes.push({ action, hit: { point: marker, fraction: 0, gap } });
    }
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
      (match.action === exchangeFor(match.action)?.starter ||
        !match.action.puckId)
    ) {
      return match;
    }
  }

  function startPass(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || !event.isPrimary || drag.current) return;
    const position = pointerPosition(event, diagram.rinkSize, true);
    const match = position && routeAt(position.point, position.tolerance);
    const reusingRelease = retry && match?.action !== retry.sender;
    if (!reusingRelease && !match) {
      setError("Start the pass on a player or their skating route.");
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
        "End the pass on another player or their skating route. Your release point is still marked.",
      );
      event.currentTarget.focus({ preventScroll: true });
      return;
    }

    const senderExchange = exchangeFor(active.sender);
    const receiverExchange = exchangeFor(target.action);
    if (
      senderExchange &&
      receiverExchange &&
      senderExchange !== receiverExchange
    ) {
      setError(
        "Choose players from the same exchange, or two players for a new exchange.",
      );
      return;
    }
    const exchange = senderExchange ?? receiverExchange;
    const first = exchange?.starter ?? active.sender;
    const chain = first.skatingPassChain;
    const newStation = !!exchange && active.sender !== exchange.carrier;
    if (
      newStation &&
      (active.sender.pathId !== null || exchange.carrier?.pathId !== null)
    ) {
      setError(
        "Start on the highlighted puck carrier. To start a separate exchange, use two players from outside this exchange.",
      );
      return;
    }
    const source = newStation ? active.sender : first;
    const lastByPuck = new Map(passes.map((leg) => [leg.puckId, leg]));
    let puckId = newStation
      ? [...lastByPuck.values()].find((leg) => leg.receiver.id === source.id)
          ?.puckId
      : (chain?.puckId ?? first.puckId);
    let objects = diagram.objects;
    const held = possession.get(source.objectId)?.puckId;
    if (!puckId && held && !lastByPuck.has(held)) puckId = held;
    const start =
      source.pathId === null
        ? positions.get(source.objectId)!
        : diagram.paths.find((path) => path.id === source.pathId)!.points[0];
    if (!puckId && source.pathId === null) {
      const reserved = new Set(
        group.flatMap(({ objectId, puckId }) => [objectId, puckId]),
      );
      puckId = stepFrame.objects
        .filter(
          (item) =>
            item.type === "puck" &&
            !reserved.has(item.id) &&
            !lastByPuck.has(item.id) &&
            !possession.isHeld(item.id),
        )
        .map((item) => ({
          item,
          distance: Math.hypot(item.x - start.x, item.y - start.y),
        }))
        .filter(({ distance }) => distance <= puckPickupDistance)
        .sort((a, b) => a.distance - b.distance)[0]?.item.id;
    }
    if (!puckId) {
      if (objects.length >= 200) {
        setError("Remove a rink object to make room for the puck.");
        return;
      }
      const puck: RinkObject = {
        id: crypto.randomUUID(),
        type: "puck",
        x: start.x,
        y: start.y,
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
        puckId: chain?.puckId ?? puckId,
        passes: [
          ...(chain?.passes ?? []),
          {
            receiverActionId: target.action.id,
            releaseFraction: release.fraction,
            receiveFraction: target.hit.fraction,
            flightSeconds: defaultPassFlightSeconds,
            fromStation: newStation
              ? { actionId: source.id, puckId }
              : undefined,
          },
        ],
      },
      objects,
      [active.sender, target.action].filter(
        (action) => !group.includes(action),
      ),
    );
    commit(next);
  }

  function commit(next: Diagram) {
    const conflict =
      ((next.animation?.actions.length ?? 0) > animationLimits.actions
        ? `Keep the animation within ${animationLimits.actions} actions.`
        : undefined) ??
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
    added: AnimationAction[] = [],
  ): Diagram {
    const animation = diagram.animation!;
    const groupIds = new Set(group.map(({ id }) => id));
    const updated = [...group, ...added].map((action) =>
      action.id === first.id ? { ...action, skatingPassChain: value } : action,
    );
    const used = new Set(
      updated
        .filter((action) => action.skatingPassChain)
        .flatMap((action) => [...exchangeParticipants(action)]),
    );
    const updatedGroup = updated.filter(
      (action) => action.pathId !== null || used.has(action.id),
    );
    return {
      ...diagram,
      objects,
      animation: {
        ...animation,
        actions: animation.actions.flatMap((action) =>
          action.id === group[0].id
            ? updatedGroup
            : groupIds.has(action.id)
              ? []
              : [action],
        ),
      },
    };
  }

  function changePassSpeed(
    starter: AnimationAction,
    index: number,
    flightSeconds: number,
  ) {
    const chain = starter.skatingPassChain!;
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

  function removeLast(starter: AnimationAction) {
    const chain = starter.skatingPassChain!;
    const passes = chain.passes.slice(0, -1);
    onChange(updateChain(starter, passes.length ? { ...chain, passes } : null));
    setError(undefined);
  }

  return (
    <section
      className="animation-pass-editor"
      aria-label={`Pass between players · Step ${number}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && retry) {
          event.preventDefault();
          clearRetry();
        }
      }}
    >
      <p className="small muted">
        {retry
          ? "Click the receiver or their route to finish this pass."
          : loneCarrier
            ? loneCarrier.pathId === null
              ? `Drag from ${names.get(loneCarrier.objectId)} to continue, or start another stationary pass. Use separate players for a parallel exchange.`
              : `Drag from ${names.get(loneCarrier.objectId)}’s highlighted route to continue. Use two other players for a parallel exchange.`
            : exchanges.length
              ? "Drag from a highlighted puck carrier to continue. Use two other players for a parallel exchange."
              : "Drag from the passer or their route to another player or their route."}
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
          aria-label="Draw a pass between players"
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
                        !exchanges.length || carriers.has(action.id)
                          ? "#167e83"
                          : "#a6b6bc",
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
              {passes.map(({ route }) => (
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
            {stationers.map((action) => {
              const marker = positions.get(action.objectId);
              if (!marker) return null;
              return (
                <g key={action.id} aria-label={names.get(action.objectId)}>
                  {carriers.has(action.id) && (
                    <circle
                      cx={marker.x}
                      cy={marker.y}
                      r="18"
                      fill="none"
                      stroke="#167e83"
                      strokeWidth="2"
                    />
                  )}
                  <ObjectShape object={marker} rinkSize={diagram.rinkSize} />
                </g>
              );
            })}
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
      {passes.length > 0 && (
        <>
          <ol className="animation-pass-list">
            {passes.map(
              (
                {
                  route,
                  release,
                  arrival,
                  sender: from,
                  receiver,
                  starter,
                  index,
                },
                displayIndex,
              ) => {
                const flightSeconds =
                  starter.skatingPassChain?.passes[index]?.flightSeconds;
                const listedSpeed = passSpeeds.some(
                  ({ seconds }) => seconds === flightSeconds,
                );
                return (
                  <li key={route.id}>
                    <span>
                      {names.get(from.objectId)} to{" "}
                      {names.get(receiver.objectId)} at {release.toFixed(1)} s
                    </span>
                    <label>
                      Pass speed
                      <select
                        className="animation-picker"
                        aria-label={`Pass ${displayIndex + 1} speed`}
                        value={flightSeconds ?? ""}
                        onChange={(event) =>
                          changePassSpeed(
                            starter,
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
              },
            )}
          </ol>
          {exchanges.map(({ starter }) => (
            <button
              key={starter.id}
              type="button"
              className="button secondary"
              onClick={() => removeLast(starter)}
            >
              {exchanges.length === 1
                ? "Remove last pass"
                : `Remove last pass from ${names.get(starter.objectId)}’s exchange`}
            </button>
          ))}
        </>
      )}
    </section>
  );
}

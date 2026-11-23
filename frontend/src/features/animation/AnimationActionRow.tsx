import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import type { AnimationAction, Diagram } from "../../lib/types";
import {
  compatibleRoutes,
  routeNames,
  needsSelectedPuck,
  defaultActionSeconds,
  isPuckDelivery,
} from "./animationRules";
import AnimationDurationField from "./AnimationDurationField";
import { animationMarkers, animationMarkerNames } from "./animationMarkers";

export default function AnimationActionRow({
  diagram,
  action,
  index,
  count,
  scalesGroup,
  onChange,
  onMove,
  onRemove,
}: {
  diagram: Diagram;
  action: AnimationAction;
  index: number;
  count: number;
  scalesGroup: boolean;
  onChange: (change: Partial<AnimationAction>) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const actors = animationMarkers(diagram);
  const markerNames = animationMarkerNames(diagram);
  const pucks = diagram.objects.filter((object) => object.type === "puck");
  const actor = actors.find((object) => object.id === action.objectId);
  const routes = compatibleRoutes(diagram, actor);
  const path = routes.find((route) => route.id === action.pathId);
  if (action.pathId === null) {
    return (
      <li className="animation-action animation-action-together">
        <strong>{markerNames.get(action.objectId)} · Stationary</strong>
      </li>
    );
  }
  return (
    <li
      className={
        action.startWithPrevious
          ? "animation-action animation-action-together"
          : "animation-action"
      }
    >
      <strong>Action {index + 1}</strong>
      {index > 0 && (
        <label className="animation-start-together">
          <input
            type="checkbox"
            aria-label="Keep this move in the same step"
            checked={!!action.startWithPrevious}
            onChange={(event) =>
              onChange({ startWithPrevious: event.currentTarget.checked })
            }
          />
          Same step as previous move
        </label>
      )}
      <div className="animation-action-fields">
        <label>
          Marker
          <select
            aria-label={`Action ${index + 1} marker`}
            value={action.objectId}
            onChange={(event) => {
              const nextActor = actors.find(
                (object) => object.id === event.target.value,
              );
              const nextPath = compatibleRoutes(diagram, nextActor)[0];
              onChange({
                objectId: event.target.value,
                pathId: nextPath?.id ?? "",
                puckId: needsSelectedPuck(nextActor, nextPath)
                  ? (action.puckId ?? pucks[0]?.id)
                  : null,
                durationSeconds:
                  nextPath?.id !== action.pathId &&
                  isPuckDelivery(nextPath?.kind)
                    ? defaultActionSeconds(nextPath)
                    : action.durationSeconds,
              });
            }}
          >
            {!actor && <option value={action.objectId}>Choose marker</option>}
            {actors.map((object) => (
              <option key={object.id} value={object.id}>
                {markerNames.get(object.id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Route
          <select
            aria-label={`Action ${index + 1} route`}
            value={action.pathId}
            onChange={(event) => {
              const nextPath = routes.find(
                (route) => route.id === event.target.value,
              );
              onChange({
                pathId: event.target.value,
                puckId: needsSelectedPuck(actor, nextPath)
                  ? (action.puckId ?? pucks[0]?.id)
                  : null,
                durationSeconds: isPuckDelivery(nextPath?.kind)
                  ? defaultActionSeconds(nextPath)
                  : action.durationSeconds,
              });
            }}
          >
            {!path && <option value={action.pathId}>Choose route</option>}
            {routes.map((route) => (
              <option key={route.id} value={route.id}>
                Route {diagram.paths.indexOf(route) + 1} ·{" "}
                {routeNames[route.kind]}
              </option>
            ))}
          </select>
        </label>
        {needsSelectedPuck(actor, path) && (
          <label>
            {path?.kind === "puckHandling" ? "Carry puck" : "Puck"}
            <select
              aria-label={`Action ${index + 1} puck`}
              value={action.puckId ?? ""}
              onChange={(event) =>
                onChange({ puckId: event.target.value || null })
              }
            >
              <option value="">Choose puck</option>
              {pucks.map((puck) => (
                <option key={puck.id} value={puck.id}>
                  {markerNames.get(puck.id)}
                </option>
              ))}
            </select>
          </label>
        )}
        <AnimationDurationField
          index={index}
          seconds={action.durationSeconds}
          scalesGroup={scalesGroup}
          onChange={(durationSeconds) => onChange({ durationSeconds })}
        />
      </div>
      <div className="inline">
        <button
          type="button"
          className="icon-button"
          aria-label={`Move action ${index + 1} up`}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUp size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Move action ${index + 1} down`}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Remove action ${index + 1}`}
          onClick={() => onRemove()}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </li>
  );
}

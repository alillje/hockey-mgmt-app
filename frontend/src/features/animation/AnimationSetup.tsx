import { Plus } from "lucide-react";
import type { AnimationAction, Diagram } from "../../lib/types";
import {
  animationErrors,
  animationLimits,
  animationSeconds,
  compatibleRoutes,
  defaultActionSeconds,
  needsSelectedPuck,
} from "./animationRules";
import { animationMarkers } from "./animationMarkers";
import AnimationDrawing from "./AnimationDrawing";
import AnimationPlayer from "./AnimationPlayer";
import AnimationActionRow from "./AnimationActionRow";

export default function AnimationSetup({
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
  const actions = diagram.animation?.actions ?? [];
  const actors = animationMarkers(diagram);
  const pucks = diagram.objects.filter((object) => object.type === "puck");
  const errors = animationErrors(diagram);
  const duration = animationSeconds(diagram);
  const remaining = animationLimits.seconds - duration;
  function save(next: AnimationAction[]) {
    onChange({
      ...diagram,
      animation: next.length ? { version: 1, actions: next } : null,
    });
  }
  function update(index: number, change: Partial<AnimationAction>) {
    save(
      actions.map((action, i) =>
        i === index ? { ...action, ...change } : action,
      ),
    );
  }
  function move(index: number, by: number) {
    const next = [...actions];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    save(next);
  }
  const availableActor = actors.find(
    (actor) => compatibleRoutes(diagram, actor).length > 0,
  );
  function add() {
    if (!availableActor) return;
    const path = compatibleRoutes(diagram, availableActor)[0];
    save([
      ...actions,
      {
        id: crypto.randomUUID(),
        objectId: availableActor.id,
        pathId: path.id,
        durationSeconds: Math.min(defaultActionSeconds(path), remaining),
        puckId: needsSelectedPuck(availableActor, path) ? pucks[0]?.id : null,
      },
    ]);
  }
  return (
    <div className="animation-setup">
      <AnimationDrawing
        diagram={diagram}
        onChange={onChange}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
      />
      {!!actions.length && !errors.length && (
        <details className="animation-adjustments" open>
          <summary>Preview animation</summary>
          <AnimationPlayer diagram={diagram} />
        </details>
      )}
      <details className="animation-adjustments">
        <summary>Adjust animation</summary>
        <ol className="animation-actions">
          {actions.map((action, index) => (
            <AnimationActionRow
              key={action.id}
              diagram={diagram}
              action={action}
              index={index}
              count={actions.length}
              onChange={(change) => update(index, change)}
              onMove={(by) => move(index, by)}
              onRemove={() => save(actions.filter((_, i) => i !== index))}
            />
          ))}
        </ol>
        <div className="inline">
          <button
            type="button"
            className="button secondary"
            disabled={
              !availableActor ||
              actions.length >= animationLimits.actions ||
              remaining < animationLimits.minimumAction
            }
            onClick={add}
          >
            <Plus size={16} />
            Use existing route
          </button>
          {!!actions.length && (
            <button
              type="button"
              className="button secondary"
              onClick={() => save([])}
            >
              Remove animation
            </button>
          )}
          <span className="muted">
            {duration.toFixed(1)} / {animationLimits.seconds} s
          </span>
        </div>
      </details>
      {!!errors.length && (
        <ul className="alert error" role="alert">
          {errors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

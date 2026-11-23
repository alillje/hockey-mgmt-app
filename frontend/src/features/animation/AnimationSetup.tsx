import { Plus, Redo2, Undo2 } from "lucide-react";
import { useState } from "react";
import type { AnimationAction, Diagram } from "../../lib/types";
import {
  animationErrors,
  animationGroups,
  canSkateAndPass,
  animationLimits,
  animationSeconds,
  compatibleRoutes,
  defaultActionSeconds,
  isStationaryPass,
  needsSelectedPuck,
  retimeSkatingPassGroup,
  scalesSkatingPassGroup,
  sharedMarkerConflict,
  skatingPassError,
} from "./animationRules";
import { animationMarkers } from "./animationMarkers";
import AnimationDrawing from "./AnimationDrawing";
import AnimationPlayer, { AnimationRouteToggle } from "./AnimationPlayer";
import AnimationActionRow from "./AnimationActionRow";
import SkatingPassEditor from "./SkatingPassEditor";

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
  const groups = animationGroups(actions);
  const actors = animationMarkers(diagram);
  const pucks = diagram.objects.filter((object) => object.type === "puck");
  const errors = animationErrors(diagram);
  const [editError, setEditError] = useState("");
  const [passesOpen, setPassesOpen] = useState(false);
  const [hidePreviewRoutes, setHidePreviewRoutes] = useState(false);
  const [passGroupId, setPassGroupId] = useState("");
  const passGroups = groups.flatMap((group, index) => {
    const moving = group.filter((action) =>
      canSkateAndPass(diagram, action),
    ).length;
    const hasStationary = actors.some(
      (actor) =>
        actor.type === "player" &&
        !group.some((action) => action.objectId === actor.id),
    );
    return group.some((action) => action.skatingPassChain) ||
      moving >= 2 ||
      (moving === 1 && hasStationary)
      ? [{ group, number: index + 1, id: group[0].id }]
      : [];
  });
  const selectedPassGroup = passesOpen
    ? (passGroups.find((item) => item.id === passGroupId) ?? passGroups.at(-1))
    : undefined;
  const duration = animationSeconds(diagram);
  const remaining = animationLimits.seconds - duration;
  function save(next: AnimationAction[]) {
    const updated: Diagram = {
      ...diagram,
      animation: next.length ? { version: 1, actions: next } : null,
    };
    const conflict = sharedMarkerConflict(next) ?? skatingPassError(updated);
    if (conflict) {
      setEditError(conflict);
      return;
    }
    setEditError("");
    onChange(updated);
  }
  function update(index: number, change: Partial<AnimationAction>) {
    const action = actions[index];
    const group = groups.find((members) => members.includes(action));
    if (
      group &&
      change.durationSeconds !== undefined &&
      scalesSkatingPassGroup(group, action)
    ) {
      const resized = retimeSkatingPassGroup(
        group,
        action,
        change.durationSeconds,
      );
      if (
        resized.some(
          (item) =>
            item.durationSeconds < animationLimits.minimumAction ||
            item.durationSeconds > animationLimits.maximumAction,
        )
      ) {
        setEditError(
          `Choose a group speed that keeps every action between ${animationLimits.minimumAction} and ${animationLimits.maximumAction} seconds.`,
        );
        return;
      }
      const next = actions.map(
        (item) => resized.find((member) => member.id === item.id) ?? item,
      );
      const updated = {
        ...diagram,
        animation: { version: 1 as const, actions: next },
      };
      if (animationSeconds(updated) > animationLimits.seconds) {
        setEditError(
          `Keep the animation within ${animationLimits.seconds} seconds.`,
        );
        return;
      }
      if (skatingPassError(updated)) {
        setEditError(
          "Give this exchange more time so the puck can complete each pass.",
        );
        return;
      }
      save(next);
      return;
    }
    save(
      actions.map((action, i) =>
        i === index ? { ...action, ...change } : action,
      ),
    );
  }
  function move(index: number, by: number) {
    const next = [...actions];
    const destination = index + by;
    next[index] = {
      ...actions[destination],
      startWithPrevious: actions[index].startWithPrevious,
    };
    next[destination] = {
      ...actions[index],
      startWithPrevious: actions[destination].startWithPrevious,
    };
    save(next);
  }
  function remove(index: number) {
    if (
      actions[index].skatingPassChain &&
      !isStationaryPass(diagram, actions[index])
    ) {
      setEditError("Remove the passes before removing their starting skater.");
      return;
    }
    const next = actions.filter((_, i) => i !== index);
    if (!actions[index].startWithPrevious && next[index]?.startWithPrevious) {
      next[index] = { ...next[index], startWithPrevious: false };
    }
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
      <details className="animation-drawing-help">
        <summary>How to draw passes</summary>
        <ol>
          <li>
            Draw the first skating route, then choose{" "}
            <strong>Draw in this step</strong> before drawing the other players.
          </li>
          <li>
            Choose <strong>Pass between players</strong>. Drag between players
            or their skating routes. Use <strong>Pass arrow</strong> on the main
            rink when you only want to draw an arrow.
          </li>
          <li>
            To add another pass, start on the new puck carrier’s highlighted
            route. Use <strong>Pass speed</strong> to slow down or speed up a
            pass.
          </li>
        </ol>
      </details>
      {selectedPassGroup && (
        <div className="animation-draw-tools animation-mode-controls">
          <button
            type="button"
            className="button secondary"
            onClick={() => setPassesOpen(false)}
          >
            Draw moves
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Undo animation drawing change"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Redo animation drawing change"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Redo2 size={16} />
          </button>
          {passGroups.length > 1 && (
            <select
              className="animation-picker"
              aria-label="Step for passes"
              value={selectedPassGroup.id}
              onChange={(event) => setPassGroupId(event.currentTarget.value)}
            >
              {passGroups.map(({ id, number }) => (
                <option key={id} value={id}>
                  Step {number}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      <div hidden={!!selectedPassGroup}>
        <AnimationDrawing
          diagram={diagram}
          onChange={onChange}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
          onOpenPasses={
            passGroups.length > 0 ? () => setPassesOpen(true) : undefined
          }
        />
      </div>
      {selectedPassGroup && (
        <SkatingPassEditor
          key={selectedPassGroup.id}
          diagram={diagram}
          group={selectedPassGroup.group}
          number={selectedPassGroup.number}
          onChange={(updated) => {
            setEditError("");
            onChange(updated);
          }}
        />
      )}
      {!!actions.length && !errors.length && (
        <details className="animation-adjustments" open>
          <summary>Preview animation</summary>
          <AnimationRouteToggle
            checked={hidePreviewRoutes}
            onChange={setHidePreviewRoutes}
          />
          <AnimationPlayer diagram={diagram} hideRoutes={hidePreviewRoutes} />
        </details>
      )}
      <details className="animation-adjustments">
        <summary>Adjust animation</summary>
        {actions.length > 1 && (
          <p className="muted small">
            Actions that start together keep their own durations. The next
            action waits for the group to finish.
          </p>
        )}
        {editError && (
          <p className="alert error" role="alert">
            {editError}
          </p>
        )}
        <ol className="animation-actions">
          {actions.map((action, index) => (
            <AnimationActionRow
              key={action.id}
              diagram={diagram}
              action={action}
              index={index}
              count={actions.length}
              scalesGroup={groups.some((group) =>
                scalesSkatingPassGroup(group, action),
              )}
              onChange={(change) => update(index, change)}
              onMove={(by) => move(index, by)}
              onRemove={() => remove(index)}
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
              Clear animation
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

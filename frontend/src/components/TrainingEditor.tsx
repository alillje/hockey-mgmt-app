import {
  ArrowDown,
  ArrowUp,
  Clock3,
  Plus,
  Trash2,
  PenLine,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import type { Drill, Training, TrainingItem } from "../lib/types";
import { DiagramSvg } from "./Rink";
export default function TrainingEditor({
  training,
  drills,
  onChange,
  onCreateDrill,
  readOnly = false,
  onCopyDrill,
  copyDrillBlocked,
}: {
  training: Training;
  drills: Drill[];
  onChange: (t: Training) => void;
  onCreateDrill: () => void;
  readOnly?: boolean;
  onCopyDrill?: (position: number) => void;
  copyDrillBlocked?: string;
}) {
  const [pick, setPick] = useState("");
  const full = training.items.length >= 100;
  const total = training.items.reduce((n, i) => n + i.durationMinutes, 0);
  function itemChange(index: number, change: Partial<TrainingItem>) {
    onChange({
      ...training,
      items: training.items.map((item, i) =>
        i === index ? { ...item, ...change } : item,
      ),
    });
  }
  function move(index: number, by: number) {
    const items = [...training.items];
    [items[index], items[index + by]] = [items[index + by], items[index]];
    onChange({ ...training, items });
  }
  return (
    <>
      <section className="practice-summary">
        <div className="practice-symbol">
          <Clock3 size={30} />
        </div>
        <div>
          <span className="eyebrow">YOUR TIME ON THE ICE</span>
          <h2>
            {total} <span>minutes planned</span>
          </h2>
        </div>
        <span className="count-pill">{training.items.length} drills</span>
      </section>
      <section className="panel">
        <div className="section-heading">
          <span className="eyebrow">RUN OF PRACTICE</span>
          <h2>Every minute has a purpose</h2>
          {!readOnly && (
            <div className="practice-drill-actions">
              <div className="draw-drill-action">
                <button
                  type="button"
                  className="button primary"
                  onClick={onCreateDrill}
                  disabled={full}
                >
                  <PenLine size={17} /> Draw a new drill
                </button>
                <p>
                  Draw a rink diagram, then save it into this practice. Your
                  practice draft is kept.
                </p>
              </div>
              <div className="saved-drill-action">
                <label htmlFor="saved-drill-pick">Add a saved drill</label>
                <div>
                  <select
                    id="saved-drill-pick"
                    value={pick}
                    onChange={(e) => setPick(e.target.value)}
                    disabled={full}
                  >
                    <option value="">Choose a saved drill…</option>
                    {drills.map((drill) => (
                      <option value={drill.id} key={drill.id}>
                        {drill.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={!pick || full}
                    onClick={() => {
                      onChange({
                        ...training,
                        items: [
                          ...training.items,
                          { drillId: pick, durationMinutes: 10, notes: "" },
                        ],
                      });
                      setPick("");
                    }}
                  >
                    <Plus size={16} /> Add selected drill
                  </button>
                </div>
              </div>
            </div>
          )}
          {full && !readOnly && (
            <p className="practice-limit" role="status">
              A practice can contain at most 100 drills. Remove one to add
              another.
            </p>
          )}
        </div>
        <div className="practice-items">
          {training.items.length === 0 && (
            <div className="empty-state">
              <Clock3 size={36} />
              <h3>Start with a drill</h3>
              <p>
                Draw a new drill or choose one from your saved library above.
              </p>
            </div>
          )}
          {training.items.map((item, index) => {
            const drill = drills.find(
              (candidate) => candidate.id === item.drillId,
            );
            return (
              <article
                className="practice-item"
                key={`${item.drillId}-${index}`}
              >
                <span className="sequence">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="practice-item-body">
                  <h3>{drill?.title || "Drill no longer available"}</h3>
                  {drill ? (
                    <div
                      className="practice-rink-preview"
                      role="img"
                      aria-label={`Rink preview: ${drill.title}`}
                    >
                      <DiagramSvg diagram={drill.diagram} />
                      {!drill.diagram.objects.length &&
                        !drill.diagram.paths.length && (
                          <span className="preview-empty">
                            No diagram drawn yet
                          </span>
                        )}
                    </div>
                  ) : (
                    <div className="practice-rink-missing">
                      Rink preview unavailable
                    </div>
                  )}
                  {drill && (
                    <p className="muted">
                      {drill.notes || "No reusable drill instructions yet."}
                    </p>
                  )}
                  {!readOnly && drill && (
                    <div className="inline">
                      {drill.ownership?.canEdit && (
                        <Link to={`/drills/${drill.id}`}>
                          Edit reusable drill
                        </Link>
                      )}
                      {(onCopyDrill || copyDrillBlocked) && (
                        <button
                          type="button"
                          className="button secondary"
                          disabled={!!copyDrillBlocked}
                          title={copyDrillBlocked}
                          onClick={() => onCopyDrill?.(index)}
                        >
                          Copy drill for this practice
                        </button>
                      )}
                    </div>
                  )}
                  {copyDrillBlocked && (
                    <p className="small muted">{copyDrillBlocked}</p>
                  )}
                  <p className="small muted">
                    Practice-specific notes below apply only to this entry.
                    Reusable drill instructions are edited separately.
                  </p>
                  {readOnly ? (
                    <p>
                      {item.durationMinutes} minutes ·{" "}
                      {item.notes || "No practice-specific notes"}
                    </p>
                  ) : (
                    <div className="practice-item-fields">
                      <label>
                        Duration{" "}
                        <span className="duration-input">
                          <input
                            type="number"
                            min="1"
                            max="240"
                            value={item.durationMinutes}
                            onChange={(e) =>
                              itemChange(index, {
                                durationMinutes: Math.max(
                                  1,
                                  Math.min(
                                    240,
                                    Math.trunc(Number(e.target.value)) || 1,
                                  ),
                                ),
                              })
                            }
                          />
                          <span>min</span>
                        </span>
                      </label>
                      <label className="item-notes">
                        Practice-specific notes
                        <input
                          maxLength={6000}
                          value={item.notes}
                          placeholder="Timing, groups, coaching cues…"
                          onChange={(e) =>
                            itemChange(index, { notes: e.target.value })
                          }
                        />
                      </label>
                    </div>
                  )}
                </div>
                {!readOnly && (
                  <div className="item-actions">
                    <button
                      className="icon-button"
                      aria-label={`Move ${drill?.title || "drill"} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp size={17} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Move ${drill?.title || "drill"} down`}
                      disabled={index === training.items.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown size={17} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${drill?.title || "drill"} from practice`}
                      onClick={() =>
                        onChange({
                          ...training,
                          items: training.items.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}

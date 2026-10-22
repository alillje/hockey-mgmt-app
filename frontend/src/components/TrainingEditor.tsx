import { ArrowDown, ArrowUp, Clock3, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Drill, Training, TrainingItem } from "../lib/types";
export default function TrainingEditor({
  training,
  drills,
  onChange,
}: {
  training: Training;
  drills: Drill[];
  onChange: (t: Training) => void;
}) {
  const [pick, setPick] = useState("");
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
          <div>
            <span className="eyebrow">RUN OF PRACTICE</span>
            <h2>Every minute has a purpose</h2>
          </div>
        </div>
        <div className="practice-items">
          {training.items.length === 0 && (
            <div className="empty-state">
              <Clock3 size={36} />
              <h3>Start with a drill</h3>
              <p>Add drills from your library, then arrange your practice.</p>
            </div>
          )}
          {training.items.map((item, index) => {
            const drill = drills.find((d) => d.id === item.drillId);
            return (
              <article className="practice-item" key={index}>
                <span className="sequence">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="practice-item-body">
                  <h3>{drill?.title || "Drill no longer available"}</h3>
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
                </div>
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
              </article>
            );
          })}
        </div>
        <div className="add-drill">
          <select
            aria-label="Drill to add to practice"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
          >
            <option value="">Choose a drill from your library…</option>
            {drills.map((d) => (
              <option value={d.id} key={d.id}>
                {d.title}
              </option>
            ))}
          </select>
          <button
            className="button primary"
            disabled={!pick || training.items.length >= 100}
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
            <Plus size={17} />
            Add drill
          </button>
        </div>
      </section>
    </>
  );
}

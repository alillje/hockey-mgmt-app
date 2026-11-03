import { ArrowDown, ArrowUp, Clock3, Trash2, PenLine } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import type { Drill, Training, TrainingItem } from "../lib/types";
import { DiagramSvg } from "./Rink";
import DurationInput from "./DurationInput";
import {
  practiceBlocks,
  plannedMinutes,
  joinPreviousBlock,
  removePracticeItem,
  movePracticeBlock,
} from "../lib/practiceBlocks";
export default function TrainingEditor({
  training,
  drills,
  onChange,
  onCreateDrill,
  drillPicker,
  readOnly = false,
  canCreateDrill = true,
}: {
  training: Training;
  drills: Drill[];
  onChange: (t: Training) => void;
  onCreateDrill: () => void;
  drillPicker?: ReactNode;
  readOnly?: boolean;
  canCreateDrill?: boolean;
}) {
  const full = training.items.length >= 100;
  const blocks = practiceBlocks(training.items);
  const total = plannedMinutes(training.items);
  function itemChange(index: number, change: Partial<TrainingItem>) {
    onChange({
      ...training,
      items: training.items.map((item, i) =>
        i === index ? { ...item, ...change } : item,
      ),
    });
  }
  function move(index: number, by: number) {
    const items = movePracticeBlock(training.items, index, by);
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
          {!readOnly && (
            <div className="practice-drill-actions">
              <div className="draw-drill-action">
                <button
                  type="button"
                  className="button primary"
                  onClick={onCreateDrill}
                  disabled={full || !canCreateDrill}
                >
                  <PenLine size={17} /> Draw a new drill
                </button>
                <p>
                  {canCreateDrill
                    ? "Draw a rink diagram, then save it into this practice. Your practice draft is kept."
                    : "Select this plan’s workspace before drawing a new drill."}
                </p>
              </div>
              {drillPicker}
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
              <h3>{readOnly ? "No drills added" : "Start with a drill"}</h3>
              <p>
                {readOnly
                  ? "This practice has no drills yet."
                  : "Draw a new drill or choose one from your saved library above."}
              </p>
            </div>
          )}
          {blocks.map((block, blockIndex) => (
            <section
              className="practice-block"
              key={block.startIndex}
              aria-label={`Block ${blockIndex + 1}`}
            >
              <div className="practice-block-heading">
                <div>
                  <h3>Block {blockIndex + 1}</h3>
                  <span className="muted">
                    {block.startMinute}–
                    {block.startMinute + block.durationMinutes} min ·{" "}
                    {block.items.length}{" "}
                    {block.items.length === 1 ? "drill" : "drills"}
                  </span>
                </div>
                {readOnly ? (
                  <strong>{block.durationMinutes} min</strong>
                ) : (
                  <label>
                    Block duration{" "}
                    <DurationInput
                      value={block.durationMinutes}
                      onChange={(durationMinutes) =>
                        onChange({
                          ...training,
                          items: training.items.map((item, index) =>
                            index >= block.startIndex &&
                            index < block.startIndex + block.items.length
                              ? { ...item, durationMinutes }
                              : item,
                          ),
                        })
                      }
                    />
                  </label>
                )}
              </div>
              {block.items.map((item, offset) => {
                const index = block.startIndex + offset;
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
                      <h3>
                        {readOnly && drill ? (
                          <Link to={`/drills/${drill.id}`}>{drill.title}</Link>
                        ) : (
                          drill?.title || "Drill no longer available"
                        )}
                      </h3>
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
                      {drill?.notes.trim() && (
                        <p className="muted">{drill.notes}</p>
                      )}
                      {!readOnly && drill && (
                        <div className="practice-drill-edit">
                          {drill.ownership?.canEdit && (
                            <Link
                              className="button secondary"
                              to={`/drills/${drill.id}/edit`}
                            >
                              <PenLine size={15} />
                              Edit reusable drill
                            </Link>
                          )}
                        </div>
                      )}
                      {readOnly ? (
                        <p>{item.notes}</p>
                      ) : (
                        <div className="practice-item-fields">
                          {index > 0 && (
                            <label
                              className={`parallel-drill-toggle${item.runInParallelWithPrevious ? " selected" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={!!item.runInParallelWithPrevious}
                                onChange={(event) =>
                                  onChange({
                                    ...training,
                                    items: joinPreviousBlock(
                                      training.items,
                                      index,
                                      event.target.checked,
                                    ),
                                  })
                                }
                              />
                              Add to previous block
                            </label>
                          )}
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
                        {offset === 0 && (
                          <>
                            <button
                              className="icon-button"
                              aria-label={`Move ${drill?.title || "drill"} up`}
                              title={`Move block ${blockIndex + 1} up`}
                              disabled={blockIndex === 0}
                              onClick={() => move(blockIndex, -1)}
                            >
                              <ArrowUp size={17} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Move ${drill?.title || "drill"} down`}
                              title={`Move block ${blockIndex + 1} down`}
                              disabled={blockIndex === blocks.length - 1}
                              onClick={() => move(blockIndex, 1)}
                            >
                              <ArrowDown size={17} />
                            </button>
                          </>
                        )}
                        <button
                          className="icon-button"
                          aria-label={`Remove ${drill?.title || "drill"} from practice`}
                          onClick={() =>
                            onChange({
                              ...training,
                              items: removePracticeItem(training.items, index),
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
            </section>
          ))}
        </div>
      </section>
    </>
  );
}

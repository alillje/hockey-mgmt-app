import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Drill, Training, SharingPreview } from "../../lib/types";

export default function SharingDialog({
  kind,
  item,
  onClose,
  onSaved,
}: {
  kind: "drills" | "practices";
  item: Drill | Training;
  onClose: () => void;
  onSaved: (item: Drill | Training) => void;
}) {
  const [preview, setPreview] = useState<SharingPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sharing = item.ownership?.visibility !== "organisation";
  const needsPreview = kind === "practices" && sharing;
  useEffect(() => {
    if (needsPreview)
      void api
        .sharingPreview(item.id)
        .then(setPreview)
        .catch((e) =>
          setError(e instanceof Error ? e.message : "Could not check drills."),
        );
  }, [item.id, needsPreview]);
  async function apply() {
    setBusy(true);
    setError("");
    try {
      const saved = await api.visibility(
        kind,
        item.id,
        sharing ? "organisation" : "team",
        preview?.updatedAt || item.updatedAt,
        preview?.drills.map((d) => ({ id: d.id, updatedAt: d.updatedAt })) ||
          [],
      );
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change visibility.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="sharing-title"
        className="sharing-dialog"
      >
        <h2 id="sharing-title">
          {sharing ? "Share with club" : "Make team-only"}
        </h2>
        <p>
          {sharing
            ? "Club members will be able to view and use this content. Its owner and editing permissions stay the same."
            : "This removes the content from the club library. Existing independent copies are kept. Dependencies may prevent this change."}
        </p>
        {needsPreview && !preview && !error && <p>Checking included drills…</p>}
        {preview && (
          <>
            {preview.drills.length ? (
              <>
                <p>
                  The following drills also need to be shared with the club:
                </p>
                <ul>
                  {preview.drills.map((d) => (
                    <li key={d.id}>
                      {d.title}
                      {!d.canShare &&
                        " — you do not have permission to share this drill"}
                    </li>
                  ))}
                </ul>
                {preview.canShare && (
                  <label className="confirmation">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    I confirm sharing these drills with the club.
                  </label>
                )}
              </>
            ) : (
              <p>All included drills are already available to the club.</p>
            )}
            {!preview.canShare && (
              <p className="alert error">
                This plan cannot be shared until the drill owners share the
                listed drills or give you permission.
              </p>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="alert error">
            {error}
          </p>
        )}
        <div className="inline">
          <button
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={
              busy ||
              (needsPreview &&
                (!preview ||
                  !preview.canShare ||
                  (preview.drills.length > 0 && !confirmed)))
            }
            onClick={() => void apply()}
          >
            {sharing
              ? preview?.drills.length
                ? "Share plan and listed drills"
                : "Share with club"
              : "Make team-only"}
          </button>
        </div>
      </section>
    </div>
  );
}

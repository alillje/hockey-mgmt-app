import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLibrary } from "../../App";
import { api } from "../../lib/api";
import type { Drill, Training } from "../../lib/types";
import { copyDestinations } from "./copyDestinations";

export default function CopyDialog({
  kind,
  item,
  onClose,
}: {
  kind: "drills" | "practices";
  item: Drill | Training;
  onClose: () => void;
}) {
  const library = useLibrary();
  const navigate = useNavigate();
  const destinations = copyDestinations(item.ownership, library.workspaces);
  const [destinationId, setDestinationId] = useState("");
  const submitted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function copy() {
    const destination = destinations.find(
      (value) => value.value === destinationId,
    );
    if (submitted.current || !destination) return;
    submitted.current = true;
    setBusy(true);
    setError("");
    const request = {
      organisationId: destination.organisationId,
      teamId: destination.teamId,
    };
    try {
      if (kind === "drills") {
        const saved = await api.copyDrill(item.id, request);
        library.saveDrill(saved);
        onClose();
        navigate(`/drills/${saved.id}`, { state: { notice: "Copy created" } });
      } else {
        const saved = await api.copyTraining(item.id, request);
        library.saveTraining(saved);
        await library.refresh(true);
        onClose();
        navigate(`/practices/${saved.id}`, {
          state: { notice: "Copy created" },
        });
      }
    } catch (e) {
      submitted.current = false;
      setError(e instanceof Error ? e.message : "Could not copy content.");
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="copy-title"
        className="copy-dialog"
      >
        <h2 id="copy-title">Create copy</h2>
        <p>Choose where to copy “{item.title}”.</p>
        <label htmlFor="copy-destination">Destination</label>
        <select
          id="copy-destination"
          value={destinationId}
          disabled={busy}
          autoFocus
          onChange={(event) => setDestinationId(event.target.value)}
        >
          <option value="">Choose a team or club…</option>
          {destinations.map((destination) => (
            <option key={destination.value} value={destination.value}>
              {destination.label}
            </option>
          ))}
        </select>
        {kind === "practices" && (
          <p>
            All included drills will also be copied. The new practice keeps its
            drill order, durations, and practice-specific notes.
          </p>
        )}
        <p>
          The original stays unchanged. A separate copy is created even if the
          destination already has an item with the same name.
        </p>
        {error && (
          <p className="alert error" role="alert">
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
            disabled={busy || !destinationId}
            onClick={() => void copy()}
          >
            {busy ? "Copying…" : "Create copy"}
          </button>
        </div>
      </section>
    </div>
  );
}

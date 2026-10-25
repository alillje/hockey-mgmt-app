import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLibrary } from "../../App";
import { api } from "../../lib/api";
import type { Drill, Training } from "../../lib/types";

export default function CopyDialog({
  kind,
  item,
  toLibrary,
  onClose,
}: {
  kind: "drills" | "practices";
  item: Drill | Training;
  toLibrary: boolean;
  onClose: () => void;
}) {
  const library = useLibrary();
  const submitted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copyId, setCopyId] = useState("");
  const label = toLibrary ? "Copy to organisation library" : "Copy to my team";
  async function copy() {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setError("");
    try {
      const saved =
        kind === "drills"
          ? await api.copyDrill(item.id, toLibrary)
          : await api.copyTraining(item.id, toLibrary);
      await library.refresh(true);
      setCopyId(saved.id);
    } catch (e) {
      submitted.current = false;
      setError(e instanceof Error ? e.message : "Could not copy content.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="copy-title"
        className="copy-dialog"
      >
        <h2 id="copy-title">{copyId ? "Copy created" : label}</h2>
        {copyId ? (
          <>
            <p>
              The independent copy is ready. It keeps its own content when the
              original changes or is deleted.
            </p>
            <Link
              className="button primary"
              to={`/${kind}/${copyId}`}
              onClick={() => {
                if (toLibrary)
                  library.selectWorkspace(item.ownership!.organisationId, "");
                onClose();
              }}
            >
              Open new {kind === "drills" ? "drill" : "practice plan"}
            </Link>
          </>
        ) : (
          <>
            <p>
              Copy “{item.title}” to{" "}
              {toLibrary
                ? "the organisation library"
                : library.team?.name || "your team"}
              ?
            </p>
            {kind === "practices" && (
              <p>
                All included drills will also be copied. The new plan will use
                only those independent drill copies, preserving their order,
                durations, and practice-specific notes.
              </p>
            )}
            <p>
              {toLibrary
                ? "Your team keeps its original. The club gets an independent copy, even if an item with the same name already exists."
                : "Your team gets an independent copy, even if an item with the same name already exists in your team."}
            </p>
            {error && (
              <p className="alert error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void copy()}
            >
              {busy ? "Copying…" : label}
            </button>
          </>
        )}
        <button className="button secondary" disabled={busy} onClick={onClose}>
          {copyId ? "Close" : "Cancel"}
        </button>
      </section>
    </div>
  );
}

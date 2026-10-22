import { useEffect, useState } from "react";
import {
  ChevronRight,
  Download,
  Plus,
  Save,
  Copy,
  Trash2,
  X,
  LoaderCircle,
  Check,
  ArrowUpRight,
} from "lucide-react";
import { api } from "./lib/api";
import type { Category, Drill, Training } from "./lib/types";
import { newDrill, newTraining } from "./lib/types";
import LibrarySidebar from "./components/LibrarySidebar";
import DiagramEditor from "./components/DiagramEditor";
import TrainingEditor from "./components/TrainingEditor";
export default function App() {
  const [mode, setMode] = useState<"drills" | "trainings">("drills");
  const [drills, setDrills] = useState<Drill[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [drill, setDrill] = useState<Drill>(newDrill);
  const [training, setTraining] = useState<Training>(newTraining);
  const [baseline, setBaseline] = useState(() => JSON.stringify(newDrill()));
  const [editorKey, setEditorKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const current = mode === "drills" ? drill : training;
  const dirty = JSON.stringify(current) !== baseline;
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [catalog, d, t] = await Promise.all([
        api.catalog(),
        api.drills(),
        api.trainings(),
      ]);
      setCategories(catalog.categories);
      setDrills(d);
      setTrainings(t);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  function message(e: unknown) {
    return e instanceof Error
      ? e.message
      : "Something went wrong. Please try again.";
  }
  function canLeave() {
    return !dirty || window.confirm("Discard unsaved changes?");
  }
  function loadDrill(d: Drill) {
    if (!canLeave()) return;
    setDrill(structuredClone(d));
    setBaseline(JSON.stringify(d));
    setEditorKey((k) => k + 1);
    setNotice("");
    setError("");
  }
  function loadTraining(t: Training) {
    if (!canLeave()) return;
    setTraining(structuredClone(t));
    setBaseline(JSON.stringify(t));
    setNotice("");
    setError("");
  }
  function switchMode(next: typeof mode) {
    if (next === mode || !canLeave()) return;
    setMode(next);
    const d = newDrill(),
      t = newTraining();
    setDrill(d);
    setTraining(t);
    setBaseline(JSON.stringify(next === "drills" ? d : t));
    setEditorKey((k) => k + 1);
    setError("");
    setNotice("");
  }
  function create() {
    mode === "drills" ? loadDrill(newDrill()) : loadTraining(newTraining());
  }
  async function save() {
    if (!current.title.trim()) {
      setError(
        "Give your " +
          (mode === "drills" ? "drill" : "practice") +
          " a title before saving.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (mode === "drills") {
        const saved = await api.saveDrill(drill);
        setDrill(saved);
        setDrills((prev) => [saved, ...prev.filter((d) => d.id !== saved.id)]);
        setBaseline(JSON.stringify(saved));
      } else {
        const saved = await api.saveTraining(training);
        setTraining(saved);
        setTrainings((prev) => [
          saved,
          ...prev.filter((t) => t.id !== saved.id),
        ]);
        setBaseline(JSON.stringify(saved));
      }
      setNotice("Saved to your library");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !current.id ||
      !window.confirm(
        `Delete “${current.title}” from your library? This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (mode === "drills") {
        await api.deleteDrill(drill.id);
        setDrills((prev) => prev.filter((d) => d.id !== drill.id));
        const fresh = newDrill();
        setDrill(fresh);
        setBaseline(JSON.stringify(fresh));
        setEditorKey((k) => k + 1);
      } else {
        await api.deleteTraining(training.id);
        setTrainings((prev) => prev.filter((t) => t.id !== training.id));
        const fresh = newTraining();
        setTraining(fresh);
        setBaseline(JSON.stringify(fresh));
      }
      setNotice("Deleted from your library");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function pdf() {
    setBusy(true);
    setError("");
    try {
      const { exportDrill, exportTraining } = await import("./lib/pdf");
      mode === "drills"
        ? await exportDrill(drill)
        : await exportTraining(training, drills);
      setNotice("PDF downloaded");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#" aria-label="Icework coach workspace">
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <strong>
            icework<span> / </span>
          </strong>
          <span className="brand-subtitle">COACH WORKSPACE</span>
        </a>
        <div className="header-right">
          <span className="local-badge">
            <span />
            LOCAL POC
          </span>
          <span className="coach-avatar" aria-label="Coach workspace">
            C
          </span>
        </div>
      </header>
      <div className="workspace">
        <LibrarySidebar
          key={mode}
          mode={mode}
          drills={drills}
          trainings={trainings}
          categories={categories}
          drill={drill}
          training={training}
          busy={busy}
          loading={loading}
          switchMode={switchMode}
          create={create}
          loadDrill={loadDrill}
          loadTraining={loadTraining}
        />
        <main className="main-content">
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={13} />
            {mode === "drills" ? "Drill library" : "Practice plans"}
            <ChevronRight size={13} />
            <span>
              {current.id ? "Edit" : "New"}{" "}
              {mode === "drills" ? "drill" : "practice"}
            </span>
          </div>
          <div className="page-top">
            <div>
              <div className="inline">
                <span className="eyebrow">
                  {mode === "drills" ? "DRILL DESIGNER" : "PRACTICE BUILDER"}
                </span>
                <span className={"save-status " + (dirty ? "unsaved" : "")}>
                  {dirty
                    ? "Unsaved changes"
                    : current.id
                      ? "Saved"
                      : "New draft"}
                </span>
              </div>
              <h1>
                {mode === "drills"
                  ? "Good practice starts here."
                  : "Make your ice time count."}
              </h1>
              <p>
                {mode === "drills"
                  ? "Map it out. Add your coaching cues. Take it to the ice."
                  : "Bring your drills together into a plan your team can follow."}
              </p>
            </div>
            <button
              className="button secondary new-button"
              onClick={create}
              disabled={busy}
            >
              <Plus size={17} />
              New {mode === "drills" ? "drill" : "practice"}
            </button>
          </div>
          {error && (
            <div className="alert error" role="alert">
              <span>{error}</span>
              <div className="inline">
                <button
                  onClick={() => void refresh()}
                  disabled={busy || loading}
                >
                  Reload library
                </button>
                <button
                  className="icon-button"
                  aria-label="Dismiss error"
                  onClick={() => setError("")}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
          {notice && !dirty && (
            <div className="alert success" role="status">
              <span className="inline">
                <Check size={16} />
                {notice}
              </span>
              <button
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <section className="details-card">
            <div className="title-field">
              <label htmlFor="item-title">
                {mode === "drills" ? "Drill" : "Practice"} title
              </label>
              <input
                id="item-title"
                maxLength={120}
                disabled={busy}
                value={current.title}
                placeholder={
                  mode === "drills" ? "Name this drill" : "Name this practice"
                }
                onChange={(e) =>
                  mode === "drills"
                    ? setDrill({ ...drill, title: e.target.value })
                    : setTraining({ ...training, title: e.target.value })
                }
              />
            </div>
            {mode === "drills" && (
              <div className="category-field">
                <label htmlFor="drill-category">Category</label>
                <select
                  id="drill-category"
                  disabled={busy}
                  value={drill.categoryId}
                  onChange={(e) =>
                    setDrill({ ...drill, categoryId: e.target.value })
                  }
                >
                  {(categories.length
                    ? categories
                    : [{ id: "skating", name: "Skating" }]
                  ).map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </section>
          <fieldset className="workspace-editor" disabled={busy}>
            {mode === "drills" ? (
              <DiagramEditor
                key={editorKey}
                diagram={drill.diagram}
                onChange={(diagram) => setDrill((d) => ({ ...d, diagram }))}
              />
            ) : (
              <TrainingEditor
                training={training}
                drills={drills}
                onChange={setTraining}
              />
            )}
            <section className="notes-card">
              <div className="notes-heading">
                <div>
                  <span className="eyebrow">
                    {mode === "drills" ? "COACHING NOTES" : "PRACTICE NOTES"}
                  </span>
                  <h2>
                    {mode === "drills"
                      ? "Give the drill a purpose"
                      : "Set the tone for the session"}
                  </h2>
                </div>
                <span className="small muted">Included in your PDF</span>
              </div>
              <textarea
                maxLength={6000}
                aria-label={
                  mode === "drills" ? "Coaching notes" : "Practice notes"
                }
                value={current.notes}
                placeholder={
                  mode === "drills"
                    ? "Setup, sequence, key teaching points, progressions…"
                    : "Session objectives, team focus, equipment, reminders…"
                }
                onChange={(e) =>
                  mode === "drills"
                    ? setDrill({ ...drill, notes: e.target.value })
                    : setTraining({ ...training, notes: e.target.value })
                }
              />
            </section>
          </fieldset>
          <footer className="action-bar">
            <div className="inline">
              {mode === "drills" && drill.id && (
                <button
                  className="icon-button"
                  aria-label="Duplicate drill"
                  title="Duplicate drill"
                  disabled={busy}
                  onClick={() =>
                    loadDrill({
                      ...structuredClone(drill),
                      id: "",
                      title: (drill.title + " (copy)").slice(0, 120),
                      updatedAt: "",
                    })
                  }
                >
                  <Copy size={17} />
                </button>
              )}
              <span className="action-hint">
                <ArrowUpRight size={17} />
                Ready for the next session.
              </span>
              {current.id && (
                <button
                  className="icon-button delete-button"
                  aria-label={
                    mode === "drills" ? "Delete drill" : "Delete practice"
                  }
                  onClick={() => void remove()}
                  disabled={busy}
                >
                  <Trash2 size={17} />
                </button>
              )}
            </div>
            <div className="inline">
              <button
                className="button secondary"
                onClick={() => void pdf()}
                disabled={busy || loading}
              >
                <Download size={17} />
                Download PDF
              </button>
              <button
                className="button primary"
                onClick={() => void save()}
                disabled={busy || loading}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Save size={17} />
                )}
                Save {mode === "drills" ? "drill" : "practice"}
              </button>
            </div>
          </footer>
          <p className="poc-note">
            A local proof of concept. No sign-in required. Export a PDF to share
            your plan.
          </p>
        </main>
      </div>
    </div>
  );
}

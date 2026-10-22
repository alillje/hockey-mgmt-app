import { useEffect, useRef, useState } from "react";
import {
  Link,
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ChevronRight,
  Download,
  Save,
  Trash2,
  Copy,
  ArrowLeft,
} from "lucide-react";
import { useLibrary } from "../App";
import { api } from "../lib/api";
import {
  appendKey,
  appendDrillOnce,
  draftKey,
  parentKey,
  readDraft,
  writeDraft,
} from "../lib/drafts";
import { categoryForTags, normalizeTags } from "../lib/tags";
import { newDrill, newTraining } from "../lib/types";
import type { Drill, Training } from "../lib/types";
import DiagramEditor from "../components/DiagramEditor";
import TrainingEditor from "../components/TrainingEditor";
import TagPicker from "../components/TagPicker";

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : "Something went wrong.";
}
export default function EditorPage({ kind }: { kind: "drills" | "practices" }) {
  const { id } = useParams();
  const library = useLibrary();
  const location = useLocation();
  if (library.loading) return <main className="hub-page">Loading…</main>;
  const entity = id
    ? (kind === "drills" ? library.drills : library.trainings).find(
        (item) => item.id === id,
      )
    : undefined;
  const stored = readDraft(draftKey(kind, id || "new"));
  if (id && !entity && !stored)
    return (
      <main className="hub-page">
        <h1>Item not found</h1>
        <Link to={`/${kind}`}>Back to {kind}</Link>
      </main>
    );
  return (
    <Editor
      key={`${kind}:${id || "new"}:${location.search}`}
      kind={kind}
      id={id || "new"}
    />
  );
}
function Editor({ kind, id }: { kind: "drills" | "practices"; id: string }) {
  const library = useLibrary();
  const navigate = useNavigate();
  const location = useLocation();
  const nested =
    kind === "drills" &&
    new URLSearchParams(location.search).get("fromPractice") === "1";
  const key = draftKey(kind, nested ? "nested" : id);
  const original =
    id === "new"
      ? kind === "drills"
        ? newDrill()
        : newTraining()
      : (kind === "drills" ? library.drills : library.trainings).find(
          (item) => item.id === id,
        )!;
  const [value, setValue] = useState<Drill | Training>(() => {
    const draft = readDraft<Drill | Training>(key) || structuredClone(original);
    return { ...draft, tags: normalizeTags(draft.tags, library.categories) };
  });
  const [baseline, setBaseline] = useState(() => JSON.stringify(original));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    (location.state as { notice?: string } | null)?.notice || "",
  );
  const allow = useRef(false);
  const dirty = JSON.stringify(value) !== baseline;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !allow.current &&
      currentLocation.pathname + currentLocation.search !==
        nextLocation.pathname + nextLocation.search,
  );
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (
        window.confirm(
          `Discard unsaved ${nested ? "drill" : kind === "drills" ? "drill" : "practice"} changes?`,
        )
      ) {
        sessionStorage.removeItem(key);
        blocker.proceed();
      } else blocker.reset();
    }
  }, [blocker, key, kind, nested]);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  useEffect(() => {
    if (dirty) writeDraft(key, value);
    else sessionStorage.removeItem(key);
  }, [key, value, dirty]);
  useEffect(() => {
    if (kind !== "practices") return;
    const drillId = sessionStorage.getItem(appendKey);
    if (!drillId) return;
    sessionStorage.removeItem(appendKey);
    setValue((current) => {
      const updated = appendDrillOnce(current as Training, drillId);
      writeDraft(key, updated);
      return updated;
    });
  }, [kind, key]);
  const drill = kind === "drills" ? (value as Drill) : null;
  const training = kind === "practices" ? (value as Training) : null;
  const title = kind === "drills" ? "drill" : "practice";
  const parentPath =
    kind === "drills" && nested
      ? sessionStorage.getItem(parentKey) || "/practices/new"
      : `/${kind}`;
  function goBack() {
    if (nested) {
      if (dirty && !window.confirm("Discard unsaved drill changes?")) return;
      sessionStorage.removeItem(key);
      allow.current = true;
      navigate(parentPath, { replace: true });
    } else navigate(`/${kind}`);
  }
  function createFromPractice() {
    if (!training || training.items.length >= 100) return;
    writeDraft(key, training);
    sessionStorage.setItem(parentKey, location.pathname);
    allow.current = true;
    navigate("/drills/new?fromPractice=1");
  }
  async function save() {
    if (!value.title.trim()) {
      setError(`Give your ${title} a title before saving.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (drill) {
        const prepared = {
          ...drill,
          categoryId: categoryForTags(drill.tags, library.categories),
        };
        const saved = await api.saveDrill(prepared);
        library.saveDrill(saved);
        sessionStorage.removeItem(key);
        if (nested) {
          sessionStorage.setItem(appendKey, saved.id);
          allow.current = true;
          navigate(parentPath, { replace: true });
          return;
        }
        setValue(saved);
        setBaseline(JSON.stringify(saved));
        setNotice("Saved to your library");
        if (id === "new") {
          allow.current = true;
          navigate(`/drills/${saved.id}`, {
            replace: true,
            state: { notice: "Saved to your library" },
          });
        } else allow.current = false;
      } else if (training) {
        const saved = await api.saveTraining(training);
        library.saveTraining(saved);
        sessionStorage.removeItem(key);
        setValue(saved);
        setBaseline(JSON.stringify(saved));
        setNotice("Saved to your library");
        if (id === "new") {
          allow.current = true;
          navigate(`/practices/${saved.id}`, {
            replace: true,
            state: { notice: "Saved to your library" },
          });
        } else allow.current = false;
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !value.id ||
      !window.confirm(
        `Delete “${value.title}” from your library? This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (drill) {
        await api.deleteDrill(drill.id);
        library.removeDrill(drill.id);
      } else if (training) {
        await api.deleteTraining(training.id);
        library.removeTraining(training.id);
      }
      sessionStorage.removeItem(key);
      allow.current = true;
      navigate(`/${kind}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function pdf() {
    setBusy(true);
    setError("");
    try {
      const { exportDrill, exportTraining } = await import("../lib/pdf");
      if (drill) await exportDrill(drill);
      else if (training) await exportTraining(training, library.drills);
      setNotice("PDF downloaded");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="main-content editor-page">
      <div className="breadcrumb">
        <Link to="/">Home</Link>
        <ChevronRight size={13} />
        <Link to={`/${kind}`}>
          {kind === "drills" ? "Drills" : "Practices"}
        </Link>
        <ChevronRight size={13} />
        <span>{value.id ? value.title : `New ${title}`}</span>
      </div>
      <div className="page-top">
        <div>
          <div className="inline">
            <span className="eyebrow">
              {drill ? "DRILL DESIGNER" : "PRACTICE BUILDER"}
            </span>
            <span className={`save-status ${dirty ? "unsaved" : ""}`}>
              {dirty ? "Unsaved changes" : value.id ? "Saved" : "New draft"}
            </span>
          </div>
          <h1>
            {drill
              ? nested
                ? "Draw a drill for your practice."
                : "Good practice starts here."
              : "Make your ice time count."}
          </h1>
          {nested && (
            <p className="nested-context">
              Return to your practice after saving this drill. Your practice
              draft is kept.
            </p>
          )}
          <p>
            {drill
              ? "Map it out. Add your coaching cues. Take it to the ice."
              : "Bring your drills together into a plan your team can follow."}
          </p>
        </div>
        <button className="button secondary" onClick={goBack}>
          <ArrowLeft size={16} /> {nested ? "Back to practice" : "Back"}
        </button>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      <section className="details-card">
        <div className="title-field">
          <label htmlFor="item-title">
            {drill ? "Drill" : "Practice"} title
          </label>
          <input
            id="item-title"
            maxLength={120}
            disabled={busy}
            value={value.title}
            onChange={(e) => setValue({ ...value, title: e.target.value })}
          />
        </div>
        <TagPicker
          tags={value.tags}
          categories={library.categories}
          disabled={busy}
          onChange={(tags) => setValue({ ...value, tags })}
        />
      </section>
      <fieldset className="workspace-editor" disabled={busy}>
        {drill ? (
          <DiagramEditor
            diagram={drill.diagram}
            onChange={(diagram) => setValue({ ...drill, diagram })}
          />
        ) : training ? (
          <>
            <TrainingEditor
              training={training}
              drills={library.drills}
              onChange={setValue}
              onCreateDrill={createFromPractice}
            />
          </>
        ) : null}
        <section className="notes-card">
          <div className="notes-heading">
            <div>
              <span className="eyebrow">
                {drill ? "COACHING NOTES" : "PRACTICE NOTES"}
              </span>
              <h2>
                {drill
                  ? "Give the drill a purpose"
                  : "Set the tone for the session"}
              </h2>
            </div>
            <span className="small muted">Included in your PDF</span>
          </div>
          <textarea
            maxLength={6000}
            aria-label={drill ? "Coaching notes" : "Practice notes"}
            value={value.notes}
            onChange={(e) => setValue({ ...value, notes: e.target.value })}
          />
        </section>
      </fieldset>
      <footer className="action-bar">
        <div className="inline">
          {drill?.id && !nested && (
            <button
              className="icon-button"
              aria-label="Duplicate drill"
              onClick={() => {
                const duplicate = {
                  ...structuredClone(drill),
                  id: "",
                  title: `${drill.title} (copy)`.slice(0, 120),
                  updatedAt: "",
                };
                writeDraft(draftKey("drills", "new"), duplicate);
                allow.current = true;
                navigate("/drills/new");
              }}
            >
              <Copy size={17} />
            </button>
          )}
          {value.id && (
            <button
              className="icon-button delete-button"
              aria-label={`Delete ${title}`}
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
            disabled={busy}
          >
            <Download size={17} /> Download PDF
          </button>
          {nested && (
            <button
              className="button secondary"
              onClick={goBack}
              disabled={busy}
            >
              Cancel and return
            </button>
          )}
          <button
            className="button primary"
            onClick={() => void save()}
            disabled={busy}
          >
            <Save size={17} />
            {nested ? "Save drill and add to practice" : `Save ${title}`}
          </button>
        </div>
      </footer>
    </main>
  );
}

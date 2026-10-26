import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { contentAges, newDrill, newTraining } from "../lib/types";
import type { Drill, Training } from "../lib/types";
import OwnershipBadge from "../features/workspace/OwnershipBadge";
import CopyDialog from "../features/workspace/CopyDialog";
import { DiagramSvg } from "../components/Rink";
import DiagramEditor from "../components/DiagramEditor";
import TrainingEditor from "../components/TrainingEditor";
import AgeGroupCheckboxes from "../components/AgeGroupCheckboxes";
import TagPicker from "../components/TagPicker";
import PagePlaceholder from "../components/PagePlaceholder";

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : "Something went wrong.";
}
export default function EditorPage({ kind }: { kind: "drills" | "practices" }) {
  const { id } = useParams();
  const library = useLibrary();
  const location = useLocation();
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);
  if (library.loading) return <PagePlaceholder />;
  if (library.error) return <main className="hub-page" />;
  const entity = id
    ? (kind === "drills" ? library.drills : library.trainings).find(
        (item) => item.id === id,
      )
    : undefined;
  if (id && !entity)
    return (
      <main className="hub-page">
        <h1>Item not found</h1>
        <Link to={`/${kind}`}>Back to {kind}</Link>
      </main>
    );
  if (!id && !library.canCreate)
    return (
      <main className="hub-page">
        <h1>Editing permission required</h1>
        <Link to="/drills/all?source=club">Browse drills</Link>
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
  const [copyDestination, setCopyDestination] = useState<
    "team" | "library" | null
  >(null);
  const original =
    id === "new"
      ? kind === "drills"
        ? newDrill()
        : newTraining()
      : (kind === "drills" ? library.drills : library.trainings).find(
          (item) => item.id === id,
        )!;
  const [value, setValue] = useState<Drill | Training>(() => {
    const draft =
      (original.ownership?.canEdit !== false
        ? readDraft<Drill | Training>(key)
        : null) || structuredClone(original);
    return {
      ...draft,
      ownership: original.ownership,
      ageGroups: contentAges(draft),
      tags: normalizeTags(draft.tags, library.categories),
    };
  });
  const [baseline, setBaseline] = useState(() => JSON.stringify(original));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    (location.state as { notice?: string } | null)?.notice || "",
  );
  const allow = useRef(false);
  const canEdit = original.id
    ? !!original.ownership?.canEdit
    : library.canCreate;
  useEffect(() => {
    const changing = () => {
      allow.current = true;
    };
    window.addEventListener("icework:workspace-changing", changing);
    return () =>
      window.removeEventListener("icework:workspace-changing", changing);
  }, []);
  const dirty = canEdit && JSON.stringify(value) !== baseline;
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
    if (busy || (value.id && !dirty)) return;
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
              ? value.id
                ? "Edit drill"
                : "Create new drill"
              : value.id
                ? "Edit practice"
                : "Create new practice"}
          </h1>
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
      <OwnershipBadge ownership={value.ownership} />
      {!canEdit && (
        <p className="alert">
          You can view or export this content. Copy it to your team to edit it
          or use its drills in your team’s practice plans.
        </p>
      )}
      {canEdit ? (
        <fieldset className="details-card" disabled={busy}>
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
        </fieldset>
      ) : (
        <section className="details-card">
          <h2>{value.title}</h2>
        </section>
      )}
      <fieldset className="workspace-editor" disabled={busy}>
        {drill ? (
          !canEdit ? (
            <div className="details-card">
              <DiagramSvg diagram={drill.diagram} />
            </div>
          ) : (
            <DiagramEditor
              diagram={drill.diagram}
              onChange={(diagram) => setValue({ ...drill, diagram })}
            />
          )
        ) : training ? (
          <>
            <TrainingEditor
              training={training}
              drills={library.drills.filter(
                (d) =>
                  d.ownership?.ownerTeamId ===
                  (training.ownership
                    ? training.ownership.ownerTeamId
                    : library.teamId || null),
              )}
              readOnly={!canEdit}
              canCreateDrill={
                !training.ownership ||
                training.ownership.ownerTeamId === (library.teamId || null)
              }
              onChange={setValue}
              onCreateDrill={createFromPractice}
            />
          </>
        ) : null}
        <section className="notes-card">
          <div className="notes-heading">
            <div>
              <h2>{drill ? "Coaching notes" : "Practice notes"}</h2>
            </div>
            <span className="small muted">Included in your PDF</span>
          </div>
          <textarea
            readOnly={!canEdit}
            maxLength={6000}
            aria-label={drill ? "Coaching notes" : "Practice notes"}
            value={value.notes}
            onChange={(e) => setValue({ ...value, notes: e.target.value })}
          />
        </section>
      </fieldset>
      {canEdit ? (
        <fieldset className="details-card metadata-card" disabled={busy}>
          <TagPicker
            tags={value.tags}
            categories={library.categories}
            disabled={busy}
            onChange={(tags) => setValue({ ...value, tags })}
          />
          <AgeGroupCheckboxes
            value={contentAges(value)}
            ageGroups={library.ageGroups}
            onChange={(ageGroups) => setValue({ ...value, ageGroups })}
          />
        </fieldset>
      ) : (
        <section
          className="details-card metadata-card"
          aria-label="Categories and age groups"
        >
          <div>
            <h2>Categories</h2>
            <p>{value.tags.join(" · ") || "Uncategorized"}</p>
          </div>
          <div>
            <h2>Age groups</h2>
            <p>{contentAges(value).join(" · ") || "None selected"}</p>
          </div>
        </section>
      )}
      <footer className="action-bar">
        <div className="inline">
          {value.id && !nested && value.ownership?.canCopyToTeam && (
            <button
              className="button secondary"
              disabled={busy || dirty}
              onClick={() => setCopyDestination("team")}
            >
              <Copy size={17} /> Copy to my team
            </button>
          )}
          {value.id && !nested && value.ownership?.canCopyToLibrary && (
            <button
              className="button secondary"
              disabled={busy || dirty}
              onClick={() => setCopyDestination("library")}
            >
              <Copy size={17} /> Copy to organisation library
            </button>
          )}
          {value.id && canEdit && (
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
          {canEdit && (
            <button
              className="button primary"
              onClick={() => void save()}
              disabled={busy || (!!value.id && !dirty)}
              title={value.id && !dirty ? "No unsaved changes" : undefined}
            >
              <Save size={17} />
              {nested ? "Save drill and add to practice" : `Save ${title}`}
            </button>
          )}
        </div>
      </footer>
      {copyDestination && (
        <CopyDialog
          kind={kind}
          item={value}
          toLibrary={copyDestination === "library"}
          onClose={() => setCopyDestination(null)}
        />
      )}
    </main>
  );
}

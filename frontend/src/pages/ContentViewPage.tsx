import { useLayoutEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, Copy, Download, Pencil } from "lucide-react";
import { useLibrary } from "../App";
import PagePlaceholder from "../components/PagePlaceholder";
import { DiagramSvg } from "../components/Rink";
import TrainingEditor from "../components/TrainingEditor";
import OwnershipBadge from "../features/workspace/OwnershipBadge";
import CopyDialog from "../features/workspace/CopyDialog";
import { copyDestinations } from "../features/workspace/copyDestinations";
import { contentAges, type Drill, type Training } from "../lib/types";

export default function ContentViewPage({
  kind,
}: {
  kind: "drills" | "practices";
}) {
  const { id } = useParams();
  const library = useLibrary();
  const location = useLocation();
  const [copying, setCopying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    setError("");
    setCopying(false);
  }, [location.pathname]);
  if (library.loading) return <PagePlaceholder />;
  if (library.error) return <main className="hub-page" />;
  const item = (kind === "drills" ? library.drills : library.trainings).find(
    (value) => value.id === id,
  );
  if (!item)
    return (
      <main className="hub-page">
        <h1>Item not found</h1>
        <Link to={`/${kind}`}>Back to {kind}</Link>
      </main>
    );
  const drill = kind === "drills" ? (item as Drill) : null;
  const practice = kind === "practices" ? (item as Training) : null;
  const label = drill ? "drill" : "practice";
  const notice = (location.state as { notice?: string } | null)?.notice;
  async function pdf() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { exportDrill, exportTraining } = await import("../lib/pdf");
      if (drill) await exportDrill(drill);
      else if (practice) await exportTraining(practice, library.drills);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export PDF.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="main-content content-view">
      <Link className="content-back" to={`/${kind}`}>
        <ArrowLeft size={16} /> Back to {kind}
      </Link>
      <div className="page-top">
        <div>
          <div className="eyebrow">{drill ? "Drill" : "Practice"}</div>
          <h1>{item.title}</h1>
          <OwnershipBadge ownership={item.ownership} />
        </div>
        <div className="content-actions">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void pdf()}
          >
            <Download size={17} /> Export to PDF
          </button>
          {copyDestinations(item.ownership, library.workspaces).length > 0 && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setCopying(true)}
            >
              <Copy size={17} /> Create copy
            </button>
          )}
          {item.ownership?.canEdit && (
            <Link className="button primary" to={`/${kind}/${item.id}/edit`}>
              <Pencil size={17} /> Edit {label}
            </Link>
          )}
        </div>
      </div>
      {notice && (
        <p className="alert success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {drill && (
        <section
          className="details-card content-rink"
          role="img"
          aria-label={`Rink diagram: ${drill.title}`}
        >
          <DiagramSvg diagram={drill.diagram} />
        </section>
      )}
      {practice && (
        <TrainingEditor
          training={practice}
          drills={library.drills.filter(
            (value) =>
              value.ownership?.ownerTeamId === practice.ownership?.ownerTeamId,
          )}
          readOnly
          onChange={() => {}}
          onCreateDrill={() => {}}
        />
      )}
      <section className="notes-card">
        <h2>{drill ? "Coaching notes" : "Practice notes"}</h2>
        <p className="content-notes">{item.notes || "No notes added."}</p>
      </section>
      <section
        className="details-card metadata-card"
        aria-label="Categories and age groups"
      >
        <div>
          <h2>Categories</h2>
          <p>{item.tags.join(" · ") || "Uncategorized"}</p>
        </div>
        <div>
          <h2>Age groups</h2>
          <p>{contentAges(item).join(" · ") || "None selected"}</p>
        </div>
      </section>
      {copying && (
        <CopyDialog kind={kind} item={item} onClose={() => setCopying(false)} />
      )}
    </main>
  );
}

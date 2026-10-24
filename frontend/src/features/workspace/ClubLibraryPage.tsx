import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useLibrary } from "../../App";
import { api } from "../../lib/api";
import { newTraining } from "../../lib/types";
import { draftKey, readDraft, writeDraft } from "../../lib/drafts";
import type { Drill, Training } from "../../lib/types";
import OwnershipBadge from "./OwnershipBadge";

export default function ClubLibraryPage() {
  const library = useLibrary();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const change = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { flushSync: true });
  };
  const all = [
    ...library.drills.map((item) => ({ kind: "drills" as const, item })),
    ...library.trainings.map((item) => ({ kind: "practices" as const, item })),
  ].filter(
    ({ item }) =>
      item.ownership?.visibility === "organisation" ||
      item.ownership?.ownerTeamId === null,
  );
  const legacyAges = [
    ...new Set(
      all
        .map(({ item }) => item.ageGroup)
        .filter(
          (age): age is string =>
            !!age && !library.ageGroups.some((group) => group.id === age),
        ),
    ),
  ].sort();
  const origins = [
    ...new Map(
      all
        .filter(({ item }) => item.ownership?.originTeamId)
        .map(({ item }) => [
          item.ownership!.originTeamId!,
          item.ownership!.originTeamName || "Former team",
        ]),
    ).entries(),
  ];
  const filtered = all.filter(
    ({ kind, item }) =>
      (!params.get("type") || kind === params.get("type")) &&
      (!params.get("age") || item.ageGroup === params.get("age")) &&
      (!params.get("tag") || item.tags.includes(params.get("tag")!)) &&
      (!params.get("origin") ||
        item.ownership?.originTeamId === params.get("origin")) &&
      `${item.title} ${item.notes} ${item.tags.join(" ")}`
        .toLowerCase()
        .includes((params.get("search") || "").toLowerCase()),
  );
  async function copy(kind: "drills" | "practices", item: Drill | Training) {
    setBusy(true);
    setError("");
    try {
      const saved =
        kind === "drills"
          ? await api.copyDrill(item.id)
          : await api.copyTraining(item.id);
      await library.refresh();
      navigate(`/${kind}/${saved.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not copy.");
    } finally {
      setBusy(false);
    }
  }
  function useDrill(drill: Drill) {
    const key = draftKey("practices", "new");
    const draft = readDraft<Training>(key) || newTraining();
    if (draft.items.length >= 100) {
      setError("Your practice draft already has 100 drills.");
      return;
    }
    writeDraft(key, {
      ...draft,
      items: [
        ...draft.items,
        { drillId: drill.id, durationMinutes: 10, notes: "" },
      ],
    });
    navigate("/practices/new");
  }
  return (
    <main className="hub-page library-page">
      <div className="page-top">
        <div>
          <span className="eyebrow">
            {library.organisation?.name || "YOUR CLUB"}
          </span>
          <h1>Club library</h1>
          <p>
            Content available to all teams, plus content shared by your teams.
          </p>
        </div>
        {library.organisation?.isAdmin && !library.teamId && (
          <div className="inline">
            <Link className="button primary" to="/drills/new">
              Create club drill
            </Link>
            <Link className="button secondary" to="/practices/new">
              Create club practice
            </Link>
          </div>
        )}
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <div className="club-filters">
        <label>
          Search{" "}
          <input
            value={params.get("search") || ""}
            onChange={(e) => change("search", e.target.value)}
          />
        </label>
        <label>
          Content{" "}
          <select
            aria-label="Content"
            value={params.get("type") || ""}
            onChange={(e) => change("type", e.target.value)}
          >
            <option value="">Drills and practice plans</option>
            <option value="drills">Drills</option>
            <option value="practices">Practice plans</option>
          </select>
        </label>
        <label>
          Age group{" "}
          <select
            aria-label="Age group"
            value={params.get("age") || ""}
            onChange={(e) => change("age", e.target.value)}
          >
            <option value="">All ages</option>
            {library.ageGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
            {legacyAges.length > 0 && (
              <optgroup label="Previous age groups">
                {legacyAges.map((age) => (
                  <option key={age} value={age}>
                    {age}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <label>
          Category{" "}
          <select
            aria-label="Category"
            value={params.get("tag") || ""}
            onChange={(e) => change("tag", e.target.value)}
          >
            <option value="">All categories</option>
            {library.categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Originating team{" "}
          <select
            aria-label="Originating team"
            value={params.get("origin") || ""}
            onChange={(e) => change("origin", e.target.value)}
          >
            <option value="">All teams</option>
            {origins.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="result-list">
        {library.loading ? (
          <p>Loading…</p>
        ) : (
          filtered.map(({ kind, item }) => (
            <article className="club-card" key={`${kind}:${item.id}`}>
              <div>
                <span className="eyebrow">
                  {kind === "drills" ? "Drill" : "Practice plan"}
                  {item.ageGroup && ` · ${item.ageGroup}`}
                </span>
                <h2>{item.title}</h2>
                <OwnershipBadge ownership={item.ownership} />
                <p className="muted">
                  {item.tags.join(" · ") || "Uncategorized"}
                </p>
              </div>
              <div className="inline">
                <Link className="button secondary" to={`/${kind}/${item.id}`}>
                  {item.ownership?.canEdit ? "View / edit" : "View / use"}
                </Link>
                {kind === "drills" && library.canCreate && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => useDrill(item as Drill)}
                  >
                    Use in a practice
                  </button>
                )}
                {item.ownership?.canCopy && (
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => void copy(kind, item)}
                  >
                    Copy to my team
                  </button>
                )}
              </div>
            </article>
          ))
        )}
        {!library.loading && filtered.length === 0 && (
          <p className="empty-state">
            No shared content matches these filters.
          </p>
        )}
      </div>
    </main>
  );
}

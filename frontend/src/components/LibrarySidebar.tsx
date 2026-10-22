import { useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Plus,
  Search,
  X,
} from "lucide-react";
import type { Category, Drill, Training } from "../lib/types";
type Props = {
  mode: "drills" | "trainings";
  drills: Drill[];
  trainings: Training[];
  categories: Category[];
  drill: Drill;
  training: Training;
  busy: boolean;
  loading: boolean;
  switchMode: (mode: "drills" | "trainings") => void;
  create: () => void;
  loadDrill: (d: Drill) => void;
  loadTraining: (t: Training) => void;
};
export default function LibrarySidebar({
  mode,
  drills,
  trainings,
  categories,
  drill,
  training,
  busy,
  loading,
  switchMode,
  create,
  loadDrill,
  loadTraining,
}: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const filteredDrills = drills.filter(
    (d) =>
      (!category || d.categoryId === category) &&
      `${d.title} ${d.notes}`.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredTrainings = trainings.filter((t) =>
    `${t.title} ${t.notes}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <aside className="sidebar">
      <div className="workspace-label">YOUR WORKSPACE</div>
      <nav className="main-nav" aria-label="Workspace">
        <button
          className={mode === "drills" ? "nav-item active" : "nav-item"}
          onClick={() => switchMode("drills")}
          disabled={busy}
        >
          <BookOpen size={19} />
          <span>Drill library</span>
          <span className="nav-count">{drills.length}</span>
        </button>
        <button
          className={mode === "trainings" ? "nav-item active" : "nav-item"}
          onClick={() => switchMode("trainings")}
          disabled={busy}
        >
          <CalendarDays size={19} />
          <span>Practice plans</span>
          <span className="nav-count">{trainings.length}</span>
        </button>
      </nav>
      <div className="library-heading">
        <span>{mode === "drills" ? "YOUR DRILLS" : "YOUR PRACTICES"}</span>
        <button
          className="icon-button"
          aria-label={
            mode === "drills" ? "Create new drill" : "Create new practice"
          }
          onClick={create}
          disabled={busy}
        >
          <Plus size={18} />
        </button>
      </div>
      <label className="search-field">
        <Search size={16} />
        <input
          aria-label="Search library"
          placeholder={
            mode === "drills" ? "Search drills…" : "Search practices…"
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            className="clear-search"
            aria-label="Clear search"
            onClick={() => setSearch("")}
          >
            <X size={13} />
          </button>
        )}
      </label>
      {mode === "drills" && (
        <select
          className="category-filter"
          aria-label="Filter drills by category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option value={c.id} key={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <div className="library-list">
        {loading ? (
          <p className="library-placeholder">Loading your library…</p>
        ) : mode === "drills" ? (
          filteredDrills.map((d) => (
            <button
              key={d.id}
              disabled={busy}
              className={
                drill.id === d.id ? "library-card selected" : "library-card"
              }
              onClick={() => loadDrill(d)}
            >
              <span className="library-category">
                {categories.find((c) => c.id === d.categoryId)?.name ||
                  d.categoryId}
              </span>
              <strong>{d.title}</strong>
              <span className="library-card-footer">
                {d.diagram.objects.length} objects · {d.diagram.paths.length}{" "}
                routes
                <ChevronRight size={15} />
              </span>
            </button>
          ))
        ) : (
          filteredTrainings.map((t) => (
            <button
              disabled={busy}
              key={t.id}
              className={
                training.id === t.id ? "library-card selected" : "library-card"
              }
              onClick={() => loadTraining(t)}
            >
              <span className="library-category">PRACTICE PLAN</span>
              <strong>{t.title}</strong>
              <span className="library-card-footer">
                {t.items.length} drills ·{" "}
                {t.items.reduce((n, i) => n + i.durationMinutes, 0)} min
                <ChevronRight size={15} />
              </span>
            </button>
          ))
        )}
        {!loading &&
          ((mode === "drills" && !filteredDrills.length) ||
            (mode === "trainings" && !filteredTrainings.length)) && (
            <div className="library-empty">
              <BookOpen size={24} />
              <p>
                {search || category
                  ? "No matching items. Try another search."
                  : "Your next great session starts here. Create and save your first " +
                    (mode === "drills" ? "drill." : "practice.")}
              </p>
            </div>
          )}
      </div>
      <div className="sidebar-footer">
        <span className="status-dot" />
        <span>
          Local workspace
          <br />
          <small>Plans stay on this server</small>
        </span>
      </div>
    </aside>
  );
}

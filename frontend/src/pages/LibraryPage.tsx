import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Search, Folder, ChevronRight } from "lucide-react";
import OwnershipBadge from "../features/workspace/OwnershipBadge";
import CategoryFilter from "../components/CategoryFilter";
import { useLibrary } from "../App";
import { catalogCategories, tagFolders, tagKey } from "../lib/tags";
export default function LibraryPage({
  kind,
}: {
  kind: "drills" | "practices";
}) {
  const library = useLibrary();
  const { tag } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isUntagged = location.pathname.endsWith("/untagged");
  const [params, setParams] = useSearchParams();
  const isAll = location.pathname.endsWith("/all");
  const base = `/${kind}`;
  const singular = kind === "drills" ? "drill" : "practice";
  const label = kind === "drills" ? "Drills" : "Practices";
  const items = (kind === "drills" ? library.drills : library.trainings).filter(
    (item) => item.ownership?.ownerTeamId === (library.teamId || null),
  );
  const occupied = tagFolders<{ tags: string[] }>(items);
  const folders = catalogCategories(library.categories).map(
    (option) =>
      occupied.find(
        (folder) =>
          tagKey(folder.label) === tagKey(option.name) && !folder.untagged,
      ) || { label: option.name, count: 0, untagged: false },
  );
  const untagged = occupied.find((folder) => folder.untagged);
  if (untagged) folders.push(untagged);
  const selectedCategories = tag ? [tag] : params.getAll("tag");
  const includeUncategorized = isUntagged || params.get("untagged") === "1";
  const folderLabel = isUntagged ? "Uncategorized" : tag;
  const search = params.get("search") || "";
  const filtered = items.filter(
    (item) =>
      ((!selectedCategories.length && !includeUncategorized) ||
        (includeUncategorized && item.tags.length === 0) ||
        item.tags.some((value) =>
          selectedCategories.some(
            (category) => tagKey(value) === tagKey(category),
          ),
        )) &&
      `${item.title} ${item.notes} ${item.tags.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const updateCategories = (categories: string[], uncategorized: boolean) => {
    const next = new URLSearchParams(params);
    next.delete("tag");
    next.delete("untagged");
    categories.forEach((category) => next.append("tag", category));
    if (uncategorized) next.set("untagged", "1");
    if (tag || isUntagged) {
      navigate(`${base}/all${next.size ? `?${next.toString()}` : ""}`);
    } else {
      setParams(next, { flushSync: true });
    }
  };
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Keep controlled typing in sync with the URL without queued route transitions.
    setParams(next, { replace: true, flushSync: true });
  };
  return (
    <main className="hub-page library-page">
      <div className="breadcrumb">
        <Link to="/">Home</Link>
        <ChevronRight size={14} />
        <Link to={base}>{label}</Link>
        {(isAll || tag || isUntagged) && (
          <>
            <ChevronRight size={14} />
            <span>{folderLabel || "Show all"}</span>
          </>
        )}
      </div>
      <div className="page-top">
        <div>
          <span className="eyebrow">YOUR LIBRARY</span>
          <h1>{folderLabel || label}</h1>
          <p>
            {tag || isUntagged || isAll
              ? `Browse and open your ${label.toLowerCase()}.`
              : `Browse ${label.toLowerCase()} by category.`}
          </p>
        </div>
        {library.canCreate && (
          <Link className="button primary" to={`${base}/new`}>
            + Create {singular}
          </Link>
        )}
      </div>
      {!tag && !isUntagged && !isAll ? (
        <div className="folder-grid">
          <Link className="folder-card" to={`${base}/all`}>
            <Folder size={24} />
            <strong>Show all</strong>
            <span>
              {items.length} {label.toLowerCase()}
            </span>
          </Link>
          {folders.map((folder) => (
            <Link
              className="folder-card"
              key={folder.untagged ? "untagged" : tagKey(folder.label)}
              to={
                folder.untagged
                  ? `${base}/untagged`
                  : `${base}/tags/${encodeURIComponent(folder.label)}`
              }
              aria-label={`Open ${folder.label} folder`}
            >
              <Folder size={24} />
              <strong>{folder.label}</strong>
              <span>
                {folder.count}{" "}
                {folder.count === 1 ? singular : label.toLowerCase()}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <>
          <div className="list-controls">
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label={`Search ${label.toLowerCase()}`}
                placeholder={`Search ${label.toLowerCase()}…`}
                value={search}
                onChange={(e) => change("search", e.target.value)}
              />
            </label>
            <CategoryFilter
              categories={library.categories}
              selectedCategories={selectedCategories}
              includeUncategorized={includeUncategorized}
              onChange={updateCategories}
            />
          </div>
          <div className="result-list">
            {library.loading ? (
              <p>Loading…</p>
            ) : filtered.length ? (
              filtered.map((item) => (
                <Link
                  className="result-card"
                  to={`${base}/${item.id}`}
                  key={item.id}
                >
                  <strong>{item.title}</strong>
                  <OwnershipBadge ownership={item.ownership} />
                  <span>
                    {item.tags.length ? item.tags.join(" · ") : "Uncategorized"}
                  </span>
                  <ChevronRight size={18} />
                </Link>
              ))
            ) : (
              <div className="empty-state">
                <h2>No {label.toLowerCase()} found</h2>
                <p>Try another search or create a {singular}.</p>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}

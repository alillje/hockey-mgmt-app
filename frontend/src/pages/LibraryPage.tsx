import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Search, Folder, ChevronRight } from "lucide-react";
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
  const items = kind === "drills" ? library.drills : library.trainings;
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
  const selectedTag =
    isUntagged || (isAll && params.get("untagged") === "1")
      ? "Uncategorized"
      : tag || params.get("tag") || "";
  const search = params.get("search") || "";
  const filtered = items.filter(
    (item) =>
      (!selectedTag ||
        (isUntagged || (isAll && params.get("untagged") === "1")
          ? item.tags.length === 0
          : item.tags.some((t) => tagKey(t) === tagKey(selectedTag)))) &&
      `${item.title} ${item.notes} ${item.tags.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
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
            <span>{tag || isUntagged ? selectedTag : "Show all"}</span>
          </>
        )}
      </div>
      <div className="page-top">
        <div>
          <span className="eyebrow">YOUR LIBRARY</span>
          <h1>{tag || isUntagged ? selectedTag : label}</h1>
          <p>
            {tag || isUntagged || isAll
              ? `Browse and open your ${label.toLowerCase()}.`
              : `Browse ${label.toLowerCase()} by tag.`}
          </p>
        </div>
        <Link className="button primary" to={`${base}/new`}>
          + Create {singular}
        </Link>
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
            <select
              aria-label="Filter by tag"
              value={
                isUntagged || (isAll && params.get("untagged") === "1")
                  ? "__untagged__"
                  : selectedTag
              }
              onChange={(e) => {
                const value = e.target.value;
                if (tag || isUntagged) {
                  const next = new URLSearchParams();
                  if (search) next.set("search", search);
                  if (value === "__untagged__") next.set("untagged", "1");
                  else if (value) next.set("tag", value);
                  navigate(
                    `${base}/all${next.size ? `?${next.toString()}` : ""}`,
                  );
                } else {
                  const next = new URLSearchParams(params);
                  next.delete("tag");
                  next.delete("untagged");
                  if (value === "__untagged__") next.set("untagged", "1");
                  else if (value) next.set("tag", value);
                  setParams(next);
                }
              }}
            >
              <option value="">All tags</option>
              {folders.map((folder) => (
                <option
                  key={folder.untagged ? "untagged" : tagKey(folder.label)}
                  value={folder.untagged ? "__untagged__" : folder.label}
                >
                  {folder.label}
                </option>
              ))}
            </select>
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

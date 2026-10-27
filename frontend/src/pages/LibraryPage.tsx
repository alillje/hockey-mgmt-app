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
import AgeGroupCheckboxes from "../components/AgeGroupCheckboxes";
import { useLibrary } from "../App";
import { catalogCategories, tagFolders, tagKey } from "../lib/tags";
import { contentAges } from "../lib/types";
import PagePlaceholder from "../components/PagePlaceholder";

export default function LibraryPage({
  kind,
}: {
  kind: "drills" | "practices";
}) {
  const library = useLibrary();
  const { tag } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  if (library.loading) return <PagePlaceholder />;
  if (library.error) return <main className="hub-page" />;
  const isUntagged = location.pathname.endsWith("/untagged");
  const isAll = location.pathname.endsWith("/all");
  const base = `/${kind}`;
  const singular = kind === "drills" ? "drill" : "practice";
  const label = kind === "drills" ? "Drills" : "Practices";
  const teams =
    library.organisation?.teams.filter((t) => t.canView !== false) || [];
  const sources =
    params.has("scope") || params.has("source")
      ? params.getAll("source")
      : [library.teamId || "club"];
  const selectedAges = params.getAll("age");
  const selectedCategories = tag ? [tag] : params.getAll("tag");
  const includeUncategorized = isUntagged || params.get("untagged") === "1";
  const folderLabel = isUntagged ? "Uncategorized" : tag;
  const search = params.get("search") || "";
  const items = (kind === "drills" ? library.drills : library.trainings).filter(
    (item) =>
      sources.includes(item.ownership?.ownerTeamId || "club") &&
      (!selectedAges.length ||
        contentAges(item).some((age) => selectedAges.includes(age))),
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
  function repeated(name: string, values: string[]) {
    const next = new URLSearchParams(params);
    next.delete(name);
    values.forEach((value) => next.append(name, value));
    if (name === "source") next.set("scope", "custom");
    setParams(next, { flushSync: true });
  }
  function updateCategories(categories: string[], uncategorized: boolean) {
    const next = new URLSearchParams(params);
    next.delete("tag");
    next.delete("untagged");
    categories.forEach((category) => next.append("tag", category));
    if (uncategorized) next.set("untagged", "1");
    if (tag || isUntagged)
      navigate(`${base}/all${next.size ? `?${next}` : ""}`);
    else setParams(next, { flushSync: true });
  }
  const filteredLink = (path: string) =>
    `${path}${params.size ? `?${params}` : ""}`;
  return (
    <main className="hub-page library-page">
      <div className="breadcrumb">
        <Link to="/">Home</Link>
        <ChevronRight size={14} />
        <Link to={filteredLink(base)}>{label}</Link>
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
          <p>Find {label.toLowerCase()} from your teams and club.</p>
        </div>
        {library.canCreate && (
          <Link className="button primary" to={`${base}/new`}>
            + Create {singular}
          </Link>
        )}
      </div>
      <fieldset className="tag-picker source-filter">
        <legend>Content from</legend>
        <div className="tag-options">
          {teams.map((team) => (
            <label className="tag-option" key={team.id}>
              <input
                type="checkbox"
                checked={sources.includes(team.id)}
                onChange={(e) =>
                  repeated(
                    "source",
                    e.target.checked
                      ? [...sources, team.id]
                      : sources.filter((s) => s !== team.id),
                  )
                }
              />
              {team.name} (team)
            </label>
          ))}
          {library.organisation && (
            <label className="tag-option">
              <input
                type="checkbox"
                checked={sources.includes("club")}
                onChange={(e) =>
                  repeated(
                    "source",
                    e.target.checked
                      ? [...sources, "club"]
                      : sources.filter((s) => s !== "club"),
                  )
                }
              />
              {library.organisation.name} (club)
            </label>
          )}
        </div>
      </fieldset>
      <details className="age-filter">
        <summary>
          Filter by age groups
          {selectedAges.length ? ` (${selectedAges.length})` : ""}
        </summary>
        <AgeGroupCheckboxes
          label="Age filters"
          value={selectedAges}
          ageGroups={library.ageGroups}
          onChange={(ages) => repeated("age", ages)}
        />
      </details>
      {!tag && !isUntagged && !isAll ? (
        <div className="folder-grid">
          <Link className="folder-card" to={filteredLink(`${base}/all`)}>
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
              to={filteredLink(
                folder.untagged
                  ? `${base}/untagged`
                  : `${base}/tags/${encodeURIComponent(folder.label)}`,
              )}
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
                onChange={(e) => {
                  const next = new URLSearchParams(params);
                  if (e.target.value) next.set("search", e.target.value);
                  else next.delete("search");
                  setParams(next, { replace: true, flushSync: true });
                }}
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
            {filtered.length ? (
              filtered.map((item) => (
                <article className="unified-result" key={item.id}>
                  <Link className="result-card" to={`${base}/${item.id}`}>
                    <strong>{item.title}</strong>
                    <OwnershipBadge ownership={item.ownership} />
                    <span>
                      {item.tags.length
                        ? item.tags.join(" · ")
                        : "Uncategorized"}
                    </span>
                    <span className="age-badges">
                      {contentAges(item).map((age) => (
                        <span className="age-badge" key={age}>
                          {age}
                        </span>
                      ))}
                    </span>
                    <ChevronRight size={18} />
                  </Link>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <h2>No {label.toLowerCase()} found</h2>
                <p>Try another search or select a team or club above.</p>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}

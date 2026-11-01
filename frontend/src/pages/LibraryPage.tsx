import { useEffect, useState } from "react";
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
import { catalogCategories, tagKey } from "../lib/tags";
import { contentAges } from "../lib/types";
import PagePlaceholder from "../components/PagePlaceholder";
import Pagination from "../components/Pagination";
import { useContentSearch, useDebouncedSearch } from "../lib/useContentSearch";

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
  const page = Math.min(
    1_000_000,
    Math.max(1, Number(params.get("page")) || 1),
  );
  const [revision, setRevision] = useState(0);
  const results = useContentSearch(
    kind,
    {
      page: Math.floor(page),
      pageSize: 20,
      sources,
      ages: selectedAges,
      tags: selectedCategories,
      uncategorized: includeUncategorized,
      search: useDebouncedSearch(search),
    },
    revision,
  );
  const filtered = results.data?.items || [];
  const folders =
    results.data?.categories ||
    catalogCategories(library.categories).map((option) => ({
      label: option.name,
      count: 0,
      untagged: false,
    }));
  useEffect(() => {
    if (!results.data || results.data.page === page) return;
    const next = new URLSearchParams(params);
    if (results.data.page === 1) next.delete("page");
    else next.set("page", String(results.data.page));
    setParams(next, { replace: true });
  }, [results.data, page, params, setParams]);
  function repeated(name: string, values: string[]) {
    const next = new URLSearchParams(params);
    next.delete("page");
    next.delete(name);
    values.forEach((value) => next.append(name, value));
    if (name === "source") next.set("scope", "custom");
    setParams(next, { flushSync: true });
  }
  function updateCategories(categories: string[], uncategorized: boolean) {
    const next = new URLSearchParams(params);
    next.delete("page");
    next.delete("tag");
    next.delete("untagged");
    categories.forEach((category) => next.append("tag", category));
    if (uncategorized) next.set("untagged", "1");
    if (tag || isUntagged)
      navigate(`${base}/all${next.size ? `?${next}` : ""}`);
    else setParams(next, { flushSync: true });
  }
  const filteredLink = (path: string) => {
    const next = new URLSearchParams(params);
    next.delete("page");
    return `${path}${next.size ? `?${next}` : ""}`;
  };
  if (library.loading) return <PagePlaceholder />;
  if (library.error) return <main className="hub-page" />;
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
      {results.error && (
        <p className="alert error" role="alert">
          {results.error}{" "}
          <button
            className="button secondary"
            onClick={() => setRevision((value) => value + 1)}
          >
            Try again
          </button>
        </p>
      )}
      {!tag && !isUntagged && !isAll ? (
        results.loading ? (
          <PagePlaceholder />
        ) : results.error ? null : (
          <div className="folder-grid">
            <Link className="folder-card" to={filteredLink(`${base}/all`)}>
              <Folder size={24} />
              <strong>Show all</strong>
              <span>
                {results.data?.sourceCount || 0} {label.toLowerCase()}
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
        )
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
                  next.delete("page");
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
            {results.loading ? (
              <PagePlaceholder />
            ) : results.error ? null : filtered.length ? (
              filtered.map((item) => (
                <article className="unified-result" key={item.id}>
                  <Link
                    className="result-card"
                    to={`${base}/${item.id}`}
                    state={{ from: location.pathname + location.search }}
                  >
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
          {results.data && (
            <Pagination
              label={label}
              page={results.data.page}
              pageSize={20}
              totalCount={results.data.totalCount}
              onChange={(nextPage) => {
                const next = new URLSearchParams(params);
                if (nextPage === 1) next.delete("page");
                else next.set("page", String(nextPage));
                setParams(next);
                window.scrollTo({ top: 0, behavior: "instant" });
              }}
            />
          )}
        </>
      )}
    </main>
  );
}

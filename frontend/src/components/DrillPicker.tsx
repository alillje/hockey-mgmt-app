import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useContentSearch, useDebouncedSearch } from "../lib/useContentSearch";
import Pagination from "./Pagination";

export default function DrillPicker({
  ownerTeamId,
  disabled,
  onAdd,
}: {
  ownerTeamId: string | null;
  disabled: boolean;
  onAdd: (id: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pick, setPick] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const lastRefresh = useRef(0);
  const results = useContentSearch(
    "drills",
    {
      sources: [ownerTeamId || "club"],
      search: useDebouncedSearch(search),
      page,
      pageSize: 20,
    },
    revision,
  );
  const items = results.data?.items || [];
  const refresh = () => {
    lastRefresh.current = Date.now();
    setRevision((value) => value + 1);
    setPick("");
  };
  const refreshOnOpen = () => {
    if (Date.now() - lastRefresh.current < 1000) return;
    lastRefresh.current = Date.now();
    setRevision((value) => value + 1);
  };
  return (
    <div className="saved-drill-action">
      <label htmlFor="saved-drill-search">Search saved drills</label>
      <input
        id="saved-drill-search"
        type="search"
        value={search}
        disabled={disabled || busy}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
          setPick("");
        }}
      />
      <label htmlFor="saved-drill-pick">Add a saved drill</label>
      <div>
        <select
          id="saved-drill-pick"
          value={pick}
          disabled={disabled || busy || (results.loading && !results.data)}
          onFocus={refreshOnOpen}
          onPointerDown={refreshOnOpen}
          onChange={(event) => setPick(event.target.value)}
        >
          <option value="">
            {results.loading
              ? "Loading saved drills…"
              : "Choose a saved drill…"}
          </option>
          {items.map((drill) => (
            <option key={drill.id} value={drill.id}>
              {drill.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="button secondary"
          disabled={
            disabled ||
            busy ||
            results.loading ||
            !items.some((drill) => drill.id === pick)
          }
          onClick={() => {
            if (pending.current) return;
            pending.current = true;
            setBusy(true);
            setError("");
            void onAdd(pick)
              .then(() => setPick(""))
              .catch((reason) =>
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Could not add drill.",
                ),
              )
              .finally(() => {
                pending.current = false;
                setBusy(false);
              });
          }}
        >
          <Plus size={16} /> Add selected drill
        </button>
      </div>
      {results.data && results.data.totalCount > 20 && (
        <Pagination
          label="Saved drills"
          page={results.data.page}
          pageSize={20}
          totalCount={results.data.totalCount}
          onChange={(next) => {
            setPage(next);
            setPick("");
          }}
        />
      )}
      <button
        type="button"
        className="button secondary"
        disabled={busy || results.loading}
        onClick={refresh}
      >
        Refresh drills
      </button>
      {results.error && <p role="alert">{results.error}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

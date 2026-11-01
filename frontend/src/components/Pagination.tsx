export default function Pagination({
  page,
  pageSize,
  totalCount,
  onChange,
  label = "Results",
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  onChange: (page: number) => void;
  label?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  return (
    <nav className="pagination" aria-label={`${label} pagination`}>
      <span>
        {totalCount
          ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} of ${totalCount}`
          : "0 results"}
      </span>
      <div className="inline">
        <button
          type="button"
          className="button secondary"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          className="button secondary"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}

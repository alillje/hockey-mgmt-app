export default function PagePlaceholder() {
  return (
    <main
      className="hub-page page-placeholder"
      aria-label="Loading workspace"
      aria-busy="true"
    >
      <div aria-hidden="true">
        <div className="placeholder-heading" />
        <div className="placeholder-line" />
        <div className="placeholder-panel" />
      </div>
      <span className="visually-hidden" role="status">
        Loading workspace
      </span>
    </main>
  );
}

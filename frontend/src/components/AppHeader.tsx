import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export default function AppHeader({
  children,
  standalone = false,
}: {
  children?: ReactNode;
  standalone?: boolean;
}) {
  const brand = (
    <>
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <strong>
        icework<span> / </span>
      </strong>
      <span className="brand-subtitle">COACH WORKSPACE</span>
    </>
  );

  return (
    <header className="app-header">
      {standalone ? (
        <a className="brand" href="/" aria-label="Icework home">
          {brand}
        </a>
      ) : (
        <Link className="brand" to="/" aria-label="Icework home">
          {brand}
        </Link>
      )}
      {children}
    </header>
  );
}

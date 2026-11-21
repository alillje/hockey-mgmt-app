import { useState } from "react";
import DiagramEditor from "../components/DiagramEditor";
import AppHeader from "../components/AppHeader";
import type { Diagram } from "../lib/types";

export default function TryItPage() {
  const [diagram, setDiagram] = useState<Diagram>({
    version: 1,
    objects: [],
    paths: [],
  });

  return (
    <div className="app-shell">
      <AppHeader standalone>
        <div className="header-right">
          <a className="button secondary" href="/">
            Sign in
          </a>
        </div>
      </AppHeader>
      <main className="main-content editor-page try-it-page">
        <h1>Draw a drill</h1>
        <p>Draw on the rink, then open Animation to add movement.</p>
        <p className="try-it-access">
          You need a registered account to save drills or export PDFs and GIFs.
          Contact an administrator for access.
        </p>
        <DiagramEditor diagram={diagram} onChange={setDiagram} />
      </main>
    </div>
  );
}

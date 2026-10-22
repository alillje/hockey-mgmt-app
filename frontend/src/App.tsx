import { createContext, useContext, useEffect, useState } from "react";
import {
  createBrowserRouter,
  Link,
  Outlet,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { api } from "./lib/api";
import { normalizeTags } from "./lib/tags";
import type { Category, Drill, Training } from "./lib/types";
import LibraryPage from "./pages/LibraryPage";
import EditorPage from "./pages/EditorPage";
export type Library = {
  drills: Drill[];
  trainings: Training[];
  categories: Category[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  saveDrill: (d: Drill) => void;
  saveTraining: (t: Training) => void;
  removeDrill: (id: string) => void;
  removeTraining: (id: string) => void;
};
const LibraryContext = createContext<Library | null>(null);
export function useLibrary() {
  const value = useContext(LibraryContext);
  if (!value) throw new Error("Library unavailable");
  return value;
}
function Shell() {
  const library = useLibrary();
  const location = useLocation();
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" to="/" aria-label="Icework home">
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <strong>
            icework<span> / </span>
          </strong>
          <span className="brand-subtitle">COACH WORKSPACE</span>
        </Link>
        <nav className="header-nav" aria-label="Main navigation">
          <Link className={location.pathname === "/" ? "active" : ""} to="/">
            Home
          </Link>
          <Link
            className={
              location.pathname.startsWith("/practices") ? "active" : ""
            }
            to="/practices"
          >
            Practices
          </Link>
          <Link
            className={location.pathname.startsWith("/drills") ? "active" : ""}
            to="/drills"
          >
            Drills
          </Link>
        </nav>
        <div className="header-right">
          <span className="local-badge">
            <span />
            LOCAL POC
          </span>
        </div>
      </header>
      {library.error && (
        <div className="global-error" role="alert">
          {library.error}{" "}
          <button onClick={() => void library.refresh()}>Retry</button>
        </div>
      )}
      <Outlet />
    </div>
  );
}
function Home() {
  return (
    <main className="hub-page">
      <div className="eyebrow">COACH WORKSPACE</div>
      <h1>Plan your next practice.</h1>
      <p>Build sessions, draw drills, and take your plan to the ice.</p>
      <div className="home-actions">
        <Link to="/practices/new">
          <span>Create Practice</span>
          <span>+</span>
        </Link>
        <Link to="/drills/new">
          <span>Create Drill</span>
          <span>+</span>
        </Link>
        <Link to="/practices">
          <span>Practices</span>
          <span>→</span>
        </Link>
        <Link to="/drills">
          <span>Drills</span>
          <span>→</span>
        </Link>
      </div>
    </main>
  );
}
const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: "drills", element: <LibraryPage kind="drills" /> },
      { path: "practices", element: <LibraryPage kind="practices" /> },
      { path: "drills/all", element: <LibraryPage kind="drills" /> },
      { path: "practices/all", element: <LibraryPage kind="practices" /> },
      { path: "drills/untagged", element: <LibraryPage kind="drills" /> },
      { path: "practices/untagged", element: <LibraryPage kind="practices" /> },
      { path: "drills/tags/:tag", element: <LibraryPage kind="drills" /> },
      {
        path: "practices/tags/:tag",
        element: <LibraryPage kind="practices" />,
      },
      { path: "drills/new", element: <EditorPage kind="drills" /> },
      { path: "practices/new", element: <EditorPage kind="practices" /> },
      { path: "drills/:id", element: <EditorPage kind="drills" /> },
      { path: "practices/:id", element: <EditorPage kind="practices" /> },
      {
        path: "*",
        element: (
          <main className="hub-page">
            <h1>Page not found</h1>
            <Link to="/">Go home</Link>
          </main>
        ),
      },
    ],
  },
]);
export default function App() {
  const [drills, setDrills] = useState<Drill[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [catalog, d, t] = await Promise.all([
        api.catalog(),
        api.drills(),
        api.trainings(),
      ]);
      setCategories(catalog.categories);
      setDrills(
        d.map((item) => ({
          ...item,
          tags: normalizeTags(item.tags, catalog.categories),
        })),
      );
      setTrainings(
        t.map((item) => ({
          ...item,
          tags: normalizeTags(item.tags, catalog.categories),
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load library.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const library = {
    drills,
    trainings,
    categories,
    loading,
    error,
    refresh,
    saveDrill: (d: Drill) =>
      setDrills((prev) => [d, ...prev.filter((item) => item.id !== d.id)]),
    saveTraining: (t: Training) =>
      setTrainings((prev) => [t, ...prev.filter((item) => item.id !== t.id)]),
    removeDrill: (id: string) =>
      setDrills((prev) => prev.filter((item) => item.id !== id)),
    removeTraining: (id: string) =>
      setTrainings((prev) => prev.filter((item) => item.id !== id)),
  };
  return (
    <LibraryContext.Provider value={library}>
      <RouterProvider router={router} />
    </LibraryContext.Provider>
  );
}

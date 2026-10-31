import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  createBrowserRouter,
  Link,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { UserRound } from "lucide-react";
import AccountPage from "./features/auth/AccountPage";
import { api, setWorkspaceSelection } from "./lib/api";
import { normalizeTags } from "./lib/tags";
import type {
  Category,
  AgeGroup,
  Drill,
  Training,
  Workspaces,
  Organisation,
  Team,
} from "./lib/types";
import LibraryPage from "./pages/LibraryPage";
import EditorPage from "./pages/EditorPage";
import ContentViewPage from "./pages/ContentViewPage";
import WorkspaceManager from "./features/workspace/WorkspaceManager";
import WorkspacePicker from "./features/workspace/WorkspacePicker";
import AuthGate, { useAuthAccount } from "./features/auth/AuthGate";
import PagePlaceholder from "./components/PagePlaceholder";
export type Library = {
  workspaces: Workspaces | null;
  organisation: Organisation | undefined;
  team: Team | undefined;
  teamId: string;
  defaultTeamId: string | null;
  setDefaultTeam: (teamId: string | null) => Promise<void>;
  canCreate: boolean;
  selectWorkspace: (organisationId: string, teamId: string) => void;
  refreshWorkspaces: () => Promise<void>;
  drills: Drill[];
  trainings: Training[];
  categories: Category[];
  ageGroups: AgeGroup[];
  loading: boolean;
  error: string;
  refresh: (background?: boolean) => Promise<void>;
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
  const account = useAuthAccount();
  const location = useLocation();
  const hasNoOrganisation =
    library.workspaces !== null &&
    library.workspaces.organisations.length === 0 &&
    !library.workspaces.isPlatformAdmin;
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
        {!hasNoOrganisation && (
          <nav className="header-nav" aria-label="Main navigation">
            <Link
              className={
                location.pathname.startsWith("/practices") ? "active" : ""
              }
              to="/practices"
            >
              Practices
            </Link>
            <Link
              className={
                location.pathname.startsWith("/drills") ? "active" : ""
              }
              to="/drills"
            >
              Drills
            </Link>
          </nav>
        )}
        <div className="header-right">
          <Link
            className={`account-link${location.pathname === "/account" ? " active" : ""}`}
            to="/account"
            aria-label="Account"
            title="Account"
            aria-current={location.pathname === "/account" ? "page" : undefined}
          >
            <UserRound size={18} aria-hidden="true" />
          </Link>
          {!account && (
            <span className="local-badge">
              <span />
              LOCAL POC
            </span>
          )}
        </div>
      </header>
      {library.error && (
        <div className="global-error" role="alert">
          {library.error}{" "}
          <button onClick={() => void library.refresh()}>Retry</button>
        </div>
      )}
      {library.workspaces !== null && !hasNoOrganisation && <WorkspacePicker />}
      {library.workspaces === null ? (
        library.error ? (
          <main className="hub-page" />
        ) : (
          <PagePlaceholder />
        )
      ) : hasNoOrganisation &&
        location.pathname !== "/account" &&
        location.pathname !== "/organisation" ? (
        <main className="hub-page">
          <h1>You haven’t been added to an organisation</h1>
          <p>
            Ask your organisation administrator to add you. You can check again
            once they have granted access.
          </p>
          <button
            className="button secondary"
            onClick={() => void library.refreshWorkspaces()}
          >
            Check access
          </button>
        </main>
      ) : (
        <Outlet />
      )}
    </div>
  );
}
function Home() {
  const library = useLibrary();
  if (library.loading) return <PagePlaceholder />;
  if (library.error) return <main className="hub-page" />;
  return (
    <main className="hub-page">
      <div className="eyebrow">COACH WORKSPACE</div>
      <h1>Drills and practice plans</h1>
      <p>Create rink diagrams and organize drills into practices.</p>
      {!library.organisation && library.workspaces?.isPlatformAdmin && (
        <Link className="button primary" to="/organisation">
          Create an organisation to get started
        </Link>
      )}
      <div className="home-actions">
        {library.canCreate && (
          <>
            <Link to="/practices/new">
              <span>Create Practice</span>
              <span>+</span>
            </Link>
            <Link to="/drills/new">
              <span>Create Drill</span>
              <span>+</span>
            </Link>
          </>
        )}
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
      { path: "account", element: <AccountPage /> },
      {
        path: "club-library",
        element: <Navigate to="/drills/all?source=club" replace />,
      },
      { path: "organisation", element: <WorkspaceManager /> },
      { path: "auth/callback", element: <Navigate to="/" replace /> },
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
      { path: "drills/:id", element: <ContentViewPage kind="drills" /> },
      { path: "practices/:id", element: <ContentViewPage kind="practices" /> },
      { path: "drills/:id/edit", element: <EditorPage kind="drills" /> },
      { path: "practices/:id/edit", element: <EditorPage kind="practices" /> },
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
function Workspace() {
  const [drills, setDrills] = useState<Drill[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ageGroups, setAgeGroups] = useState<AgeGroup[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspaces | null>(null);
  const [selection, setSelection] = useState<[string, string]>(["", ""]);
  const currentScope = useRef("");
  const initialized = useRef(false);
  const [defaultTeamId, setDefaultTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const organisation = workspaces?.organisations.find(
    (o) => o.id === selection[0],
  );
  const team = organisation?.teams.find((t) => t.id === selection[1]);
  async function refreshWorkspaces() {
    setError("");
    try {
      const data = await api.workspaces();
      const preferences = await api.accountPreferences();
      setDefaultTeamId(preferences.defaultTeamId);
      setWorkspaces(data);
      const stored = (localStorage.getItem("icework:workspace") || "").split(
        ":",
      );
      const preferredOrg =
        !initialized.current && preferences.defaultTeamId
          ? data.organisations.find((o) =>
              o.teams.some(
                (t) =>
                  t.id === preferences.defaultTeamId && t.canView !== false,
              ),
            )
          : undefined;
      const org =
        preferredOrg ||
        data.organisations.find((o) => o.id === stored[0]) ||
        data.organisations[0];
      const teamId = preferredOrg
        ? preferences.defaultTeamId!
        : org?.id === stored[0] &&
            org?.teams.some((t) => t.id === stored[1] && t.canView !== false)
          ? stored[1]
          : org?.teams.find(
              (t) => t.id === preferences.defaultTeamId && t.canView !== false,
            )?.id ||
            org?.teams.find((t) => t.canView !== false)?.id ||
            "";
      initialized.current = true;
      selectWorkspace(org?.id || "", teamId);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load organisations.",
      );
      setLoading(false);
    }
  }
  async function setDefaultTeam(teamId: string | null) {
    const preferences = await api.saveAccountPreferences(teamId);
    setDefaultTeamId(preferences.defaultTeamId);
    const org = workspaces?.organisations.find((o) =>
      o.teams.some((t) => t.id === preferences.defaultTeamId),
    );
    if (org && preferences.defaultTeamId)
      selectWorkspace(org.id, preferences.defaultTeamId);
  }
  function selectWorkspace(organisationId: string, teamId: string) {
    currentScope.current = `${organisationId}:${teamId}`;
    setWorkspaceSelection(organisationId, teamId);
    localStorage.setItem("icework:workspace", `${organisationId}:${teamId}`);
    setDrills([]);
    setTrainings([]);
    setLoading(true);
    setSelection([organisationId, teamId]);
  }
  async function refresh(background = false) {
    if (!workspaces) return refreshWorkspaces();
    const scope = currentScope.current;
    if (!background) setLoading(true);
    setError("");
    try {
      const [catalog, d, t] = await Promise.all([
        api.catalog(),
        api.drills(),
        api.trainings(),
      ]);
      if (scope !== currentScope.current) return;
      setCategories(catalog.categories);
      setAgeGroups(catalog.ageGroups);
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
      if (scope === currentScope.current)
        setError(e instanceof Error ? e.message : "Could not load library.");
    } finally {
      if (!background && scope === currentScope.current) setLoading(false);
    }
  }
  useEffect(() => {
    void refreshWorkspaces();
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    if (!selection[0]) {
      setLoading(false);
      return;
    }
    void Promise.all([api.catalog(), api.drills(), api.trainings()])
      .then(([catalog, d, t]) => {
        if (!active) return;
        setCategories(catalog.categories);
        setAgeGroups(catalog.ageGroups);
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
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Could not load library.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selection]);
  const library: Library = {
    workspaces,
    organisation,
    team,
    teamId: selection[1],
    defaultTeamId,
    setDefaultTeam,
    canCreate: team?.canEdit ?? !!organisation?.isAdmin,
    selectWorkspace,
    refreshWorkspaces,
    drills,
    trainings,
    categories,
    ageGroups,
    loading,
    error,
    refresh,
    saveDrill: (d) => {
      if (d.ownership?.organisationId === currentScope.current.split(":")[0])
        setDrills((prev) => [d, ...prev.filter((item) => item.id !== d.id)]);
    },
    saveTraining: (t) => {
      if (t.ownership?.organisationId === currentScope.current.split(":")[0])
        setTrainings((prev) => [t, ...prev.filter((item) => item.id !== t.id)]);
    },
    removeDrill: (id) =>
      setDrills((prev) => prev.filter((item) => item.id !== id)),
    removeTraining: (id) =>
      setTrainings((prev) => prev.filter((item) => item.id !== id)),
  };
  return (
    <LibraryContext.Provider value={library}>
      <RouterProvider key={selection.join(":")} router={router} />
    </LibraryContext.Provider>
  );
}

export default function App() {
  return (
    <AuthGate>
      <Workspace />
    </AuthGate>
  );
}

import { useEffect, useState } from "react";
import { useLibrary } from "../../App";
import { useAuthAccount } from "./AuthGate";

export default function AccountPage() {
  const account = useAuthAccount();
  const library = useLibrary();
  const [defaultTeam, setDefaultTeam] = useState(library.defaultTeamId || "");
  const [notice, setNotice] = useState("");
  useEffect(
    () => setDefaultTeam(library.defaultTeamId || ""),
    [library.defaultTeamId],
  );
  const teams =
    library.workspaces?.organisations.flatMap((org) =>
      org.teams
        .filter((t) => t.canView !== false)
        .map((t) => ({ ...t, organisationName: org.name })),
    ) || [];
  const [busy, setBusy] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [signOutError, setSignOutError] = useState("");

  async function signOut() {
    if (!account) return;
    setBusy(true);
    setSignOutError("");
    try {
      await account.signOut();
    } catch (reason) {
      setSignOutError(
        reason instanceof Error
          ? reason.message
          : "Could not log out. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="hub-page account-page">
      <span className="eyebrow">YOUR WORKSPACE</span>
      <h1>Your account</h1>
      <form
        className="details-card"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setTeamError("");
          void library
            .setDefaultTeam(defaultTeam || null)
            .then(() => setNotice("Default team saved."))
            .catch((e) =>
              setTeamError(
                e instanceof Error ? e.message : "Could not save default team.",
              ),
            )
            .finally(() => setBusy(false));
        }}
      >
        <h2>Default team</h2>
        <p>
          Your default team is selected when you open the app and is preselected
          in drill and practice searches.
        </p>
        {teams.length ? (
          <>
            <label>
              Default team
              <select
                value={defaultTeam}
                onChange={(e) => setDefaultTeam(e.target.value)}
                disabled={busy || teams.length === 1}
              >
                {teams.length > 1 && (
                  <option value="">Choose a default team</option>
                )}
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.organisationName} · {team.name}
                  </option>
                ))}
              </select>
            </label>
            {teams.length === 1 ? (
              <p>Your only team is automatically your default.</p>
            ) : (
              <button
                className="button primary"
                disabled={busy || defaultTeam === (library.defaultTeamId || "")}
              >
                Save default team
              </button>
            )}
          </>
        ) : (
          <p>Join or create a team to set your default.</p>
        )}
        {notice && <p role="status">{notice}</p>}
        {teamError && (
          <p className="alert error" role="alert">
            {teamError}
          </p>
        )}
      </form>
      <section className="details-card account-card">
        {account ? (
          <>
            <h2>Sign-in details</h2>
            <dl className="account-details">
              <dt>Email address</dt>
              <dd>{account.email}</dd>
            </dl>
            {signOutError && (
              <p className="alert error" role="alert">
                {signOutError}
              </p>
            )}
            <button
              className="button sign-out-button"
              disabled={busy}
              onClick={() => void signOut()}
            >
              {busy ? "Logging out…" : "Log out"}
            </button>
          </>
        ) : (
          <>
            <h2>Local workspace</h2>
            <p>You’re using the local workspace without signing in.</p>
          </>
        )}
      </section>
    </main>
  );
}

import { useEffect, useRef, useState } from "react";
import { useLibrary } from "../../App";
import { api } from "../../lib/api";
import MemberAccessCard from "./MemberAccessCard";
import MembershipOverview from "./MembershipOverview";

export default function WorkspaceManager() {
  const library = useLibrary();
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [teamId, setTeamId] = useState("");
  const [teamRole, setTeamRole] = useState("viewer");
  const [members, setMembers] = useState<
    Awaited<ReturnType<typeof api.members>>
  >([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pendingAction = useRef(false);
  const [busy, setBusy] = useState(false);
  const isPlatformAdmin = !!library.workspaces?.isPlatformAdmin;
  const memberGroups = new Map<string, typeof members>();
  for (const member of members)
    memberGroups.set(member.userId, [
      ...(memberGroups.get(member.userId) || []),
      member,
    ]);
  useEffect(() => {
    let active = true;
    setMembers([]);
    if (library.organisation?.isAdmin)
      void api
        .members()
        .then((result) => {
          if (active) setMembers(result);
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    return () => {
      active = false;
    };
  }, [library.organisation?.id, library.organisation?.isAdmin]);
  async function run(operation: () => Promise<void>) {
    if (pendingAction.current) return;
    pendingAction.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      pendingAction.current = false;
      setBusy(false);
    }
  }
  async function updateAccess(operation: () => Promise<void>, message: string) {
    await run(async () => {
      await operation();
      setMembers(await api.members());
      setNotice(message);
      await library.refreshWorkspaces();
    });
  }
  return (
    <main className="hub-page">
      <h1>Organisations</h1>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="alert success" role="status">
          {notice}
        </p>
      )}
      <MembershipOverview />
      {(isPlatformAdmin || library.organisation?.isAdmin) && (
        <h2 className="organisation-admin-heading">
          Organisation administration
        </h2>
      )}
      {isPlatformAdmin && (
        <form
          className="details-card"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const org = await api.createOrganisation(name);
              setName("");
              localStorage.setItem("icework:workspace", `${org.id}:`);
              await library.refreshWorkspaces();
            });
          }}
        >
          <h2>Create an organisation</h2>
          <label>
            Organisation name{" "}
            <input
              value={name}
              maxLength={120}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={busy}>
            Create organisation
          </button>
        </form>
      )}
      {library.organisation?.isAdmin && (
        <>
          <form
            className="details-card"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const created = await api.createTeam(team);
                setTeam("");
                localStorage.setItem(
                  "icework:workspace",
                  `${library.organisation!.id}:${created.id}`,
                );
                await library.refreshWorkspaces();
              });
            }}
          >
            <h2>Add a team to {library.organisation.name}</h2>
            <label>
              Team name{" "}
              <input
                value={team}
                maxLength={120}
                required
                onChange={(e) => setTeam(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={busy}>
              Create team
            </button>
          </form>
          <form
            className="details-card"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api.addMemberByEmail(
                  email.trim(),
                  isPlatformAdmin ? role : "member",
                  teamId || null,
                  teamRole,
                );
                setMembers(await api.members());
                setNotice(
                  `Access added for ${email.trim()}. Existing access is preserved.`,
                );
                setEmail("");
              });
            }}
          >
            <h2>Add member access</h2>
            <p>
              Enter the email address of an existing registered user. This adds
              access without creating an account or sending an invitation.
            </p>
            <label>
              Email address{" "}
              <input
                type="email"
                autoComplete="email"
                maxLength={254}
                value={email}
                required
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {isPlatformAdmin && (
              <label>
                Organisation role{" "}
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="member">Member</option>
                  <option value="admin">Organisation administrator</option>
                </select>
              </label>
            )}
            <label>
              Team{" "}
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <option value="">Organisation only</option>
                {library.organisation.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {teamId && (
              <label>
                Team role{" "}
                <select
                  value={teamRole}
                  onChange={(e) => setTeamRole(e.target.value)}
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
              </label>
            )}
            <button className="button primary" disabled={busy}>
              Add access
            </button>
            <p className="muted">
              Editors manage their team’s content and can contribute independent
              club copies. Viewers can read their team’s content. Organisation
              administrators manage club content and memberships.
            </p>
          </form>
          <section className="details-card member-list">
            <h2>Members</h2>
            {[...memberGroups.entries()].map(([id, entries]) => (
              <MemberAccessCard
                key={id}
                entries={entries}
                teams={library.organisation!.teams}
                isPlatformAdmin={isPlatformAdmin}
                disabled={busy}
                onAction={updateAccess}
              />
            ))}
          </section>
        </>
      )}
      {library.organisation && !library.organisation.isAdmin && (
        <p>
          Contact your organisation administrator to manage teams and member
          access.
        </p>
      )}
    </main>
  );
}

import { useEffect, useState } from "react";
import { useLibrary } from "../../App";
import AgeGroupPicker from "../../components/AgeGroupPicker";
import { api } from "../../lib/api";

export default function WorkspaceManager() {
  const library = useLibrary();
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [age, setAge] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("member");
  const [teamId, setTeamId] = useState("");
  const [teamRole, setTeamRole] = useState("viewer");
  const [members, setMembers] = useState<
    Awaited<ReturnType<typeof api.members>>
  >([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (library.organisation?.isAdmin)
      void api
        .members()
        .then(setMembers)
        .catch((e) => setError(String(e)));
  }, [library.organisation?.id]);
  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
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
      <p>
        Your user ID: <code>{library.workspaces?.userId}</code>
      </p>
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
      {library.organisation?.isAdmin && (
        <>
          <form
            className="details-card"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const created = await api.createTeam(team, age);
                setTeam("");
                setAge("");
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
            <AgeGroupPicker
              value={age}
              ageGroups={library.ageGroups}
              disabled={busy}
              emptyLabel="Not specified"
              onChange={setAge}
            />
            <button className="button primary" disabled={busy}>
              Create team
            </button>
          </form>
          <form
            className="details-card"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api.addMember(userId, role, teamId || null, teamRole);
                setMembers(await api.members());
                setNotice("Membership added. Existing access is preserved.");
              });
            }}
          >
            <h2>Add member access</h2>
            <p>
              Add a user already invited to this Supabase project. Copy their
              user ID from Authentication → Users.
            </p>
            <label>
              User ID{" "}
              <input
                value={userId}
                required
                onChange={(e) => setUserId(e.target.value)}
              />
            </label>
            <label>
              Organisation role{" "}
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="member">Member</option>
                <option value="admin">Organisation administrator</option>
              </select>
            </label>
            <label>
              Team{" "}
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <option value="">Club library only</option>
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
          <section className="details-card">
            <h2>Members</h2>
            {members.map((m, index) => (
              <p key={index}>
                <code>{m.userId}</code> · {m.role}
                {m.teamId &&
                  ` · ${library.organisation?.teams.find((t) => t.id === m.teamId)?.name} (${m.teamRole})`}
              </p>
            ))}
          </section>
        </>
      )}
    </main>
  );
}

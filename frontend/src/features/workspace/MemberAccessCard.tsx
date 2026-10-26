import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Team } from "../../lib/types";

type Member = Awaited<ReturnType<typeof api.members>>[number];

export default function MemberAccessCard({
  entries,
  teams,
  isPlatformAdmin,
  disabled,
  onAction,
}: {
  entries: Member[];
  teams: Team[];
  isPlatformAdmin: boolean;
  disabled: boolean;
  onAction: (operation: () => Promise<void>, message: string) => Promise<void>;
}) {
  const member = entries[0];
  const [role, setRole] = useState(member.role);
  const [teamRoles, setTeamRoles] = useState<Record<string, string>>({});
  useEffect(() => {
    setRole(member.role);
    setTeamRoles(
      Object.fromEntries(
        entries
          .filter((entry) => entry.teamId)
          .map((entry) => [entry.teamId!, entry.teamRole!]),
      ),
    );
  }, [entries, member.role]);
  const protectedMember = member.role === "admin" && !isPlatformAdmin;

  return (
    <article className="member-card" aria-label={`Member ${member.userId}`}>
      <div className="member-heading">
        <code>{member.userId}</code>
        <strong>
          {member.role === "admin" ? "Organisation administrator" : "Member"}
        </strong>
      </div>
      {member.role === "admin" && (
        <p>Can manage all teams and content in this organisation.</p>
      )}
      {protectedMember ? (
        <p className="muted">
          Only the platform administrator can change this administrator’s
          access.
        </p>
      ) : (
        <>
          {isPlatformAdmin && (
            <div className="member-team-row">
              <label>
                Organisation role
                <select
                  value={role}
                  disabled={disabled}
                  onChange={(event) => setRole(event.target.value)}
                >
                  <option value="member">Member</option>
                  <option value="admin">Organisation administrator</option>
                </select>
              </label>
              <button
                className="button secondary"
                disabled={disabled || role === member.role}
                onClick={() =>
                  void onAction(
                    () => api.updateMemberRole(member.userId, role),
                    "Organisation role updated.",
                  )
                }
              >
                Save organisation role
              </button>
            </div>
          )}
          {entries
            .filter((entry) => entry.teamId)
            .map((entry) => (
              <div className="member-team-row" key={entry.teamId}>
                <label>
                  {teams.find((team) => team.id === entry.teamId)?.name ||
                    "Team"}
                  <select
                    aria-label={`Role in ${teams.find((team) => team.id === entry.teamId)?.name || "team"}`}
                    value={teamRoles[entry.teamId!] || entry.teamRole!}
                    disabled={disabled}
                    onChange={(event) =>
                      setTeamRoles({
                        ...teamRoles,
                        [entry.teamId!]: event.target.value,
                      })
                    }
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                </label>
                <button
                  className="button secondary"
                  disabled={
                    disabled ||
                    !teamRoles[entry.teamId!] ||
                    teamRoles[entry.teamId!] === entry.teamRole
                  }
                  onClick={() =>
                    void onAction(
                      () =>
                        api.updateTeamMemberRole(
                          entry.teamId!,
                          member.userId,
                          teamRoles[entry.teamId!],
                        ),
                      "Team role updated.",
                    )
                  }
                >
                  Save team role
                </button>
                <button
                  className="button secondary member-remove-button"
                  disabled={disabled}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Remove this member from this team? Their saved drills and practices will stay.",
                      )
                    )
                      void onAction(
                        () =>
                          api.removeTeamMember(entry.teamId!, member.userId),
                        "Team access removed.",
                      );
                  }}
                >
                  Remove from team
                </button>
              </div>
            ))}
          {member.role !== "admin" &&
            entries.every((entry) => !entry.teamId) && (
              <p>
                No team access. This member can browse organisation content.
              </p>
            )}
          <button
            className="button secondary member-remove-button member-remove-organisation-button"
            disabled={disabled}
            onClick={() => {
              if (
                window.confirm(
                  "Remove this member from the organisation and all its teams? Saved drills and practices will stay.",
                )
              )
                void onAction(
                  () => api.removeMember(member.userId),
                  "Organisation access removed.",
                );
            }}
          >
            Remove user from organisation
          </button>
        </>
      )}
    </article>
  );
}

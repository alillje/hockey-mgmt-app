import { useRef, useState } from "react";
import { useLibrary } from "../../App";
import { api, type TeamDirectory } from "../../lib/api";

function TeamMembers({
  organisationId,
  teamId,
}: {
  organisationId: string;
  teamId: string;
}) {
  const [directory, setDirectory] = useState<TeamDirectory | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  return (
    <div className="team-directory">
      <button
        className="button secondary"
        disabled={busy}
        aria-expanded={!!directory}
        onClick={() => {
          if (directory) {
            setDirectory(null);
            return;
          }
          if (pending.current) return;
          pending.current = true;
          setBusy(true);
          setError("");
          void api
            .teamMembers(organisationId, teamId)
            .then(setDirectory)
            .catch((reason) =>
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Could not load team members.",
              ),
            )
            .finally(() => {
              pending.current = false;
              setBusy(false);
            });
        }}
      >
        {directory
          ? "Hide members"
          : busy
            ? "Loading members…"
            : "View members"}
      </button>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {directory && (
        <div>
          <h4>Team members</h4>
          {directory.members.length ? (
            <ul>
              {directory.members.map((member) => (
                <li key={member.userId}>
                  {[member.firstName, member.lastName]
                    .filter(Boolean)
                    .join(" ") || "Profile not completed"}{" "}
                  · {member.role === "editor" ? "Editor" : "Viewer"}
                </li>
              ))}
            </ul>
          ) : (
            <p>No team members yet.</p>
          )}
          {!!directory.administrators.length && (
            <>
              <h4>Organisation administrators</h4>
              <ul>
                {directory.administrators.map((member) => (
                  <li key={member.userId}>
                    {[member.firstName, member.lastName]
                      .filter(Boolean)
                      .join(" ") || "Profile not completed"}{" "}
                    · Organisation administrator
                  </li>
                ))}
              </ul>
              <p className="muted">
                Organisation administrators can manage this team without being
                team members.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function MembershipOverview() {
  const library = useLibrary();
  return (
    <section className="membership-overview" aria-label="Your memberships">
      <h2>Your organisations and teams</h2>
      <ul className="membership-list">
        {library.workspaces?.organisations.map((org) => (
          <li className="details-card membership-organisation" key={org.id}>
            <h3>{org.name}</h3>
            <p>
              {org.role === "admin"
                ? "Organisation administrator"
                : org.role === "member"
                  ? "Organisation member"
                  : "Platform administrator access"}
            </p>
            {org.teams.length ? (
              <ul className="membership-teams">
                {org.teams.map((team) => (
                  <li className="membership-team" key={team.id}>
                    <h4>{team.name}</h4>
                    <p>
                      Your team role:{" "}
                      {team.role === "editor"
                        ? "Editor"
                        : team.role === "viewer"
                          ? "Viewer"
                          : "Administrator access (no team membership)"}
                    </p>
                    <TeamMembers organisationId={org.id} teamId={team.id} />
                  </li>
                ))}
              </ul>
            ) : (
              <p>You do not belong to any teams in this organisation.</p>
            )}
          </li>
        ))}
      </ul>
      {!library.workspaces?.organisations.length && (
        <p>You do not belong to any organisations yet.</p>
      )}
    </section>
  );
}

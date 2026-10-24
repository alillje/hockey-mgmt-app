import { Link, useNavigate } from "react-router-dom";
import { useLibrary } from "../../App";
import { appendKey, parentKey } from "../../lib/drafts";

export default function WorkspacePicker() {
  const library = useLibrary();
  const navigate = useNavigate();
  function choose(organisationId: string, teamId: string) {
    const hasDraft = Object.keys(sessionStorage).some((k) =>
      k.startsWith(
        `icework:draft:${localStorage.getItem("icework:workspace")}:`,
      ),
    );
    if (
      hasDraft &&
      !window.confirm(
        "Change workspace? Your drafts stay in their current workspace.",
      )
    )
      return;
    sessionStorage.removeItem(appendKey);
    sessionStorage.removeItem(parentKey);
    window.dispatchEvent(new Event("icework:workspace-changing"));
    navigate("/");
    library.selectWorkspace(organisationId, teamId);
  }
  return (
    <section className="workspace-selector" aria-label="Current workspace">
      <label>
        Organisation
        <select
          aria-label="Organisation"
          value={library.organisation?.id || ""}
          onChange={(e) => {
            const org = library.workspaces?.organisations.find(
              (o) => o.id === e.target.value,
            );
            if (org) choose(org.id, org.teams[0]?.id || "");
          }}
        >
          {!library.organisation && (
            <option value="">Choose an organisation</option>
          )}
          {library.workspaces?.organisations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Team
        <select
          aria-label="Team"
          value={library.teamId}
          onChange={(e) => choose(library.organisation!.id, e.target.value)}
          disabled={!library.organisation}
        >
          <option value="">
            {library.organisation?.isAdmin
              ? "Available to all teams"
              : "Club library only"}
          </option>
          {library.organisation?.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.ageGroup ? ` · ${t.ageGroup}` : ""}
            </option>
          ))}
        </select>
      </label>
      <Link to="/organisation">
        {library.organisation?.isAdmin
          ? "Manage organisation"
          : "Organisations"}
      </Link>
    </section>
  );
}

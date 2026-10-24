import type { Ownership } from "../../lib/types";
export default function OwnershipBadge({
  ownership,
}: {
  ownership?: Ownership;
}) {
  if (!ownership) return null;
  return (
    <span className="ownership-badge">
      {ownership.ownerName} ·{" "}
      {ownership.ownerTeamId === null
        ? "Organisation-owned"
        : ownership.visibility === "organisation"
          ? "Shared with club"
          : "Team only"}
      {!ownership.canEdit && " · View only"}
    </span>
  );
}

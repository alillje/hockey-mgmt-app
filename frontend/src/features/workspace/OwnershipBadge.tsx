import type { Ownership } from "../../lib/types";
export default function OwnershipBadge({
  ownership,
}: {
  ownership?: Ownership;
}) {
  if (!ownership) return null;
  return (
    <span className="ownership-badge">
      {ownership.ownerTeamId === null
        ? `Club: ${ownership.ownerName}`
        : `Team: ${ownership.ownerName}`}
      {!ownership.canEdit && " · View only"}
    </span>
  );
}

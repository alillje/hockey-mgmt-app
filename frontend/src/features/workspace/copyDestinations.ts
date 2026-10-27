import type { CopyDestination, Ownership, Workspaces } from "../../lib/types";

type DestinationOption = CopyDestination & { value: string; label: string };

export function copyDestinations(
  ownership: Ownership | undefined,
  workspaces: Workspaces | null,
): DestinationOption[] {
  const organisation = workspaces?.organisations.find(
    (item) => item.id === ownership?.organisationId,
  );
  if (!organisation || !ownership) return [];
  const destinations: DestinationOption[] = organisation.teams
    .filter((team) => team.canEdit)
    .map((team) => ({
      value: team.id,
      label: `Team: ${team.name}`,
      organisationId: organisation.id,
      teamId: team.id,
    }));
  if (organisation.isAdmin || (ownership.ownerTeamId && ownership.canEdit))
    destinations.push({
      value: "club",
      label: `Club: ${organisation.name}`,
      organisationId: organisation.id,
      teamId: null,
    });
  return destinations;
}

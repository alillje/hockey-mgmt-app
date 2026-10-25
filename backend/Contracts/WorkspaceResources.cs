namespace HockeyTrainer.Api.Contracts;

public sealed record TeamResponse(Guid Id, string Name, string AgeGroup, bool CanEdit, bool CanView = true);
public sealed record OrganisationResponse(Guid Id, string Name, bool IsAdmin, List<TeamResponse> Teams);
public sealed record WorkspaceResponse(Guid UserId, List<OrganisationResponse> Organisations);
public sealed record OrganisationRequest(string Name);
public sealed record TeamRequest(string Name, string AgeGroup = "");
public sealed record MemberRequest(Guid UserId, string Role, Guid? TeamId = null, string TeamRole = "viewer");
public sealed record MemberResponse(Guid UserId, string Role, Guid? TeamId, string? TeamRole);
public sealed record OwnershipResponse(Guid OrganisationId, Guid? OwnerTeamId, string OwnerName,
    Guid? OriginTeamId, string? OriginTeamName, bool CanEdit, bool CanCopyToTeam, bool CanCopyToLibrary);

public sealed record AccountPreferencesRequest(Guid? DefaultTeamId);
public sealed record AccountPreferencesResponse(Guid? DefaultTeamId);

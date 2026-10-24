namespace HockeyTrainer.Api.Contracts;

public sealed record TeamResponse(Guid Id, string Name, string AgeGroup, bool CanEdit);
public sealed record OrganisationResponse(Guid Id, string Name, bool IsAdmin, List<TeamResponse> Teams);
public sealed record WorkspaceResponse(Guid UserId, List<OrganisationResponse> Organisations);
public sealed record OrganisationRequest(string Name);
public sealed record TeamRequest(string Name, string AgeGroup = "");
public sealed record MemberRequest(Guid UserId, string Role, Guid? TeamId = null, string TeamRole = "viewer");
public sealed record MemberResponse(Guid UserId, string Role, Guid? TeamId, string? TeamRole);
public sealed record OwnershipResponse(Guid OrganisationId, Guid? OwnerTeamId, string OwnerName,
    Guid? OriginTeamId, string? OriginTeamName, string Visibility, bool CanEdit, bool CanCopy);
public sealed record ConfirmedDrill(Guid Id, DateTimeOffset UpdatedAt);
public sealed record VisibilityRequest(string Visibility, DateTimeOffset ExpectedUpdatedAt, List<ConfirmedDrill>? ConfirmedDrills = null);
public sealed record SharingDrill(Guid Id, string Title, DateTimeOffset UpdatedAt, bool CanShare);
public sealed record SharingPreview(DateTimeOffset UpdatedAt, List<SharingDrill> Drills, bool CanShare);
public sealed record CopyRequest(DateTimeOffset? ExpectedUpdatedAt = null);

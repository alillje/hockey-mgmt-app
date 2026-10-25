namespace HockeyTrainer.Api.Models;

public static class WorkspaceDefaults
{
    public static readonly Guid OrganisationId = Guid.Parse("00000000-0000-0000-0000-000000000001");
    public static readonly Guid TeamId = Guid.Parse("00000000-0000-0000-0000-000000000002");
    public static readonly Guid LocalUserId = Guid.Parse("00000000-0000-0000-0000-000000000003");
}

public interface IOwnedContent
{
    Guid OrganisationId { get; set; }
    Guid? OwnerTeamId { get; set; }
    Guid? OriginTeamId { get; set; }
    Guid CreatedByUserId { get; set; }
    string AgeGroup { get; set; }
    string AgeGroupsJson { get; set; }
}

public sealed class Organisation
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
}

public sealed class Team
{
    public Guid Id { get; set; }
    public Guid OrganisationId { get; set; }
    public string Name { get; set; } = "";
    public string AgeGroup { get; set; } = "";
}

public sealed class OrganisationMember
{
    public Guid OrganisationId { get; set; }
    public Guid UserId { get; set; }
    public string Role { get; set; } = "member";
}

public sealed class TeamMember
{
    public Guid TeamId { get; set; }
    public Guid UserId { get; set; }
    public string Role { get; set; } = "viewer";
}

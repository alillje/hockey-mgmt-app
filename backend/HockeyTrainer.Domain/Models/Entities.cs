namespace HockeyTrainer.Domain.Models;

public sealed class Drill : IOwnedContent
{
    public Guid Id { get; set; }
    public Guid OrganisationId { get; set; } = WorkspaceDefaults.OrganisationId;
    public Guid? OwnerTeamId { get; set; } = WorkspaceDefaults.TeamId;
    public Guid? OriginTeamId { get; set; } = WorkspaceDefaults.TeamId;
    public Guid CreatedByUserId { get; set; } = WorkspaceDefaults.LocalUserId;
    public string AgeGroup { get; set; } = "";
    public string AgeGroupsJson { get; set; } = "[]";
    public string Title { get; set; } = "";
    public string CategoryId { get; set; } = "";
    public string Notes { get; set; } = "";
    public string TagsJson { get; set; } = "[]";
    public string DiagramJson { get; set; } = "";

    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class Training : IOwnedContent
{
    public Guid Id { get; set; }
    public Guid OrganisationId { get; set; } = WorkspaceDefaults.OrganisationId;
    public Guid? OwnerTeamId { get; set; } = WorkspaceDefaults.TeamId;
    public Guid? OriginTeamId { get; set; } = WorkspaceDefaults.TeamId;
    public Guid CreatedByUserId { get; set; } = WorkspaceDefaults.LocalUserId;
    public string AgeGroup { get; set; } = "";
    public string AgeGroupsJson { get; set; } = "[]";
    public string Title { get; set; } = "";
    public string Notes { get; set; } = "";
    public string TagsJson { get; set; } = "[]";

    public DateTimeOffset UpdatedAt { get; set; }
    public List<TrainingEntry> Items { get; set; } = [];
}

public sealed class TrainingEntry
{
    public int Id { get; set; }
    public Guid TrainingId { get; set; }
    public Guid DrillId { get; set; }
    public Drill Drill { get; set; } = null!;
    public int Position { get; set; }
    public int DurationMinutes { get; set; }
    public string Notes { get; set; } = "";
}

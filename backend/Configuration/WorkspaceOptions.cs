namespace HockeyTrainer.Api.Configuration;

public sealed class WorkspaceOptions
{
    public const string SectionName = "Workspace";

    public string? LegacyAdminUserId { get; set; }
}

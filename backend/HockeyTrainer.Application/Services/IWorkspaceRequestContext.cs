namespace HockeyTrainer.Application.Services;

public interface IWorkspaceRequestContext
{
    Guid? UserId { get; }
    string? OrganisationId { get; }
    string? TeamId { get; }
}

namespace HockeyTrainer.Application.Services;

public interface IWorkspaceRequestContext
{
    Guid? UserId { get; }
    string? Email => null;
    string? OrganisationId { get; }
    string? TeamId { get; }
}

using HockeyTrainer.Application.Contracts;
using HockeyTrainer.Application.Repositories;
using HockeyTrainer.Domain.Models;

namespace HockeyTrainer.Application.Services;

public sealed class UserProfileService(IUserProfileRepository repository, WorkspaceService workspaceService,
    IWorkspaceRequestContext requestContext)
{
    public async Task<UserProfileResponse> GetAsync(CancellationToken ct)
    {
        var profile = await repository.FindAsync(workspaceService.UserId, ct);

        return new(profile?.FirstName ?? string.Empty, profile?.LastName ?? string.Empty,
            requestContext.Email, !string.IsNullOrWhiteSpace(profile?.FirstName) && !string.IsNullOrWhiteSpace(profile?.LastName));
    }

    public async Task<UserProfileResponse> SaveAsync(UserProfileRequest request, CancellationToken ct)
    {
        var profile = new UserProfile
        {
            UserId = workspaceService.UserId,
            FirstName = ValidateName(request.FirstName, "First name"),
            LastName = ValidateName(request.LastName, "Last name"),
            Email = requestContext.Email ?? string.Empty
        };
        await repository.SaveAsync(profile, ct);

        return await GetAsync(ct);
    }

    private static string ValidateName(string? value, string label)
    {
        var name = value?.Trim() ?? string.Empty;
        if (name.Length is < 1 or > 100 || name.Any(char.IsControl))
        {
            throw new ApiException(400, "Invalid name", $"{label} is required and must contain 1 to 100 characters.");
        }

        return name;
    }
}

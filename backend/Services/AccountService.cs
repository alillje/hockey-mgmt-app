using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Repositories;

namespace HockeyTrainer.Api.Services;

public sealed class AccountService(AccountRepository repository, WorkspaceService workspace)
{
    public async Task<AccountPreferencesResponse> GetAsync(CancellationToken ct)
    {
        var available = await workspace.GetAsync(ct);
        var teams = available.Organisations.SelectMany(o => o.Teams).Where(t => t.CanView).ToList();
        var saved = await repository.GetAsync(available.UserId, ct);
        var defaultId = teams.Any(t => t.Id == saved?.DefaultTeamId) ? saved!.DefaultTeamId
            : teams.Count == 1 ? teams[0].Id : (Guid?)null;

        return new(defaultId);
    }

    public async Task<AccountPreferencesResponse> SaveAsync(AccountPreferencesRequest request, CancellationToken ct)
    {
        var available = await workspace.GetAsync(ct);
        if (request.DefaultTeamId is Guid id && !available.Organisations.SelectMany(o => o.Teams).Any(t => t.Id == id && t.CanView))
        {
            throw new ApiException(403, "Team access required", "Choose a default team you belong to.");
        }

        await repository.SaveAsync(available.UserId, request.DefaultTeamId, ct);

        return await GetAsync(ct);
    }
}

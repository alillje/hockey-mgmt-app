using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Repositories;

namespace HockeyTrainer.Api.Services;

public sealed class CatalogService(CatalogRepository repository)
{
    public async Task<CatalogResponse> GetAsync(CancellationToken cancellationToken) => new(Catalog.Categories,
        (await repository.GetAgeGroupsAsync(cancellationToken))
            .Select(group => new AgeGroupResponse(group.Id, group.Name, group.SortOrder)).ToList());

    public async Task<string> ResolveAgeGroupAsync(string? requested, string? existing, string? inherited,
        CancellationToken cancellationToken)
    {
        if (requested is null && existing is not null) return existing;
        var value = (requested ?? inherited ?? "").Trim();
        if (value.Length == 0) return "";
        if (value.Length > 40) throw InvalidAgeGroup();
        var groups = await repository.GetAgeGroupsAsync(cancellationToken);
        var group = groups.FirstOrDefault(group => group.Id.Equals(value, StringComparison.OrdinalIgnoreCase) ||
            group.Name.Equals(value, StringComparison.OrdinalIgnoreCase));
        if (group is not null) return group.Id;
        // Old free-text metadata stays readable/editable in place, but cannot be newly assigned.
        if (requested is not null && existing is not null && value == existing) return existing;
        if (requested is null) return "";
        throw InvalidAgeGroup();
    }

    private static ApiException InvalidAgeGroup() => new(400, "Invalid age group", "Choose an age group from the fixed hockey levels.");
}

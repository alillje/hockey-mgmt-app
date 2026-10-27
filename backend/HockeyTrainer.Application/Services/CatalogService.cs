using HockeyTrainer.Application.Contracts;
using HockeyTrainer.Application.Repositories;

namespace HockeyTrainer.Application.Services;

public sealed class CatalogService(ICatalogRepository repository)
{
    public async Task<CatalogResponse> GetAsync(CancellationToken cancellationToken) => new(Catalog.Categories,
        (await repository.GetAgeGroupsAsync(cancellationToken))
            .Select(group => new AgeGroupResponse(group.Id, group.Name, group.SortOrder)).ToList());

    private async Task<string> ResolveAgeGroupAsync(string? requested, string? existing,
        CancellationToken cancellationToken)
    {
        if (requested is null && existing is not null)
        {
            return existing;
        }

        var value = (requested ?? "").Trim();
        if (value.Length == 0)
        {
            return string.Empty;
        }

        if (value.Length > 40)
        {
            throw InvalidAgeGroup();
        }

        var groups = await repository.GetAgeGroupsAsync(cancellationToken);
        var group = groups.FirstOrDefault(group => group.Id.Equals(value, StringComparison.OrdinalIgnoreCase) ||
            group.Name.Equals(value, StringComparison.OrdinalIgnoreCase));
        if (group is not null)
        {
            return group.Id;
        }
        // Old free-text metadata stays readable/editable in place, but cannot be newly assigned.
        if (requested is not null && existing is not null && value == existing)
        {
            return existing;
        }

        if (requested is null)
        {
            return string.Empty;
        }

        throw InvalidAgeGroup();
    }

    public async Task<List<string>> ResolveContentAgesAsync(List<string>? requested, string? legacyRequested,
        string existingJson, string existingLegacy, bool isUpdate, CancellationToken ct)
    {
        var existing = TagRules.Read(existingJson);
        if (existing.Count == 0 && existingLegacy.Length > 0)
        {
            existing = [existingLegacy];
        }

        if (requested is null)
        {
            if (legacyRequested is null && isUpdate)
            {
                return existing;
            }

            var single = await ResolveAgeGroupAsync(legacyRequested, isUpdate ? existingLegacy : null, ct);

            return single.Length == 0 ? [] : [single];
        }
        var catalog = await repository.GetAgeGroupsAsync(ct);
        if (requested.Count > catalog.Count + existing.Count)
        {
            throw InvalidAgeGroup();
        }

        var selected = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<string>();
        foreach (var age in requested)
        {
            var value = (age ?? "").Trim();
            var canonical = catalog.FirstOrDefault(g => g.Id.Equals(value, StringComparison.OrdinalIgnoreCase))?.Id;
            if (canonical is null && isUpdate && existing.Contains(value))
            {
                canonical = value;
            }

            if (canonical is null)
            {
                throw InvalidAgeGroup();
            }

            if (selected.Add(canonical))
            {
                result.Add(canonical);
            }
        }

        return result.OrderBy(age => catalog.FirstOrDefault(g => g.Id == age)?.SortOrder ?? int.MaxValue).ToList();
    }

    private static ApiException InvalidAgeGroup() => new(400, "Invalid age group", "Choose an age group from the fixed hockey levels.");
}

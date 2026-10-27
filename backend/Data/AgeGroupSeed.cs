using HockeyTrainer.Api.Models;

namespace HockeyTrainer.Api.Data;

// Reference data only. The API and validation read the database, not this seed list.
internal static class AgeGroupSeed
{
    public static IReadOnlyList<AgeGroup> Items { get; } =
        Enumerable.Range(8, 9).Concat([18, 19, 20])
            .Select(age => new AgeGroup
            {
                Id = $"U{age}",
                Name = $"U{age}",
                SortOrder = age
            })
            .Append(new AgeGroup
            {
                Id = "Senior",
                Name = "Senior",
                SortOrder = 100
            }).ToList();
}

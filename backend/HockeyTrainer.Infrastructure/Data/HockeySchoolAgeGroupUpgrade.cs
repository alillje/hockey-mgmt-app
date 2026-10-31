using System.Text.Json;
using HockeyTrainer.Application.Services;
using Microsoft.EntityFrameworkCore;

namespace HockeyTrainer.Infrastructure.Data;

internal static class HockeySchoolAgeGroupUpgrade
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static async Task ApplyAsync(HockeyDbContext db, CancellationToken cancellationToken)
    {
        foreach (var drill in await db.Drills.ToListAsync(cancellationToken))
        {
            var tags = TagRules.Read(drill.TagsJson);
            var ageGroups = TagRules.Read(drill.AgeGroupsJson);
            var hadHockeySchool = HasHockeySchool(tags) || IsHockeySchool(drill.CategoryId) ||
                IsHockeySchool(drill.AgeGroup) || HasHockeySchool(ageGroups);

            if (!hadHockeySchool)
            {
                continue;
            }

            drill.TagsJson = JsonSerializer.Serialize(RemoveHockeySchool(tags), JsonOptions);
            var migratedAgeGroups = AddHockeySchool(ageGroups);
            drill.AgeGroupsJson = JsonSerializer.Serialize(migratedAgeGroups, JsonOptions);
            if (IsHockeySchool(drill.AgeGroup) || drill.AgeGroup.Length == 0)
            {
                drill.AgeGroup = migratedAgeGroups.FirstOrDefault() ?? "HockeySchool";
            }

            if (IsHockeySchool(drill.CategoryId))
            {
                drill.CategoryId = "other";
            }
        }

        foreach (var training in await db.Trainings.ToListAsync(cancellationToken))
        {
            var tags = TagRules.Read(training.TagsJson);
            var ageGroups = TagRules.Read(training.AgeGroupsJson);
            var hadHockeySchool = HasHockeySchool(tags) || IsHockeySchool(training.AgeGroup) || HasHockeySchool(ageGroups);

            if (!hadHockeySchool)
            {
                continue;
            }

            training.TagsJson = JsonSerializer.Serialize(RemoveHockeySchool(tags), JsonOptions);
            var migratedAgeGroups = AddHockeySchool(ageGroups);
            training.AgeGroupsJson = JsonSerializer.Serialize(migratedAgeGroups, JsonOptions);
            if (IsHockeySchool(training.AgeGroup) || training.AgeGroup.Length == 0)
            {
                training.AgeGroup = migratedAgeGroups.FirstOrDefault() ?? "HockeySchool";
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private static List<string> AddHockeySchool(IReadOnlyList<string> ageGroups)
    {
        var result = ageGroups
            .Select(age => IsHockeySchool(age) ? "HockeySchool" : age)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (!result.Contains("HockeySchool", StringComparer.OrdinalIgnoreCase))
        {
            result.Add("HockeySchool");
        }

        return result;
    }

    private static bool HasHockeySchool(IEnumerable<string> values) => values.Any(IsHockeySchool);

    private static bool IsHockeySchool(string value) => value.Trim().Replace('-', ' ')
        .Equals("Hockey School", StringComparison.OrdinalIgnoreCase) ||
        value.Trim().Equals("HockeySchool", StringComparison.OrdinalIgnoreCase);

    private static List<string> RemoveHockeySchool(IEnumerable<string> tags) => tags
        .Where(tag => !IsHockeySchool(tag))
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToList();

}

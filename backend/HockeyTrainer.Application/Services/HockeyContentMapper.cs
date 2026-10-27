using System.Text.Json;
using HockeyTrainer.Application.Contracts;
using HockeyTrainer.Domain.Models;

namespace HockeyTrainer.Application.Services;

internal static class HockeyContentMapper
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static DrillResponse Map(Drill drill, WorkspaceAccess access) => new(
        drill.Id,
        drill.Title,
        drill.CategoryId,
        drill.Notes,
        JsonSerializer.Deserialize<Diagram>(drill.DiagramJson, JsonOptions)!,
        drill.UpdatedAt,
        TagRules.Read(drill.TagsJson),
        drill.AgeGroup,
        access.Describe(drill, access.OrganisationName),
        ContentAges(drill));

    public static TrainingResponse Map(Training training, WorkspaceAccess access) => new(
        training.Id,
        training.Title,
        training.Notes,
        training.Items.OrderBy(item => item.Position)
            .Select(item => new TrainingItem(item.DrillId, item.DurationMinutes, item.Notes)).ToList(),
        training.UpdatedAt,
        TagRules.Read(training.TagsJson),
        training.AgeGroup,
        access.Describe(training, access.OrganisationName),
        ContentAges(training));

    public static DateTimeOffset UtcNow()
    {
        var now = DateTimeOffset.UtcNow;

        return new DateTimeOffset(now.Ticks - now.Ticks % 10, TimeSpan.Zero);
    }

    private static List<string> ContentAges(IOwnedContent content)
    {
        var ages = TagRules.Read(content.AgeGroupsJson);

        return ages.Count == 0 && content.AgeGroup.Length > 0 ? [content.AgeGroup] : ages;
    }
}

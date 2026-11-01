using HockeyTrainer.Application.Contracts;
using HockeyTrainer.Application.Repositories;

namespace HockeyTrainer.Application.Services;

public sealed class ContentSearchService(IContentSearchRepository contentSearchRepository,
    WorkspaceService workspaceService, IHockeyService hockeyService)
{
    public async Task<ContentPageResponse> SearchAsync(bool practices, ContentSearchRequest request, CancellationToken ct)
    {
        if (request.Page is < 1 or > 1_000_000 || request.PageSize is < 1 or > 100 ||
            request.Search?.Length > 200 || request.Source.Count > 100 || request.Age.Count > 30 ||
            request.Age.Any(age => string.IsNullOrWhiteSpace(age) || age.Length > 40) || request.Scope is not (null or "" or "custom"))
        {
            throw new ApiException(400, "Invalid search", "Use valid filters, a positive page and a page size between 1 and 100.");
        }
        var tags = TagRules.Normalize(request.Tag).ToArray();
        var access = await workspaceService.AccessAsync(ct);
        var allowedTeams = access.Teams.Where(team => access.IsAdmin ||
            access.Memberships.Any(member => member.TeamId == team.Id)).Select(team => team.Id).ToArray();
        var sources = request.Source.Count == 0 && request.Scope != "custom"
            ? new[] { access.TeamId?.ToString() ?? "club" }
            : request.Source.Distinct().ToArray();
        var teamIds = new List<Guid>();
        foreach (var source in sources.Where(source => source != "club"))
        {
            if (!Guid.TryParse(source, out var teamId))
            {
                throw new ApiException(400, "Invalid source", "Choose a team or club from this organisation.");
            }
            if (!allowedTeams.Contains(teamId))
            {
                throw new ApiException(403, "Source unavailable", "You cannot search that workspace.");
            }
            teamIds.Add(teamId);
        }
        var result = await contentSearchRepository.SearchAsync(practices, new ContentSearchCriteria(
            access.OrganisationId, teamIds.ToArray(), sources.Contains("club"), request.Search?.Trim() ?? string.Empty, tags,
            request.Age.Select(age => age.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToArray(),
            request.Uncategorized, request.Page, request.PageSize), ct);
        var counts = Catalog.Categories.Select(category => new CategoryCountResponse(category.Name,
            result.TagCounts.Where(group => TagRules.Read(group.TagsJson).Contains(category.Name, StringComparer.OrdinalIgnoreCase))
                .Sum(group => group.Count))).ToList();
        var untagged = result.TagCounts.Where(group => TagRules.Read(group.TagsJson).Count == 0).Sum(group => group.Count);
        if (untagged > 0)
        {
            counts.Add(new("Uncategorized", untagged, true));
        }

        return new(result.Items.Select(item => new ContentSummaryResponse(item.Id, item.Title, item.UpdatedAt,
            TagRules.Read(item.TagsJson), item.AgeGroup, ReadAges(item.AgeGroupsJson, item.AgeGroup),
            access.Describe(item, access.OrganisationName))).ToList(), result.Page, request.PageSize,
            result.TotalCount, result.TagCounts.Sum(group => group.Count), counts);
    }

    public async Task<PracticeDetailResponse> GetPracticeAsync(Guid id, CancellationToken ct)
    {
        var training = await hockeyService.GetTrainingAsync(id, ct);
        var referencedIds = training.Items.Select(item => item.DrillId).ToHashSet();
        var access = await workspaceService.AccessAsync(ct);
        var drills = await contentSearchRepository.GetPracticeDrillsAsync(id, ct);
        if (drills.Count != referencedIds.Count ||
            drills.Any(drill => !referencedIds.Contains(drill.Id) || !access.CanView(drill) || drill.OwnerTeamId != training.Ownership!.OwnerTeamId))
        {
            throw new ApiException(409, "Practice unavailable", "A referenced drill is unavailable in this workspace.");
        }

        return new(training, drills.Select(drill => HockeyContentMapper.Map(drill, access)).ToList());
    }

    private static List<string> ReadAges(string json, string legacy)
    {
        var ages = TagRules.Read(json);

        return ages.Count == 0 && legacy.Length > 0 ? [legacy] : ages;
    }
}

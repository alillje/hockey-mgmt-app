using HockeyTrainer.Domain.Models;

namespace HockeyTrainer.Application.Repositories;

public sealed record ContentSearchCriteria(Guid OrganisationId, Guid[] TeamIds, bool IncludeClub,
    string Search, string[] Tags, string[] Ages, bool Uncategorized, int Page, int PageSize);

public sealed class ContentListRow : IOwnedContent
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string SearchNotes { get; set; } = string.Empty;
    public string TagsJson { get; set; } = "[]";
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid OrganisationId { get; set; }
    public Guid? OwnerTeamId { get; set; }
    public Guid? OriginTeamId { get; set; }
    public Guid CreatedByUserId { get; set; }
    public string AgeGroup { get; set; } = string.Empty;
    public string AgeGroupsJson { get; set; } = "[]";
}

public sealed record ContentTagCount(string TagsJson, int Count);
public sealed record ContentSearchResult(List<ContentListRow> Items, int Page, int TotalCount, List<ContentTagCount> TagCounts);

public interface IContentSearchRepository
{
    Task<ContentSearchResult> SearchAsync(bool practices, ContentSearchCriteria criteria, CancellationToken cancellationToken);
    Task<List<Drill>> GetPracticeDrillsAsync(Guid practiceId, CancellationToken cancellationToken);
}

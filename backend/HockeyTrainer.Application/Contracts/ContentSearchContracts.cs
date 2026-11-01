namespace HockeyTrainer.Application.Contracts;

public sealed class ContentSearchRequest
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
    public string? Search { get; set; }
    public string? Scope { get; set; }
    public List<string> Source { get; set; } = [];
    public List<string> Tag { get; set; } = [];
    public List<string> Age { get; set; } = [];
    public bool Uncategorized { get; set; }
}

public sealed record ContentSummaryResponse(Guid Id, string Title, DateTimeOffset UpdatedAt,
    List<string> Tags, string AgeGroup, List<string> AgeGroups, OwnershipResponse Ownership);
public sealed record CategoryCountResponse(string Label, int Count, bool Untagged = false);
public sealed record ContentPageResponse(List<ContentSummaryResponse> Items, int Page, int PageSize,
    int TotalCount, int SourceCount, List<CategoryCountResponse> Categories);
public sealed record PracticeDetailResponse(TrainingResponse Training, List<DrillResponse> Drills);

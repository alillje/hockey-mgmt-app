using System.Text.Json;
using System.Text.Encodings.Web;
using System.Linq.Expressions;
using HockeyTrainer.Application.Repositories;
using HockeyTrainer.Application.Services;
using HockeyTrainer.Domain.Models;
using HockeyTrainer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace HockeyTrainer.Infrastructure.Repositories;

public sealed class ContentSearchRepository(HockeyDbContext db) : IContentSearchRepository
{
    // PostgreSQL jsonb text and .NET's serializer escape Unicode differently. Both are data parameters.
    private static readonly JsonSerializerOptions DatabaseJsonOptions = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    public async Task<ContentSearchResult> SearchAsync(bool practices, ContentSearchCriteria criteria, CancellationToken ct)
    {
        // Project before materialization: list searches never transfer rink drawings or plan entries.
        var query = practices ? ProjectPractices() : ProjectDrills();
        query = query.Where(item => item.OrganisationId == criteria.OrganisationId &&
            ((criteria.IncludeClub && item.OwnerTeamId == null) ||
             (item.OwnerTeamId != null && criteria.TeamIds.Contains(item.OwnerTeamId.Value))));
        if (criteria.Search.Length > 0)
        {
            var term = criteria.Search.ToLowerInvariant();
            query = query.Where(item => item.Title.ToLower().Contains(term) ||
                item.SearchNotes.ToLower().Contains(term) || item.TagsJson.ToLower().Contains(term));
        }
        if (criteria.Ages.Length > 0)
        {
            var ages = criteria.Ages.SelectMany(AgeSearchTokens).Distinct().ToArray();
            var legacyAges = criteria.Ages.Select(age => age.ToLowerInvariant()).ToArray();
            query = query.Where(item => ages.Any(age => item.AgeGroupsJson.ToLower().Contains(age)) ||
                (item.AgeGroupsJson == "[]" && legacyAges.Contains(item.AgeGroup.ToLower())));
        }
        // Group semantic category membership, not JSON text/order: at most 256 small count rows.
        var groupedCounts = await query.GroupBy(CategoryMask())
            .Select(group => new { Mask = group.Key, Count = group.Count() }).ToListAsync(ct);
        var tagCounts = groupedCounts.Select(group => new ContentTagCount(
            JsonSerializer.Serialize(Catalog.Categories.Where((_, index) => (group.Mask & (1 << index)) != 0)
                .Select(category => category.Name)), group.Count)).ToList();
        if (criteria.Tags.Length > 0 || criteria.Uncategorized)
        {
            var tags = criteria.Tags.Select(tag => JsonSerializer.Serialize(tag.ToLowerInvariant())).ToArray();
            query = query.Where(item => (criteria.Uncategorized && item.TagsJson == "[]") ||
                tags.Any(tag => item.TagsJson.ToLower().Contains(tag)));
        }
        var total = await query.CountAsync(ct);
        var page = Math.Min(criteria.Page, Math.Max(1, (int)Math.Ceiling((double)total / criteria.PageSize)));
        var items = await query.OrderBy(item => item.Title.ToLower()).ThenBy(item => item.Id)
            .Skip((page - 1) * criteria.PageSize).Take(criteria.PageSize)
            .Select(item => new ContentListRow
            {
                Id = item.Id,
                Title = item.Title,
                UpdatedAt = item.UpdatedAt,
                TagsJson = item.TagsJson,
                OrganisationId = item.OrganisationId,
                OwnerTeamId = item.OwnerTeamId,
                OriginTeamId = item.OriginTeamId,
                CreatedByUserId = item.CreatedByUserId,
                AgeGroup = item.AgeGroup,
                AgeGroupsJson = item.AgeGroupsJson
            }).ToListAsync(ct);

        return new(items, page, total, tagCounts);
    }

    public Task<List<Drill>> GetPracticeDrillsAsync(Guid practiceId, CancellationToken ct) =>
        db.Drills.AsNoTracking().Where(drill => db.TrainingEntries.Any(entry =>
            entry.TrainingId == practiceId && entry.DrillId == drill.Id)).ToListAsync(ct);

    private static Expression<Func<ContentListRow, int>> CategoryMask()
    {
        var item = Expression.Parameter(typeof(ContentListRow), "item");
        var json = Expression.Call(Expression.Property(item, nameof(ContentListRow.TagsJson)), nameof(string.ToLower), Type.EmptyTypes);
        Expression mask = Expression.Constant(0);
        for (var index = 0; index < Catalog.Categories.Count; index++)
        {
            var label = JsonSerializer.Serialize(Catalog.Categories[index].Name.ToLowerInvariant());
            var contains = Expression.Call(json, nameof(string.Contains), Type.EmptyTypes, Expression.Constant(label));
            mask = Expression.Add(mask, Expression.Condition(contains, Expression.Constant(1 << index), Expression.Constant(0)));
        }

        return Expression.Lambda<Func<ContentListRow, int>>(mask, item);
    }

    private static IEnumerable<string> AgeSearchTokens(string age)
    {
        var raw = JsonSerializer.Serialize(age, DatabaseJsonOptions);
        // SQLite lower() folds ASCII only; PostgreSQL also folds Unicode in unescaped JSON.
        return [JsonSerializer.Serialize(age).ToLowerInvariant(), raw.ToLowerInvariant(),
            new string(raw.Select(character => character is >= 'A' and <= 'Z'
                ? char.ToLowerInvariant(character) : character).ToArray())];
    }

    private IQueryable<ContentListRow> ProjectDrills() => db.Drills.AsNoTracking().Select(drill => new ContentListRow
    {
        Id = drill.Id,
        Title = drill.Title,
        SearchNotes = drill.Notes,
        UpdatedAt = drill.UpdatedAt,
        TagsJson = drill.TagsJson,
        OrganisationId = drill.OrganisationId,
        OwnerTeamId = drill.OwnerTeamId,
        OriginTeamId = drill.OriginTeamId,
        CreatedByUserId = drill.CreatedByUserId,
        AgeGroup = drill.AgeGroup,
        AgeGroupsJson = drill.AgeGroupsJson
    });

    private IQueryable<ContentListRow> ProjectPractices() => db.Trainings.AsNoTracking().Select(training => new ContentListRow
    {
        Id = training.Id,
        Title = training.Title,
        SearchNotes = training.Notes,
        UpdatedAt = training.UpdatedAt,
        TagsJson = training.TagsJson,
        OrganisationId = training.OrganisationId,
        OwnerTeamId = training.OwnerTeamId,
        OriginTeamId = training.OriginTeamId,
        CreatedByUserId = training.CreatedByUserId,
        AgeGroup = training.AgeGroup,
        AgeGroupsJson = training.AgeGroupsJson
    });
}

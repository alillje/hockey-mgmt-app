using System.Text.Json;
using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Models;
using HockeyTrainer.Api.Repositories;

namespace HockeyTrainer.Api.Services;

public sealed class HockeyService(IHockeyRepository repository, WorkspaceService workspace, CatalogService catalog) : IHockeyService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<List<DrillResponse>> GetDrillsAsync(string? search, string? categoryId, CancellationToken ct, string? tag = null)
    {
        var access = await workspace.AccessAsync(ct);
        var drills = await repository.GetDrillsAsync(null, categoryId, access.OrganisationId, ct);
        return drills.Where(access.CanView).Select(d => Map(d, access))
            .Where(d => TagRules.Matches(d.Title, d.Notes, d.Tags, search, tag)).ToList();
    }

    public async Task<DrillResponse> GetDrillAsync(Guid id, CancellationToken ct)
    {
        var access = await workspace.AccessAsync(ct);
        return Map(await FindDrillAsync(id, access, ct), access);
    }

    public Task<DrillResponse> SaveDrillAsync(Guid? id, DrillRequest request, CancellationToken ct) => repository.ExecuteAsync(async () =>
    {
        var access = await workspace.AccessAsync(ct);
        RequestValidator.Validate(request);
        var drill = id.HasValue ? await FindDrillAsync(id.Value, access, ct) : new Drill { Id = Guid.NewGuid() };
        if (id.HasValue) RequireEdit(drill, access);
        else { AssignOwnership(drill, access); repository.Add(drill); }
        drill.TagsJson = JsonSerializer.Serialize(request.Tags is not null ? TagRules.Normalize(request.Tags)
            : id.HasValue ? TagRules.Read(drill.TagsJson) : [Catalog.Categories.Single(c => c.Id == request.CategoryId).Name]);
        drill.Title = request.Title.Trim();
        drill.CategoryId = request.CategoryId;
        drill.Notes = request.Notes ?? "";
        var ages = await catalog.ResolveContentAgesAsync(request.AgeGroups, request.AgeGroup, drill.AgeGroupsJson,
            drill.AgeGroup, id.HasValue, access.Teams.FirstOrDefault(t => t.Id == drill.OwnerTeamId)?.AgeGroup, ct);
        drill.AgeGroupsJson = JsonSerializer.Serialize(ages);
        drill.AgeGroup = ages.FirstOrDefault() ?? "";
        var diagram = request.Diagram!;
        drill.DiagramJson = JsonSerializer.Serialize(diagram with { Objects = diagram.Objects.Select(o => o with { Label = o.Label ?? "" }).ToList() }, JsonOptions);
        drill.UpdatedAt = UtcNow();
        return Map(drill, access);
    }, ct);

    public async Task DeleteDrillAsync(Guid id, CancellationToken ct) => await repository.ExecuteAsync(async () =>
    {
        var access = await workspace.AccessAsync(ct);
        var drill = await FindDrillAsync(id, access, ct);
        RequireEdit(drill, access);
        if (await repository.IsDrillReferencedAsync(id, ct))
            throw new ApiException(409, "Drill is in use", "One or more practice plans depend on this drill. Their owners must remove or replace it before deletion.");
        repository.Remove(drill);
        return true;
    }, ct);

    public async Task<List<TrainingResponse>> GetTrainingsAsync(CancellationToken ct, string? search = null, string? tag = null)
    {
        var access = await workspace.AccessAsync(ct);
        return (await repository.GetTrainingsAsync(access.OrganisationId, ct)).Where(access.CanView).Select(t => Map(t, access))
            .Where(t => TagRules.Matches(t.Title, t.Notes, t.Tags, search, tag)).ToList();
    }

    public async Task<TrainingResponse> GetTrainingAsync(Guid id, CancellationToken ct)
    {
        var access = await workspace.AccessAsync(ct);
        return Map(await FindTrainingAsync(id, access, ct), access);
    }

    public Task<TrainingResponse> SaveTrainingAsync(Guid? id, TrainingRequest request, CancellationToken ct) => repository.ExecuteAsync(async () =>
    {
        var access = await workspace.AccessAsync(ct);
        RequestValidator.Validate(request);
        var training = id.HasValue ? await FindTrainingAsync(id.Value, access, ct) : new Training { Id = Guid.NewGuid() };
        if (id.HasValue) RequireEdit(training, access);
        else { AssignOwnership(training, access); repository.Add(training); }
        foreach (var drillId in request.Items!.Select(i => i.DrillId).Distinct())
        {
            var drill = await repository.GetDrillAsync(drillId, ct);
            if (drill is null || !access.CanView(drill)) throw new ApiException(400, "Unknown drill", "One or more drills are unavailable.");
            if (!access.CanUseInPlan(drill, training.OwnerTeamId))
                throw new ApiException(409, "Drill belongs to another workspace", "Copy this drill into the plan's workspace before adding it.");
        }
        training.TagsJson = JsonSerializer.Serialize(request.Tags is not null ? TagRules.Normalize(request.Tags)
            : id.HasValue ? TagRules.Read(training.TagsJson) : []);
        training.Title = request.Title.Trim();
        training.Notes = request.Notes ?? "";
        var ages = await catalog.ResolveContentAgesAsync(request.AgeGroups, request.AgeGroup, training.AgeGroupsJson,
            training.AgeGroup, id.HasValue, access.Teams.FirstOrDefault(t => t.Id == training.OwnerTeamId)?.AgeGroup, ct);
        training.AgeGroupsJson = JsonSerializer.Serialize(ages);
        training.AgeGroup = ages.FirstOrDefault() ?? "";
        training.UpdatedAt = UtcNow();
        training.Items.Clear();
        training.Items.AddRange(request.Items!.Select((item, position) => new TrainingEntry
        {
            DrillId = item.DrillId,
            DurationMinutes = item.DurationMinutes,
            Notes = item.Notes ?? "",
            Position = position
        }));
        return Map(training, access);
    }, ct);

    public async Task DeleteTrainingAsync(Guid id, CancellationToken ct) => await repository.ExecuteAsync(async () =>
    {
        var access = await workspace.AccessAsync(ct);
        var plan = await FindTrainingAsync(id, access, ct);
        RequireEdit(plan, access);
        repository.Remove(plan);
        return true;
    }, ct);

    public Task<DrillResponse> CopyDrillAsync(Guid id, bool toLibrary, CancellationToken ct) => repository.ExecuteAsync(async () =>
    {
        var access = await workspace.AccessAsync(ct);
        var original = await FindDrillAsync(id, access, ct);
        var destinationTeamId = RequireCopy(original, access, toLibrary);
        return Map(CloneDrill(original, access, destinationTeamId), access);
    }, ct);

    public Task<TrainingResponse> CopyTrainingAsync(Guid id, bool toLibrary, CancellationToken ct) => repository.ExecuteAsync(async () =>
    {
        var access = await workspace.AccessAsync(ct);
        var original = await FindTrainingAsync(id, access, ct);
        var destinationTeamId = RequireCopy(original, access, toLibrary);
        var copiedDrills = new Dictionary<Guid, Guid>();
        foreach (var drillId in original.Items.Select(i => i.DrillId).Distinct().Order())
        {
            var drill = await FindDrillAsync(drillId, access, ct);
            if (!access.CanUseInPlan(drill, original.OwnerTeamId))
                throw new ApiException(409, "Invalid plan reference", "Every included drill must belong to the source plan's workspace.");
            copiedDrills.Add(drillId, CloneDrill(drill, access, destinationTeamId).Id);
        }
        var copy = new Training
        {
            Id = Guid.NewGuid(),
            Title = original.Title,
            Notes = original.Notes,
            TagsJson = original.TagsJson,
            AgeGroup = original.AgeGroup,
            AgeGroupsJson = original.AgeGroupsJson,
            UpdatedAt = UtcNow(),
            Items = original.Items.OrderBy(i => i.Position).Select(i => new TrainingEntry
            {
                DrillId = copiedDrills[i.DrillId],
                Position = i.Position,
                DurationMinutes = i.DurationMinutes,
                Notes = i.Notes
            }).ToList()
        };
        SetCopyOwnership(copy, original, access, destinationTeamId);
        repository.Add(copy);
        return Map(copy, access);
    }, ct);

    private Drill CloneDrill(Drill original, WorkspaceAccess access, Guid? destinationTeamId)
    {
        var copy = new Drill
        {
            Id = Guid.NewGuid(),
            Title = original.Title,
            CategoryId = original.CategoryId,
            Notes = original.Notes,
            TagsJson = original.TagsJson,
            DiagramJson = original.DiagramJson,
            AgeGroup = original.AgeGroup,
            AgeGroupsJson = original.AgeGroupsJson,
            UpdatedAt = UtcNow()
        };
        SetCopyOwnership(copy, original, access, destinationTeamId);
        repository.Add(copy);
        return copy;
    }

    private static Guid? RequireCopy(IOwnedContent source, WorkspaceAccess access, bool toLibrary)
    {
        if (toLibrary)
        {
            if (source.OwnerTeamId is null || source.OwnerTeamId != access.TeamId || !access.CanEdit(source))
                throw new ApiException(403, "Select your editable source team", "Only a coach of the selected team can contribute its content to the organisation library.");
            return null;
        }
        if (source.OwnerTeamId is not null || access.TeamId is null || !access.CanEditTeam(access.TeamId))
            throw new ApiException(403, "Select an editable destination team", "Only organisation-library content can be copied to your selected team.");
        return access.TeamId;
    }

    private static void SetCopyOwnership(IOwnedContent copy, IOwnedContent source, WorkspaceAccess access, Guid? teamId)
    {
        copy.OrganisationId = access.OrganisationId;
        copy.OwnerTeamId = teamId;
        copy.OriginTeamId = source.OwnerTeamId ?? source.OriginTeamId;
        copy.CreatedByUserId = access.UserId;
    }

    private static void AssignOwnership(IOwnedContent content, WorkspaceAccess access)
    {
        if (!access.CanEditTeam(access.TeamId)) throw new ApiException(403, "Editing permission required");
        content.OrganisationId = access.OrganisationId;
        content.OwnerTeamId = access.TeamId;
        content.OriginTeamId = access.TeamId;
        content.CreatedByUserId = access.UserId;
    }

    private static void RequireEdit(IOwnedContent content, WorkspaceAccess access)
    {
        if (!access.CanEdit(content)) throw new ApiException(403, "Editing permission required", "You can view this content. Copy it to your team to make changes.");
    }

    private async Task<Drill> FindDrillAsync(Guid id, WorkspaceAccess access, CancellationToken ct)
    {
        var drill = await repository.GetDrillAsync(id, ct);
        return drill is not null && access.CanView(drill) ? drill : throw new ApiException(404, "Drill not found");
    }
    private async Task<Training> FindTrainingAsync(Guid id, WorkspaceAccess access, CancellationToken ct)
    {
        var training = await repository.GetTrainingAsync(id, ct);
        return training is not null && access.CanView(training) ? training : throw new ApiException(404, "Practice plan not found");
    }
    // PostgreSQL timestamps have microsecond precision. Match it before returning a response so
    // clients can safely send the value back as an optimistic concurrency token.
    private static DateTimeOffset UtcNow()
    {
        var now = DateTimeOffset.UtcNow;
        return new DateTimeOffset(now.Ticks - now.Ticks % 10, TimeSpan.Zero);
    }

    private static List<string> ContentAges(IOwnedContent content)
    {
        var ages = TagRules.Read(content.AgeGroupsJson);
        return ages.Count == 0 && content.AgeGroup.Length > 0 ? [content.AgeGroup] : ages;
    }

    private static DrillResponse Map(Drill drill, WorkspaceAccess access) => new(drill.Id, drill.Title, drill.CategoryId, drill.Notes,
        JsonSerializer.Deserialize<Diagram>(drill.DiagramJson, JsonOptions)!, drill.UpdatedAt, TagRules.Read(drill.TagsJson), drill.AgeGroup,
        access.Describe(drill, access.OrganisationName), ContentAges(drill));
    private static TrainingResponse Map(Training training, WorkspaceAccess access) => new(training.Id, training.Title, training.Notes,
        training.Items.OrderBy(i => i.Position).Select(i => new TrainingItem(i.DrillId, i.DurationMinutes, i.Notes)).ToList(),
        training.UpdatedAt, TagRules.Read(training.TagsJson), training.AgeGroup, access.Describe(training, access.OrganisationName), ContentAges(training));
}

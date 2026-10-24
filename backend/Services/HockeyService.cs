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
        drill.AgeGroup = await catalog.ResolveAgeGroupAsync(request.AgeGroup, id.HasValue ? drill.AgeGroup : null,
            access.Teams.FirstOrDefault(t => t.Id == drill.OwnerTeamId)?.AgeGroup, ct);
        var diagram = request.Diagram!;
        drill.DiagramJson = JsonSerializer.Serialize(diagram with { Objects = diagram.Objects.Select(o => o with { Label = o.Label ?? "" }).ToList() }, JsonOptions);
        drill.UpdatedAt = DateTimeOffset.UtcNow;
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
            if (!access.CanUseInPlan(drill, training.OwnerTeamId, training.Visibility))
                throw new ApiException(409, "Drill visibility does not match this plan", "Use a club-shared drill or a drill owned by this plan's team. Share private drills explicitly before adding them to a shared plan.");
        }
        training.TagsJson = JsonSerializer.Serialize(request.Tags is not null ? TagRules.Normalize(request.Tags)
            : id.HasValue ? TagRules.Read(training.TagsJson) : []);
        training.Title = request.Title.Trim();
        training.Notes = request.Notes ?? "";
        training.AgeGroup = await catalog.ResolveAgeGroupAsync(request.AgeGroup, id.HasValue ? training.AgeGroup : null,
            access.Teams.FirstOrDefault(t => t.Id == training.OwnerTeamId)?.AgeGroup, ct);
        training.UpdatedAt = DateTimeOffset.UtcNow;
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

    public Task<DrillResponse> CopyDrillAsync(Guid id, CancellationToken ct) => repository.ExecuteAsync(async () =>
    {
        var access = await workspace.AccessAsync(ct);
        var original = await FindDrillAsync(id, access, ct);
        return Map(CopyDrill(original, access), access);
    }, ct);

    public Task<TrainingResponse> CopyTrainingAsync(Guid id, CancellationToken ct) => repository.ExecuteAsync(async () =>
    {
        var access = await workspace.AccessAsync(ct);
        RequireCopyTarget(access);
        var original = await FindTrainingAsync(id, access, ct);
        foreach (var item in original.Items)
        {
            var drill = await FindDrillAsync(item.DrillId, access, ct);
            if (!access.CanUseInPlan(drill, access.TeamId, "team"))
                throw new ApiException(409, "Plan contains team-only drills", "Share the included drills with the club before copying this plan to another team.");
        }
        var copy = new Training
        {
            Id = Guid.NewGuid(),
            Title = CopyTitle(original.Title),
            Notes = original.Notes,
            TagsJson = original.TagsJson,
            AgeGroup = original.AgeGroup,
            UpdatedAt = DateTimeOffset.UtcNow,
            Items = original.Items.OrderBy(i => i.Position).Select(i => new TrainingEntry
            { DrillId = i.DrillId, Position = i.Position, DurationMinutes = i.DurationMinutes, Notes = i.Notes }).ToList()
        };
        AssignOwnership(copy, access);
        copy.OriginTeamId = original.OriginTeamId;
        repository.Add(copy);
        return Map(copy, access);
    }, ct);

    public Task<TrainingResponse> CopyEntryDrillAsync(Guid id, int position, CopyRequest request, CancellationToken ct) => repository.ExecuteAsync(async () =>
    {
        var access = await workspace.AccessAsync(ct);
        var plan = await FindTrainingAsync(id, access, ct);
        RequireEdit(plan, access);
        if (plan.OwnerTeamId != access.TeamId || access.TeamId is null)
            throw new ApiException(409, "Select the plan's team", "Select the team that owns this plan to copy and replace a drill.");
        if (plan.Visibility != "team") throw new ApiException(409, "Plan is shared", "Unshare this plan before replacing a drill with a team-only copy.");
        if (request.ExpectedUpdatedAt != plan.UpdatedAt) throw Changed();
        var entry = plan.Items.SingleOrDefault(i => i.Position == position) ?? throw new ApiException(404, "Plan entry not found");
        var drill = await FindDrillAsync(entry.DrillId, access, ct);
        entry.DrillId = CopyDrill(drill, access).Id;
        plan.UpdatedAt = DateTimeOffset.UtcNow;
        return Map(plan, access);
    }, ct);

    public async Task<SharingPreview> PreviewSharingAsync(Guid id, CancellationToken ct)
    {
        var access = await workspace.AccessAsync(ct);
        var plan = await FindTrainingAsync(id, access, ct);
        RequireEdit(plan, access);
        return await PreviewAsync(plan, access, ct);
    }

    public Task<TrainingResponse> SetTrainingVisibilityAsync(Guid id, VisibilityRequest request, CancellationToken ct) => repository.ExecuteAsync(async () =>
    {
        var access = await workspace.AccessAsync(ct);
        var plan = await FindTrainingAsync(id, access, ct);
        RequireEdit(plan, access);
        ValidateVisibility(request, plan);
        if (request.Visibility == "organisation")
        {
            var preview = await PreviewAsync(plan, access, ct);
            if (!preview.CanShare) throw new ApiException(403, "Some drills cannot be shared", "You need sharing permission for every team-only drill in this plan. Ask their owner to share them first.");
            var confirmed = request.ConfirmedDrills ?? [];
            if (confirmed.Count != preview.Drills.Count || confirmed.Select(d => d.Id).Distinct().Count() != confirmed.Count ||
                preview.Drills.Any(d => !confirmed.Any(c => c.Id == d.Id && c.UpdatedAt == d.UpdatedAt)))
                throw new ApiException(409, "Confirm included drills", "Review the current list of team-only drills and explicitly confirm sharing them with the club.");
            foreach (var item in preview.Drills.OrderBy(d => d.Id))
            {
                var drill = await FindDrillAsync(item.Id, access, ct);
                drill.Visibility = "organisation";
                drill.UpdatedAt = DateTimeOffset.UtcNow;
            }
        }
        plan.Visibility = request.Visibility;
        plan.UpdatedAt = DateTimeOffset.UtcNow;
        return Map(plan, access);
    }, ct);

    public Task<DrillResponse> SetDrillVisibilityAsync(Guid id, VisibilityRequest request, CancellationToken ct) => repository.ExecuteAsync(async () =>
    {
        var access = await workspace.AccessAsync(ct);
        var drill = await FindDrillAsync(id, access, ct);
        RequireEdit(drill, access);
        ValidateVisibility(request, drill);
        if (request.Visibility == "team" && (await repository.ReferencingPlansAsync(id, ct))
            .Any(p => p.Visibility == "organisation" || p.OwnerTeamId is null || p.OwnerTeamId != drill.OwnerTeamId))
            throw new ApiException(409, "Drill is needed by other plans", "One or more plans need club access to this drill. Their owners must replace or remove it before it can become team-only.");
        drill.Visibility = request.Visibility;
        drill.UpdatedAt = DateTimeOffset.UtcNow;
        return Map(drill, access);
    }, ct);

    private async Task<SharingPreview> PreviewAsync(Training plan, WorkspaceAccess access, CancellationToken ct)
    {
        var drills = new List<SharingDrill>();
        foreach (var id in plan.Items.Select(i => i.DrillId).Distinct())
        {
            var drill = await FindDrillAsync(id, access, ct);
            if (drill.Visibility != "organisation") drills.Add(new(drill.Id, drill.Title, drill.UpdatedAt, access.CanEdit(drill)));
        }
        return new(plan.UpdatedAt, drills, drills.All(d => d.CanShare));
    }

    private Drill CopyDrill(Drill original, WorkspaceAccess access)
    {
        RequireCopyTarget(access);
        var copy = new Drill
        {
            Id = Guid.NewGuid(),
            Title = CopyTitle(original.Title),
            CategoryId = original.CategoryId,
            Notes = original.Notes,
            TagsJson = original.TagsJson,
            DiagramJson = original.DiagramJson,
            AgeGroup = original.AgeGroup,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        AssignOwnership(copy, access);
        copy.OriginTeamId = original.OriginTeamId;
        repository.Add(copy);
        return copy;
    }

    private static void RequireCopyTarget(WorkspaceAccess access)
    {
        if (access.TeamId is null || !access.CanEditTeam(access.TeamId))
            throw new ApiException(403, "Select an editable team", "Select a team you can edit before copying content.");
    }

    private static void AssignOwnership(IOwnedContent content, WorkspaceAccess access)
    {
        if (!access.CanEditTeam(access.TeamId)) throw new ApiException(403, "Editing permission required");
        content.OrganisationId = access.OrganisationId;
        content.OwnerTeamId = access.TeamId;
        content.OriginTeamId = access.TeamId;
        content.CreatedByUserId = access.UserId;
        content.Visibility = access.TeamId is null ? "organisation" : "team";
    }

    private static void RequireEdit(IOwnedContent content, WorkspaceAccess access)
    {
        if (!access.CanEdit(content)) throw new ApiException(403, "Editing permission required", "You can view this content. Copy it to your team to make changes.");
    }

    private static void ValidateVisibility(VisibilityRequest request, IOwnedContent content)
    {
        if (request.Visibility is not ("team" or "organisation")) throw new ApiException(400, "Invalid visibility");
        if (content.OwnerTeamId is null && request.Visibility != "organisation")
            throw new ApiException(409, "Organisation-owned content stays in the club library");
        var updated = content is Drill drill ? drill.UpdatedAt : ((Training)content).UpdatedAt;
        if (request.ExpectedUpdatedAt != updated) throw Changed();
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
    private static ApiException Changed() => new(409, "Content changed", "Reload the content and review sharing again.");
    private static string CopyTitle(string title) => title[..Math.Min(title.Length, 113)] + " (copy)";
    private static DrillResponse Map(Drill drill, WorkspaceAccess access) => new(drill.Id, drill.Title, drill.CategoryId, drill.Notes,
        JsonSerializer.Deserialize<Diagram>(drill.DiagramJson, JsonOptions)!, drill.UpdatedAt, TagRules.Read(drill.TagsJson), drill.AgeGroup,
        access.Describe(drill, access.OrganisationName));
    private static TrainingResponse Map(Training training, WorkspaceAccess access) => new(training.Id, training.Title, training.Notes,
        training.Items.OrderBy(i => i.Position).Select(i => new TrainingItem(i.DrillId, i.DurationMinutes, i.Notes)).ToList(),
        training.UpdatedAt, TagRules.Read(training.TagsJson), training.AgeGroup, access.Describe(training, access.OrganisationName));
}

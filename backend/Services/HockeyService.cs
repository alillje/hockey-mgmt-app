using System.Text.Json;
using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Models;
using HockeyTrainer.Api.Repositories;

namespace HockeyTrainer.Api.Services;

public sealed class HockeyService(
    IHockeyRepository repository,
    WorkspaceService workspaceService,
    CatalogService catalogService,
    HockeyCopyService hockeyCopyService) : IHockeyService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<List<DrillResponse>> GetDrillsAsync(string? search, string? categoryId, CancellationToken ct, string? tag = null)
    {
        var access = await workspaceService.AccessAsync(ct);
        var drills = await repository.GetDrillsAsync(null, categoryId, access.OrganisationId, ct);

        return drills.Where(access.CanView).Select(d => HockeyContentMapper.Map(d, access))
            .Where(d => TagRules.Matches(d.Title, d.Notes, d.Tags, search, tag)).ToList();
    }

    public async Task<DrillResponse> GetDrillAsync(Guid id, CancellationToken ct)
    {
        var access = await workspaceService.AccessAsync(ct);

        return HockeyContentMapper.Map(await FindDrillAsync(id, access, ct), access);
    }

    public Task<DrillResponse> SaveDrillAsync(Guid? id, DrillRequest request, CancellationToken ct) => repository.ExecuteAsync(async () =>
    {
        var access = await workspaceService.AccessAsync(ct);
        RequestValidator.Validate(request);
        var drill = id.HasValue ? await FindDrillAsync(id.Value, access, ct) : new Drill
        {
            Id = Guid.NewGuid()
        };
        if (id.HasValue)
        {
            RequireEdit(drill, access);
        }
        else
        {
            AssignOwnership(drill, access);
            repository.Add(drill);
        }
        drill.TagsJson = JsonSerializer.Serialize(request.Tags is not null ? TagRules.Normalize(request.Tags)
            : id.HasValue ? TagRules.Read(drill.TagsJson) : [Catalog.Categories.Single(c => c.Id == request.CategoryId).Name]);
        drill.Title = request.Title.Trim();
        drill.CategoryId = request.CategoryId;
        drill.Notes = request.Notes ?? "";
        var ages = await catalogService.ResolveContentAgesAsync(request.AgeGroups, request.AgeGroup, drill.AgeGroupsJson,
            drill.AgeGroup, id.HasValue, ct);
        drill.AgeGroupsJson = JsonSerializer.Serialize(ages);
        drill.AgeGroup = ages.FirstOrDefault() ?? "";
        var diagram = request.Diagram!;
        drill.DiagramJson = JsonSerializer.Serialize(diagram with { Objects = diagram.Objects.Select(o => o with { Label = o.Label ?? "" }).ToList() }, JsonOptions);
        drill.UpdatedAt = HockeyContentMapper.UtcNow();

        return HockeyContentMapper.Map(drill, access);
    }, ct);

    public async Task DeleteDrillAsync(Guid id, CancellationToken ct) => await repository.ExecuteAsync(async () =>
    {
        var access = await workspaceService.AccessAsync(ct);
        var drill = await FindDrillAsync(id, access, ct);
        RequireEdit(drill, access);
        if (await repository.IsDrillReferencedAsync(id, ct))
        {
            throw new ApiException(409, "Drill is in use", "One or more practice plans depend on this drill. Their owners must remove or replace it before deletion.");
        }

        repository.Remove(drill);

        return true;
    }, ct);

    public async Task<List<TrainingResponse>> GetTrainingsAsync(CancellationToken ct, string? search = null, string? tag = null)
    {
        var access = await workspaceService.AccessAsync(ct);

        return (await repository.GetTrainingsAsync(access.OrganisationId, ct)).Where(access.CanView).Select(t => HockeyContentMapper.Map(t, access))
            .Where(t => TagRules.Matches(t.Title, t.Notes, t.Tags, search, tag)).ToList();
    }

    public async Task<TrainingResponse> GetTrainingAsync(Guid id, CancellationToken ct)
    {
        var access = await workspaceService.AccessAsync(ct);

        return HockeyContentMapper.Map(await FindTrainingAsync(id, access, ct), access);
    }

    public Task<TrainingResponse> SaveTrainingAsync(Guid? id, TrainingRequest request, CancellationToken ct) => repository.ExecuteAsync(async () =>
    {
        var access = await workspaceService.AccessAsync(ct);
        RequestValidator.Validate(request);
        var training = id.HasValue ? await FindTrainingAsync(id.Value, access, ct) : new Training
        {
            Id = Guid.NewGuid()
        };
        if (id.HasValue)
        {
            RequireEdit(training, access);
        }
        else
        {
            AssignOwnership(training, access);
            repository.Add(training);
        }
        foreach (var drillId in request.Items!.Select(i => i.DrillId).Distinct())
        {
            var drill = await repository.GetDrillAsync(drillId, ct);
            if (drill is null || !access.CanView(drill))
            {
                throw new ApiException(400, "Unknown drill", "One or more drills are unavailable.");
            }

            if (!access.CanUseInPlan(drill, training.OwnerTeamId))
            {
                throw new ApiException(409, "Drill belongs to another workspace", "Copy this drill into the plan's workspace before adding it.");
            }
        }
        training.TagsJson = JsonSerializer.Serialize(request.Tags is not null ? TagRules.Normalize(request.Tags)
            : id.HasValue ? TagRules.Read(training.TagsJson) : []);
        training.Title = request.Title.Trim();
        training.Notes = request.Notes ?? "";
        var ages = await catalogService.ResolveContentAgesAsync(request.AgeGroups, request.AgeGroup, training.AgeGroupsJson,
            training.AgeGroup, id.HasValue, ct);
        training.AgeGroupsJson = JsonSerializer.Serialize(ages);
        training.AgeGroup = ages.FirstOrDefault() ?? "";
        training.UpdatedAt = HockeyContentMapper.UtcNow();
        training.Items.Clear();
        training.Items.AddRange(request.Items!.Select((item, position) => new TrainingEntry
        {
            DrillId = item.DrillId,
            DurationMinutes = item.DurationMinutes,
            Notes = item.Notes ?? "",
            Position = position
        }));

        return HockeyContentMapper.Map(training, access);
    }, ct);

    public async Task DeleteTrainingAsync(Guid id, CancellationToken ct) => await repository.ExecuteAsync(async () =>
    {
        var access = await workspaceService.AccessAsync(ct);
        var plan = await FindTrainingAsync(id, access, ct);
        RequireEdit(plan, access);
        repository.Remove(plan);

        return true;
    }, ct);

    public Task<DrillResponse> CopyDrillAsync(Guid id, bool toLibrary, CancellationToken ct) =>
        hockeyCopyService.CopyDrillAsync(id, toLibrary, ct);

    public Task<TrainingResponse> CopyTrainingAsync(Guid id, bool toLibrary, CancellationToken ct) =>
        hockeyCopyService.CopyTrainingAsync(id, toLibrary, ct);

    public Task<DrillResponse> CopyDrillAsync(Guid id, CopyDestinationRequest destination, CancellationToken ct) =>
        hockeyCopyService.CopyDrillAsync(id, destination, ct);

    public Task<TrainingResponse> CopyTrainingAsync(Guid id, CopyDestinationRequest destination, CancellationToken ct) =>
        hockeyCopyService.CopyTrainingAsync(id, destination, ct);

    private static void AssignOwnership(IOwnedContent content, WorkspaceAccess access)
    {
        if (!access.CanEditTeam(access.TeamId))
        {
            throw new ApiException(403, "Editing permission required");
        }

        content.OrganisationId = access.OrganisationId;
        content.OwnerTeamId = access.TeamId;
        content.OriginTeamId = access.TeamId;
        content.CreatedByUserId = access.UserId;
    }

    private static void RequireEdit(IOwnedContent content, WorkspaceAccess access)
    {
        if (!access.CanEdit(content))
        {
            throw new ApiException(403, "Editing permission required", "You can view this content. Copy it to your team to make changes.");
        }
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
}

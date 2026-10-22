using System.Text.Json;
using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Models;
using HockeyTrainer.Api.Repositories;

namespace HockeyTrainer.Api.Services;

public sealed class HockeyService : IHockeyService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly IHockeyRepository _repository;

    public HockeyService(IHockeyRepository repository)
    {
        _repository = repository;
    }

    public async Task<List<DrillResponse>> GetDrillsAsync(string? search, string? categoryId, CancellationToken cancellationToken, string? tag = null)
    {
        var drills = await _repository.GetDrillsAsync(null, categoryId, cancellationToken);
        return drills.Select(Map).Where(d => TagRules.Matches(d.Title, d.Notes, d.Tags, search, tag)).ToList();
    }

    public async Task<DrillResponse> GetDrillAsync(Guid id, CancellationToken cancellationToken) => Map(await FindDrillAsync(id, cancellationToken));

    public async Task<DrillResponse> SaveDrillAsync(Guid? id, DrillRequest request, CancellationToken cancellationToken)
    {
        RequestValidator.Validate(request);
        var drill = id.HasValue ? await FindDrillAsync(id.Value, cancellationToken) : new Drill { Id = Guid.NewGuid() };
        drill.TagsJson = JsonSerializer.Serialize(request.Tags is not null
            ? TagRules.Normalize(request.Tags)
            : id.HasValue ? TagRules.Read(drill.TagsJson) : [Catalog.Categories.Single(c => c.Id == request.CategoryId).Name]);
        drill.Title = request.Title.Trim();
        drill.CategoryId = request.CategoryId;
        drill.Notes = request.Notes ?? "";
        var diagram = request.Diagram!;
        diagram = diagram with { Objects = diagram.Objects.Select(o => o with { Label = o.Label ?? "" }).ToList() };
        drill.DiagramJson = JsonSerializer.Serialize(diagram, JsonOptions);
        drill.UpdatedAt = DateTimeOffset.UtcNow;
        if (!id.HasValue)
        {
            _repository.Add(drill);
        }
        await _repository.SaveAsync(cancellationToken);
        return Map(drill);
    }

    public async Task DeleteDrillAsync(Guid id, CancellationToken cancellationToken)
    {
        var drill = await FindDrillAsync(id, cancellationToken);
        if (await _repository.IsDrillReferencedAsync(id, cancellationToken))
        {
            throw new ApiException(409, "Drill is in use", "Remove this drill from all training plans before deleting it.");
        }
        _repository.Remove(drill);
        await _repository.SaveAsync(cancellationToken);
    }

    public async Task<List<TrainingResponse>> GetTrainingsAsync(CancellationToken cancellationToken, string? search = null, string? tag = null)
    {
        var trainings = await _repository.GetTrainingsAsync(cancellationToken);
        return trainings.Select(Map).Where(t => TagRules.Matches(t.Title, t.Notes, t.Tags, search, tag)).ToList();
    }

    public async Task<TrainingResponse> GetTrainingAsync(Guid id, CancellationToken cancellationToken) => Map(await FindTrainingAsync(id, cancellationToken));

    public async Task<TrainingResponse> SaveTrainingAsync(Guid? id, TrainingRequest request, CancellationToken cancellationToken)
    {
        RequestValidator.Validate(request);
        if (!await _repository.AllDrillsExistAsync(request.Items!.Select(i => i.DrillId), cancellationToken))
        {
            throw new ApiException(400, "Unknown drill", "One or more training items reference a drill that does not exist.");
        }
        var training = id.HasValue ? await FindTrainingAsync(id.Value, cancellationToken) : new Training { Id = Guid.NewGuid() };
        training.TagsJson = JsonSerializer.Serialize(request.Tags is not null
            ? TagRules.Normalize(request.Tags)
            : id.HasValue ? TagRules.Read(training.TagsJson) : []);
        training.Title = request.Title.Trim();
        training.Notes = request.Notes ?? "";
        training.UpdatedAt = DateTimeOffset.UtcNow;
        training.Items.Clear();
        training.Items.AddRange(request.Items!.Select((item, position) => new TrainingEntry
        {
            DrillId = item.DrillId,
            DurationMinutes = item.DurationMinutes,
            Notes = item.Notes ?? "",
            Position = position
        }));
        if (!id.HasValue)
        {
            _repository.Add(training);
        }
        await _repository.SaveAsync(cancellationToken);
        return Map(training);
    }

    public async Task DeleteTrainingAsync(Guid id, CancellationToken cancellationToken)
    {
        _repository.Remove(await FindTrainingAsync(id, cancellationToken));
        await _repository.SaveAsync(cancellationToken);
    }

    private async Task<Drill> FindDrillAsync(Guid id, CancellationToken cancellationToken) =>
        await _repository.GetDrillAsync(id, cancellationToken)
        ?? throw new ApiException(404, "Drill not found", "The requested drill does not exist.");

    private async Task<Training> FindTrainingAsync(Guid id, CancellationToken cancellationToken) =>
        await _repository.GetTrainingAsync(id, cancellationToken)
        ?? throw new ApiException(404, "Training not found", "The requested training does not exist.");

    private static DrillResponse Map(Drill drill) => new(
        drill.Id, drill.Title, drill.CategoryId, drill.Notes,
        JsonSerializer.Deserialize<Diagram>(drill.DiagramJson, JsonOptions)!, drill.UpdatedAt, TagRules.Read(drill.TagsJson));

    private static TrainingResponse Map(Training training) => new(
        training.Id, training.Title, training.Notes,
        training.Items.OrderBy(i => i.Position)
            .Select(i => new TrainingItem(i.DrillId, i.DurationMinutes, i.Notes)).ToList(),
        training.UpdatedAt, TagRules.Read(training.TagsJson));
}

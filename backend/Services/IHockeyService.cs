using HockeyTrainer.Api.Contracts;

namespace HockeyTrainer.Api.Services;

public interface IHockeyService
{
    Task<List<DrillResponse>> GetDrillsAsync(string? search, string? categoryId, CancellationToken cancellationToken, string? tag = null);
    Task<DrillResponse> GetDrillAsync(Guid id, CancellationToken cancellationToken);
    Task<DrillResponse> SaveDrillAsync(Guid? id, DrillRequest request, CancellationToken cancellationToken);
    Task DeleteDrillAsync(Guid id, CancellationToken cancellationToken);
    Task<List<TrainingResponse>> GetTrainingsAsync(CancellationToken cancellationToken, string? search = null, string? tag = null);
    Task<TrainingResponse> GetTrainingAsync(Guid id, CancellationToken cancellationToken);
    Task<TrainingResponse> SaveTrainingAsync(Guid? id, TrainingRequest request, CancellationToken cancellationToken);
    Task DeleteTrainingAsync(Guid id, CancellationToken cancellationToken);
}

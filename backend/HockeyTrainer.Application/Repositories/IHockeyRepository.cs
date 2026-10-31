using HockeyTrainer.Domain.Models;

namespace HockeyTrainer.Application.Repositories;

public interface IHockeyRepository
{
    Task<List<Drill>> GetDrillsAsync(string? search, string? categoryId, Guid organisationId, CancellationToken cancellationToken);
    Task<Drill?> GetDrillAsync(Guid id, CancellationToken cancellationToken);
    Task<List<Training>> GetTrainingsAsync(Guid organisationId, CancellationToken cancellationToken);
    Task<Training?> GetTrainingAsync(Guid id, CancellationToken cancellationToken);
    Task<bool> DrillNameExistsAsync(Guid organisationId, Guid? ownerTeamId, string title, Guid? excludingId, CancellationToken cancellationToken);
    Task<bool> TrainingNameExistsAsync(Guid organisationId, Guid? ownerTeamId, string title, Guid? excludingId, CancellationToken cancellationToken);
    Task<List<string>> GetDrillTitlesAsync(Guid organisationId, Guid? ownerTeamId, CancellationToken cancellationToken);
    Task<List<string>> GetTrainingTitlesAsync(Guid organisationId, Guid? ownerTeamId, CancellationToken cancellationToken);
    Task<bool> IsDrillReferencedAsync(Guid id, CancellationToken cancellationToken);
    Task<bool> AllDrillsExistAsync(IEnumerable<Guid> ids, CancellationToken cancellationToken);
    void Add(Drill drill);
    void Add(Training training);
    void Remove(Drill drill);
    void Remove(Training training);
    Task<T> ExecuteAsync<T>(Func<Task<T>> operation, CancellationToken cancellationToken);
    Task SaveAsync(CancellationToken cancellationToken);
}

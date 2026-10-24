using HockeyTrainer.Api.Models;

namespace HockeyTrainer.Api.Repositories;

public interface IHockeyRepository
{
    Task<List<Drill>> GetDrillsAsync(string? search, string? categoryId, Guid organisationId, CancellationToken cancellationToken);
    Task<Drill?> GetDrillAsync(Guid id, CancellationToken cancellationToken);
    Task<List<Training>> GetTrainingsAsync(Guid organisationId, CancellationToken cancellationToken);
    Task<Training?> GetTrainingAsync(Guid id, CancellationToken cancellationToken);
    Task<bool> IsDrillReferencedAsync(Guid id, CancellationToken cancellationToken);
    Task<bool> AllDrillsExistAsync(IEnumerable<Guid> ids, CancellationToken cancellationToken);
    void Add(Drill drill);
    void Add(Training training);
    void Remove(Drill drill);
    void Remove(Training training);
    Task<List<Training>> ReferencingPlansAsync(Guid drillId, CancellationToken cancellationToken);
    Task<T> ExecuteAsync<T>(Func<Task<T>> operation, CancellationToken cancellationToken);
    Task SaveAsync(CancellationToken cancellationToken);
}

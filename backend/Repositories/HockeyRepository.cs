using HockeyTrainer.Api.Data;
using HockeyTrainer.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace HockeyTrainer.Api.Repositories;

public sealed class HockeyRepository : IHockeyRepository
{
    private readonly HockeyDbContext _db;

    public HockeyRepository(HockeyDbContext db)
    {
        _db = db;
    }

    public async Task<List<Drill>> GetDrillsAsync(string? search, string? categoryId, Guid organisationId, CancellationToken cancellationToken)
    {
        var query = _db.Drills.Where(d => d.OrganisationId == organisationId);
        if (!string.IsNullOrWhiteSpace(categoryId))
        {
            query = query.Where(d => d.CategoryId == categoryId);
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            query = query.Where(d => d.Title.ToLower().Contains(term) || d.Notes.ToLower().Contains(term));
        }
        return await query.OrderBy(d => d.Title).ToListAsync(cancellationToken);
    }

    public Task<Drill?> GetDrillAsync(Guid id, CancellationToken cancellationToken) => _db.Drills.SingleOrDefaultAsync(d => d.Id == id, cancellationToken);

    public Task<List<Training>> GetTrainingsAsync(Guid organisationId, CancellationToken cancellationToken) => _db.Trainings.Where(t => t.OrganisationId == organisationId).Include(t => t.Items).OrderBy(t => t.Title).ToListAsync(cancellationToken);

    public Task<Training?> GetTrainingAsync(Guid id, CancellationToken cancellationToken) => _db.Trainings.Include(t => t.Items).SingleOrDefaultAsync(t => t.Id == id, cancellationToken);

    public Task<bool> IsDrillReferencedAsync(Guid id, CancellationToken cancellationToken) => _db.TrainingEntries.AnyAsync(i => i.DrillId == id, cancellationToken);

    public async Task<bool> AllDrillsExistAsync(IEnumerable<Guid> ids, CancellationToken cancellationToken)
    {
        var uniqueIds = ids.Distinct().ToArray();
        return await _db.Drills.CountAsync(d => uniqueIds.Contains(d.Id), cancellationToken) == uniqueIds.Length;
    }

    public async Task<T> ExecuteAsync<T>(Func<Task<T>> operation, CancellationToken cancellationToken)
    {
        try
        {
            return await _db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                _db.ChangeTracker.Clear();
                await using var transaction = await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
                var result = await operation();
                await _db.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return result;
            });
        }
        catch (Exception error) when (error is DbUpdateConcurrencyException ||
            error is Microsoft.Data.Sqlite.SqliteException { SqliteErrorCode: 5 or 6 } ||
            error is DbUpdateException { InnerException: Microsoft.Data.Sqlite.SqliteException { SqliteErrorCode: 19 } } ||
            error is DbUpdateException { InnerException: Npgsql.PostgresException { SqlState: "23503" or "23514" } } ||
            error is DbUpdateException { InnerException: Npgsql.PostgresException { SqlState: "40001" or "40P01" } } ||
            error is Npgsql.PostgresException { SqlState: "40001" or "40P01" } ||
            error is Microsoft.EntityFrameworkCore.Storage.RetryLimitExceededException)
        {
            throw new HockeyTrainer.Api.Services.ApiException(409, "Content changed", "Another operation changed this content. Reload and try again.");
        }
    }

    public void Add(Drill drill) => _db.Drills.Add(drill);

    public void Add(Training training) => _db.Trainings.Add(training);

    public void Remove(Drill drill) => _db.Drills.Remove(drill);

    public void Remove(Training training) => _db.Trainings.Remove(training);

    public async Task SaveAsync(CancellationToken cancellationToken) => await _db.SaveChangesAsync(cancellationToken);
}

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

    public async Task<List<Drill>> GetDrillsAsync(string? search, string? categoryId, CancellationToken cancellationToken)
    {
        var query = _db.Drills.AsQueryable();
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

    public Task<List<Training>> GetTrainingsAsync(CancellationToken cancellationToken) => _db.Trainings.Include(t => t.Items).OrderBy(t => t.Title).ToListAsync(cancellationToken);

    public Task<Training?> GetTrainingAsync(Guid id, CancellationToken cancellationToken) => _db.Trainings.Include(t => t.Items).SingleOrDefaultAsync(t => t.Id == id, cancellationToken);

    public Task<bool> IsDrillReferencedAsync(Guid id, CancellationToken cancellationToken) => _db.TrainingEntries.AnyAsync(i => i.DrillId == id, cancellationToken);

    public async Task<bool> AllDrillsExistAsync(IEnumerable<Guid> ids, CancellationToken cancellationToken)
    {
        var uniqueIds = ids.Distinct().ToArray();
        return await _db.Drills.CountAsync(d => uniqueIds.Contains(d.Id), cancellationToken) == uniqueIds.Length;
    }

    public void Add(Drill drill) => _db.Drills.Add(drill);

    public void Add(Training training) => _db.Trainings.Add(training);

    public void Remove(Drill drill) => _db.Drills.Remove(drill);

    public void Remove(Training training) => _db.Trainings.Remove(training);

    public async Task SaveAsync(CancellationToken cancellationToken) => await _db.SaveChangesAsync(cancellationToken);
}

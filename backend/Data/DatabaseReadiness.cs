using Microsoft.EntityFrameworkCore;

namespace HockeyTrainer.Api.Data;

public sealed class DatabaseReadiness(HockeyDbContext database, ILogger<DatabaseReadiness> logger)
{
    public async Task<bool> IsReadyAsync(CancellationToken cancellationToken)
    {
        try
        {
            if (database.Database.IsSqlServer() &&
                (await database.Database.GetPendingMigrationsAsync(cancellationToken)).Any())
                return false;

            await database.Drills.AsNoTracking().Select(d => d.Id).Take(1).ToListAsync(cancellationToken);
            await database.Trainings.AsNoTracking().Select(t => t.Id).Take(1).ToListAsync(cancellationToken);
            await database.TrainingEntries.AsNoTracking().Select(i => i.Id).Take(1).ToListAsync(cancellationToken);
            return true;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            logger.LogWarning("Database readiness check failed ({ExceptionType}).", exception.GetType().Name);
            return false;
        }
    }
}

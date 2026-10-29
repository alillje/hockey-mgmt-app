using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace HockeyTrainer.Infrastructure.Data;

public sealed class DatabaseReadiness(HockeyDbContext database, ILogger<DatabaseReadiness> logger)
{
    public async Task<bool> IsReadyAsync(CancellationToken cancellationToken)
    {
        try
        {
            if (database.Database.IsNpgsql() &&
                (await database.Database.GetPendingMigrationsAsync(cancellationToken)).Any())
            {
                return false;
            }

            await database.BrowserSessions.AsNoTracking().Select(s => s.IdHash).Take(1).ToListAsync(cancellationToken);
            await database.Drills.AsNoTracking().Select(d => d.Id).Take(1).ToListAsync(cancellationToken);
            await database.Trainings.AsNoTracking().Select(t => t.Id).Take(1).ToListAsync(cancellationToken);
            await database.TrainingEntries.AsNoTracking().Select(i => i.Id).Take(1).ToListAsync(cancellationToken);
            await database.Organisations.AsNoTracking().Select(o => o.Id).Take(1).ToListAsync(cancellationToken);
            await database.OrganisationMembers.AsNoTracking().Select(m => m.UserId).Take(1).ToListAsync(cancellationToken);
            await database.Teams.AsNoTracking().Select(t => t.Id).Take(1).ToListAsync(cancellationToken);
            await database.TeamMembers.AsNoTracking().Select(m => m.UserId).Take(1).ToListAsync(cancellationToken);
            await database.UserPreferences.AsNoTracking().Select(p => p.UserId).Take(1).ToListAsync(cancellationToken);
            await database.AgeGroups.AsNoTracking().Select(group => group.Id).Take(1).ToListAsync(cancellationToken);

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

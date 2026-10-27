using HockeyTrainer.Infrastructure.Data;
using HockeyTrainer.Domain.Models;
using HockeyTrainer.Application.Repositories;
using Microsoft.EntityFrameworkCore;

namespace HockeyTrainer.Infrastructure.Repositories;

public sealed class AccountRepository(HockeyDbContext database) : IAccountRepository
{
    public Task<UserPreferences?> GetAsync(Guid userId, CancellationToken ct) =>
        database.UserPreferences.SingleOrDefaultAsync(p => p.UserId == userId, ct);

    public async Task SaveAsync(Guid userId, Guid? teamId, CancellationToken ct)
    {
        // Upsert one user's preference without accepting a client-supplied user ID.
        if (database.Database.IsNpgsql())
        {
            await database.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO hockey."UserPreferences" ("UserId", "DefaultTeamId") VALUES ({userId}, {teamId})
                ON CONFLICT ("UserId") DO UPDATE SET "DefaultTeamId" = EXCLUDED."DefaultTeamId"
                """, ct);
        }
        else
        {
            await database.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO "UserPreferences" ("UserId", "DefaultTeamId") VALUES ({userId}, {teamId})
                ON CONFLICT ("UserId") DO UPDATE SET "DefaultTeamId" = EXCLUDED."DefaultTeamId"
                """, ct);
        }
    }
}

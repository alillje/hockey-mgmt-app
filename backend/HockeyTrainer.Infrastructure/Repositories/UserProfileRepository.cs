using HockeyTrainer.Application.Repositories;
using HockeyTrainer.Domain.Models;
using HockeyTrainer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace HockeyTrainer.Infrastructure.Repositories;

public sealed class UserProfileRepository(HockeyDbContext db) : IUserProfileRepository
{
    public Task<UserProfile?> FindAsync(Guid userId, CancellationToken ct) =>
        db.UserProfiles.AsNoTracking().SingleOrDefaultAsync(profile => profile.UserId == userId, ct);

    public Task<List<UserProfile>> GetManyAsync(IEnumerable<Guid> userIds, CancellationToken ct) =>
        db.UserProfiles.AsNoTracking().Where(profile => userIds.Contains(profile.UserId)).ToListAsync(ct);

    public Task SaveAsync(UserProfile profile, CancellationToken ct)
    {
        if (db.Database.IsNpgsql())
        {
            return db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO hockey."UserProfiles" ("UserId", "FirstName", "LastName", "Email")
                VALUES ({profile.UserId}, {profile.FirstName}, {profile.LastName}, {profile.Email})
                ON CONFLICT ("UserId") DO UPDATE SET "FirstName" = EXCLUDED."FirstName",
                    "LastName" = EXCLUDED."LastName", "Email" = EXCLUDED."Email";
                """, ct);
        }

        return db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "UserProfiles" ("UserId", "FirstName", "LastName", "Email")
            VALUES ({profile.UserId}, {profile.FirstName}, {profile.LastName}, {profile.Email})
            ON CONFLICT ("UserId") DO UPDATE SET "FirstName" = EXCLUDED."FirstName",
                "LastName" = EXCLUDED."LastName", "Email" = EXCLUDED."Email";
            """, ct);
    }
}

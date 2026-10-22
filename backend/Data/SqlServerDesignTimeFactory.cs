using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace HockeyTrainer.Api.Data;

// EF tooling always targets SQL Server. SQLite retains its existing data upgrades.
// The placeholder allows offline migration/script generation without credentials.
public sealed class SqlServerDesignTimeFactory : IDesignTimeDbContextFactory<HockeyDbContext>
{
    public HockeyDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<HockeyDbContext>()
            .UseSqlServer("Server=localhost;Database=HockeyMigrationDesign;Integrated Security=True;Encrypt=True",
                sql => sql.EnableRetryOnFailure(12, TimeSpan.FromSeconds(10), [40615]))
            .Options;
        return new HockeyDbContext(options);
    }
}

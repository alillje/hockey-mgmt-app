using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace HockeyTrainer.Api.Data;

// Hosted migrations target PostgreSQL; SQLite retains its existing local upgrades.
// The fallback supports offline generation. Deployment supplies the migration secret
// through the environment so credentials never appear in process arguments.
public sealed class PostgreSqlDesignTimeFactory : IDesignTimeDbContextFactory<HockeyDbContext>
{
    public HockeyDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__Hockey")
            ?? "Host=localhost;Database=hockey_migration_design;Username=postgres";
        connectionString = DatabaseConfiguration.ResolvePostgreSqlCertificate(connectionString, Directory.GetCurrentDirectory(),
            Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Development");
        var options = new DbContextOptionsBuilder<HockeyDbContext>()
            .UseNpgsql(connectionString,
                postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", DatabaseConfiguration.MigrationHistorySchema).EnableRetryOnFailure())
            .Options;
        return new HockeyDbContext(options);
    }
}

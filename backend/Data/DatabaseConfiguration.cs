using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace HockeyTrainer.Api.Data;

public static class DatabaseConfiguration
{
    public const string ApplicationSchema = "hockey";
    public const string MigrationHistorySchema = "hockey_migrations";

    public static IServiceCollection AddHockeyDatabase(this IServiceCollection services,
        IConfiguration configuration, IHostEnvironment environment)
    {
        var provider = configuration["Database:Provider"] ?? "Sqlite";
        if (provider.Equals("PostgreSql", StringComparison.OrdinalIgnoreCase))
        {
            var connectionString = configuration.GetConnectionString("Hockey");
            if (string.IsNullOrWhiteSpace(connectionString))
                throw new InvalidOperationException("PostgreSql requires ConnectionStrings:Hockey.");

            var resolvedConnectionString = ResolvePostgreSqlCertificate(connectionString, environment.ContentRootPath);
            services.AddDbContext<HockeyDbContext>(options => options.UseNpgsql(resolvedConnectionString,
                postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", MigrationHistorySchema).EnableRetryOnFailure()));
        }
        else if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            var path = configuration["DatabasePath"] ?? "App_Data/hockey.db";
            if (!Path.IsPathRooted(path)) path = Path.Combine(environment.ContentRootPath, path);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var connectionString = new SqliteConnectionStringBuilder { DataSource = path }.ToString();
            services.AddDbContext<HockeyDbContext>(options => options.UseSqlite(connectionString));
        }
        else
        {
            throw new InvalidOperationException("Database:Provider must be Sqlite or PostgreSql.");
        }

        return services;
    }

    public static string ResolvePostgreSqlCertificate(string connectionString, string basePath)
    {
        var connection = new NpgsqlConnectionStringBuilder(connectionString);
        if (!string.IsNullOrWhiteSpace(connection.RootCertificate) && !Path.IsPathRooted(connection.RootCertificate))
            connection.RootCertificate = Path.GetFullPath(connection.RootCertificate, basePath);
        return connection.ConnectionString;
    }
}

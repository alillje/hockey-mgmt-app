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
            {
                throw new InvalidOperationException("PostgreSql requires ConnectionStrings:Hockey.");
            }

            var resolvedConnectionString = ResolvePostgreSqlCertificate(connectionString, environment.ContentRootPath,
                environment.EnvironmentName);
            services.AddDbContext<HockeyDbContext>(options => options.UseNpgsql(resolvedConnectionString,
                postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", MigrationHistorySchema).EnableRetryOnFailure()));
        }
        else if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            var path = configuration["DatabasePath"] ?? "App_Data/hockey.db";
            if (!Path.IsPathRooted(path))
            {
                path = Path.Combine(environment.ContentRootPath, path);
            }

            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var connectionBuilder = new SqliteConnectionStringBuilder
            {
                DataSource = path
            };
            var connectionString = connectionBuilder.ToString();
            services.AddDbContext<HockeyDbContext>(options => options.UseSqlite(connectionString));
        }
        else
        {
            throw new InvalidOperationException("Database:Provider must be Sqlite or PostgreSql.");
        }

        return services;
    }

    public static string ResolvePostgreSqlCertificate(string connectionString, string basePath, string environmentName)
    {
        var connection = new NpgsqlConnectionStringBuilder(connectionString);
        if (!string.IsNullOrWhiteSpace(connection.RootCertificate))
        {
            if (!Path.IsPathRooted(connection.RootCertificate))
            {
                connection.RootCertificate = Path.GetFullPath(connection.RootCertificate, basePath);
            }
        }
        else if (connection.SslMode == SslMode.VerifyFull &&
                 (environmentName.Equals("Staging", StringComparison.OrdinalIgnoreCase) ||
                  environmentName.Equals("Production", StringComparison.OrdinalIgnoreCase)))
        {
            var certificateName = environmentName.Equals("Staging", StringComparison.OrdinalIgnoreCase)
                ? "supabase-stage-root.crt"
                : "supabase-prod-root.crt";
            var certificatePath = Path.Combine(basePath, "Certificates", certificateName);
            if (!File.Exists(certificatePath))
            {
                throw new FileNotFoundException($"The {environmentName} database CA certificate is missing from the application package.", certificatePath);
            }

            connection.RootCertificate = certificatePath;
        }

        return connection.ConnectionString;
    }
}

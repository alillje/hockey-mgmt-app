using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace HockeyTrainer.Api.Data;

public static class DatabaseConfiguration
{
    public static IServiceCollection AddHockeyDatabase(this IServiceCollection services,
        IConfiguration configuration, IHostEnvironment environment)
    {
        var provider = configuration["Database:Provider"] ?? "Sqlite";
        if (provider.Equals("SqlServer", StringComparison.OrdinalIgnoreCase))
        {
            var connectionString = configuration.GetConnectionString("Hockey");
            if (string.IsNullOrWhiteSpace(connectionString))
                throw new InvalidOperationException("SqlServer requires ConnectionStrings:Hockey.");

            services.AddDbContext<HockeyDbContext>(options => options.UseSqlServer(connectionString,
                sql => sql.EnableRetryOnFailure()));
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
            throw new InvalidOperationException("Database:Provider must be Sqlite or SqlServer.");
        }

        return services;
    }
}

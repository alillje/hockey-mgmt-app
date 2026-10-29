using HockeyTrainer.Application.Authentication;
using HockeyTrainer.Application.Configuration;
using HockeyTrainer.Application.Services;
using HockeyTrainer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Npgsql;

namespace HockeyTrainer.Infrastructure.Repositories;

public sealed class SupabaseAuthUserDirectory(
    HockeyDbContext database,
    IOptions<AuthUserDirectoryOptions> options,
    IHostEnvironment environment,
    ILogger<SupabaseAuthUserDirectory> logger) : IAuthUserDirectory
{
    public async Task<Guid?> FindByEmailAsync(string normalizedEmail, CancellationToken ct)
    {
        var connectionString = database.Database.IsNpgsql()
            ? database.Database.GetConnectionString()
            : options.Value.ConnectionString;
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new ApiException(503, "User lookup is not configured",
                "Email lookup needs a Supabase database connection. Configure Auth:UserDirectory:ConnectionString for the local SQLite workspace.");
        }

        try
        {
            var resolved = DatabaseConfiguration.ResolvePostgreSqlCertificate(connectionString, environment.ContentRootPath,
                environment.EnvironmentName);
            await using var connection = new NpgsqlConnection(resolved);
            await connection.OpenAsync(ct);
            // Fixed identifiers and a bound value: never interpolate the submitted email into SQL.
            await using var command = new NpgsqlCommand("""
                SELECT id FROM auth.users
                WHERE lower(email) = @email AND deleted_at IS NULL
                LIMIT 2
                """, connection);
            command.Parameters.AddWithValue("email", normalizedEmail);
            await using var reader = await command.ExecuteReaderAsync(ct);
            if (!await reader.ReadAsync(ct))
            {
                return null;
            }
            var userId = reader.GetGuid(0);
            if (await reader.ReadAsync(ct))
            {
                throw new ApiException(409, "Email matches multiple users",
                    "This email matches multiple registered users. Resolve the duplicate accounts in Supabase before adding access.");
            }

            return userId;
        }
        catch (Exception exception) when (exception is NpgsqlException or TimeoutException or ArgumentException or IOException)
        {
            // Do not log submitted emails, database credentials or provider error details.
            logger.LogWarning("Supabase user lookup failed ({ExceptionType}).", exception.GetType().Name);
            throw new ApiException(503, "User lookup unavailable", "Could not check registered users. Please try again shortly.");
        }
    }
}

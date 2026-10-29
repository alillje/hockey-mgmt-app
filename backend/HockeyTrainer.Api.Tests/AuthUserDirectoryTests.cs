using HockeyTrainer.Application.Configuration;
using HockeyTrainer.Application.Services;
using HockeyTrainer.Infrastructure.Data;
using HockeyTrainer.Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Npgsql;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed class AuthUserDirectoryTests
{
    [Fact]
    public async Task LocalLookupWithoutConnectionFailsWithSetupMessage()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var scope = app.Services.CreateScope();
        var directory = new SupabaseAuthUserDirectory(
            scope.ServiceProvider.GetRequiredService<HockeyDbContext>(),
            Options.Create(new AuthUserDirectoryOptions()),
            scope.ServiceProvider.GetRequiredService<IHostEnvironment>(),
            NullLogger<SupabaseAuthUserDirectory>.Instance);
        var error = await Assert.ThrowsAsync<ApiException>(() => directory.FindByEmailAsync("coach@example.com", default));
        Assert.Equal(503, error.StatusCode);
        Assert.Contains("Auth:UserDirectory:ConnectionString", error.Message);
    }

    [PostgreSqlFact]
    public async Task ParameterizedLookupFindsOnlyExactActiveEmailAndRejectsAmbiguity()
    {
        var name = "hockey_directory_" + Guid.NewGuid().ToString("N");
        var settings = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("HOCKEY_POSTGRES_TEST_CONNECTION"));
        await using var admin = new NpgsqlConnection(new NpgsqlConnectionStringBuilder(settings.ConnectionString)
        {
            Database = "postgres"
        }.ConnectionString);
        await admin.OpenAsync();
        // The generated identifier is entirely test-owned; this never targets a hosted Auth schema.
        await using (var create = new NpgsqlCommand($"CREATE DATABASE {name}", admin))
        {
            await create.ExecuteNonQueryAsync();
        }
        try
        {
            settings.Database = name;
            var userId = Guid.NewGuid();
            await using (var setup = new NpgsqlConnection(settings.ConnectionString))
            {
                await setup.OpenAsync();
                await using var schema = new NpgsqlCommand("""
                    CREATE SCHEMA auth;
                    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, deleted_at timestamptz);
                    """, setup);
                await schema.ExecuteNonQueryAsync();
                await using var insert = new NpgsqlCommand("""
                    INSERT INTO auth.users VALUES (@id, 'Coach@Example.com', NULL),
                        (gen_random_uuid(), 'deleted@example.com', now()),
                        (gen_random_uuid(), 'duplicate@example.com', NULL),
                        (gen_random_uuid(), 'DUPLICATE@example.com', NULL);
                    """, setup);
                insert.Parameters.AddWithValue("id", userId);
                await insert.ExecuteNonQueryAsync();
            }
            using var app = new AuthenticationTests.AuthenticatedApplication();
            using var scope = app.Services.CreateScope();
            var environment = scope.ServiceProvider.GetRequiredService<IHostEnvironment>();
            var logger = NullLogger<SupabaseAuthUserDirectory>.Instance;
            var localDirectory = new SupabaseAuthUserDirectory(
                scope.ServiceProvider.GetRequiredService<HockeyDbContext>(),
                Options.Create(new AuthUserDirectoryOptions
                {
                    ConnectionString = settings.ConnectionString
                }), environment, logger);
            Assert.Equal(userId, await localDirectory.FindByEmailAsync("coach@example.com", default));
            Assert.Null(await localDirectory.FindByEmailAsync("deleted@example.com", default));
            Assert.Null(await localDirectory.FindByEmailAsync("missing@example.com", default));
            Assert.Null(await localDirectory.FindByEmailAsync("' OR true --", default));
            var ambiguous = await Assert.ThrowsAsync<ApiException>(() => localDirectory.FindByEmailAsync("duplicate@example.com", default));
            Assert.Equal(409, ambiguous.StatusCode);

            using var postgres = new HockeyDbContext(new DbContextOptionsBuilder<HockeyDbContext>().UseNpgsql(settings.ConnectionString).Options);
            var hostedDirectory = new SupabaseAuthUserDirectory(postgres,
                Options.Create(new AuthUserDirectoryOptions()), environment, logger);
            Assert.Equal(userId, await hostedDirectory.FindByEmailAsync("coach@example.com", default));
        }
        finally
        {
            await using var drop = new NpgsqlCommand($"DROP DATABASE {name} WITH (FORCE)", admin);
            await drop.ExecuteNonQueryAsync();
        }
    }
}

using System.Net;
using System.Net.Http.Json;
using HockeyTrainer.Application.Contracts;
using HockeyTrainer.Infrastructure.Data;
using HockeyTrainer.Domain.Models;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed class PostgreSqlTests
{
    [Fact]
    public void PostgreSqlModelMatchesReviewedMigrationsAndProducesIdempotentSql()
    {
        using var database = new PostgreSqlDesignTimeFactory().CreateDbContext([]);
        Assert.False(database.Database.HasPendingModelChanges());
        Assert.Equal(5, database.Database.GetMigrations().Count());
        Assert.All(database.Model.GetEntityTypes(), entity => Assert.Equal("hockey", entity.GetSchema()));
        var script = database.GetService<IMigrator>().GenerateScript(options: MigrationsSqlGenerationOptions.Idempotent);
        Assert.Contains("CREATE TABLE hockey.\"Drills\"", script);
        Assert.Contains("CREATE TABLE hockey.\"Trainings\"", script);
        Assert.Contains("CREATE TABLE hockey.\"TrainingEntries\"", script);
        Assert.Contains("IF NOT EXISTS", script);
        Assert.DoesNotContain("DROP TABLE", script);
        Assert.Contains("training_entry_workspace", script);
    }

    [PostgreSqlFact]
    [Trait("Category", "PostgreSql")]
    public async Task ReviewedMigrationsAndApiPreserveOrderedPracticesAcrossRestart()
    {
        var databaseName = "hockey_tests_" + Guid.NewGuid().ToString("N");
        var admin = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("HOCKEY_POSTGRES_TEST_CONNECTION"))
        {
            Database = "postgres"
        };
        await using var connection = new NpgsqlConnection(admin.ConnectionString);
        // A fresh CI service container may still be starting when the test begins.
        for (var attempt = 0; ; attempt++)
        {
            try { await connection.OpenAsync(); break; }
            catch (NpgsqlException) when (attempt < 15) { await Task.Delay(TimeSpan.FromSeconds(2)); }
        }

        await ExecuteAsync(connection, $"CREATE DATABASE \"{databaseName}\"");
        var migrationRole = "migration_" + Guid.NewGuid().ToString("N");
        var runtimeRole = "runtime_" + Guid.NewGuid().ToString("N");
        // Disposable CI-only roles: never use hosted Supabase credentials in these tests.
        const string testPassword = "Hockey_test_Only_123!";
        var target = new NpgsqlConnectionStringBuilder(admin.ConnectionString) { Database = databaseName };
        var migrationTarget = new NpgsqlConnectionStringBuilder(target.ConnectionString)
        {
            Username = migrationRole,
            Password = testPassword
        };
        var runtimeTarget = new NpgsqlConnectionStringBuilder(target.ConnectionString)
        {
            Username = runtimeRole,
            Password = testPassword
        };
        try
        {
            await ExecuteAsync(connection, $"CREATE ROLE {migrationRole} LOGIN PASSWORD '{testPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT");
            await ExecuteAsync(connection, $"CREATE ROLE {runtimeRole} LOGIN PASSWORD '{testPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT");
            await using (var setup = new NpgsqlConnection(target.ConnectionString))
            {
                await setup.OpenAsync();
                await ExecuteAsync(setup, $"""
                    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
                    CREATE SCHEMA hockey AUTHORIZATION {migrationRole};
                    CREATE SCHEMA hockey_migrations AUTHORIZATION {migrationRole};
                    GRANT USAGE ON SCHEMA hockey, hockey_migrations TO {runtimeRole};
                    ALTER DEFAULT PRIVILEGES FOR ROLE {migrationRole} IN SCHEMA hockey
                        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {runtimeRole};
                    ALTER DEFAULT PRIVILEGES FOR ROLE {migrationRole} IN SCHEMA hockey
                        GRANT USAGE, SELECT ON SEQUENCES TO {runtimeRole};
                    ALTER DEFAULT PRIVILEGES FOR ROLE {migrationRole} IN SCHEMA hockey_migrations
                        GRANT SELECT ON TABLES TO {runtimeRole};
                    """);
            }

            using (var application = new PostgreSqlApplication(runtimeTarget.ConnectionString))
            using (var client = application.CreateClient())
            {
                Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/health")).StatusCode);
                Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/api/readiness")).StatusCode);
            }

            await using (var database = new HockeyDbContext(new DbContextOptionsBuilder<HockeyDbContext>()
                .UseNpgsql(target.ConnectionString, postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", DatabaseConfiguration.MigrationHistorySchema)).Options))
            {
                var script = database.GetService<IMigrator>().GenerateScript(options: MigrationsSqlGenerationOptions.Idempotent);
                await using var migrationConnection = new NpgsqlConnection(migrationTarget.ConnectionString);
                await migrationConnection.OpenAsync();
                // Execute the same reviewed deployment SQL twice to verify idempotence.
                await ExecuteAsync(migrationConnection, script);
                await ExecuteAsync(migrationConnection, script);
                Assert.Empty(await database.Database.GetPendingMigrationsAsync());
                Assert.Empty(await database.Drills.ToListAsync());
            }

            await using (var runtime = new NpgsqlConnection(runtimeTarget.ConnectionString))
            {
                await runtime.OpenAsync();
                var ddl = await Assert.ThrowsAsync<PostgresException>(() => ExecuteAsync(runtime,
                    "CREATE TABLE hockey.unauthorized (id integer)"));
                Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, ddl.SqlState);
                var history = await Assert.ThrowsAsync<PostgresException>(() => ExecuteAsync(runtime,
                    "DELETE FROM hockey_migrations.\"__EFMigrationsHistory\""));
                Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, history.SqlState);
            }

            Guid drillId;
            Guid practiceId;
            using (var application = new PostgreSqlApplication(runtimeTarget.ConnectionString))
            using (var client = application.CreateClient())
            {
                Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/readiness")).StatusCode);
                var request = new DrillRequest("PostgreSQL skating åäö", "skating", "Coaching notes", new Diagram(1,
                    [new DiagramObject(Guid.NewGuid().ToString(), "goal", 100, 200, 270, "#ef4444")], []), ["Skating", "Passing"]);
                var create = await client.PostAsJsonAsync("/api/drills", request);
                Assert.Equal(HttpStatusCode.Created, create.StatusCode);
                var drill = (await create.Content.ReadFromJsonAsync<DrillResponse>())!;
                drillId = drill.Id;
                var practice = await client.PostAsJsonAsync("/api/trainings", new TrainingRequest("PostgreSQL practice", "Notes",
                    [new TrainingItem(drillId, 10, "First"), new TrainingItem(drillId, 20, "Repeat")], ["Passing"]));
                Assert.Equal(HttpStatusCode.Created, practice.StatusCode);
                practiceId = (await practice.Content.ReadFromJsonAsync<TrainingResponse>())!.Id;
                Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync($"/api/drills/{drillId}")).StatusCode);
                var update = await client.PutAsJsonAsync($"/api/drills/{drillId}", request with { Notes = "Updated notes" });
                Assert.Equal(HttpStatusCode.OK, update.StatusCode);
                var reorder = await client.PutAsJsonAsync($"/api/trainings/{practiceId}", new TrainingRequest("PostgreSQL practice", "Notes",
                    [new TrainingItem(drillId, 20, "Repeat"), new TrainingItem(drillId, 10, "First")], ["Passing"]));
                Assert.Equal(HttpStatusCode.OK, reorder.StatusCode);

                var libraryResponse = await client.PostAsync($"/api/trainings/{practiceId}/copy-to-library", null);
                Assert.Equal(HttpStatusCode.OK, libraryResponse.StatusCode);
                var library = (await libraryResponse.Content.ReadFromJsonAsync<TrainingResponse>())!;
                Assert.Null(library.Ownership!.OwnerTeamId);
                Assert.Equal(library.Items[0].DrillId, library.Items[1].DrillId);
                Assert.NotEqual(drillId, library.Items[0].DrillId);
                var destination = (await (await client.PostAsJsonAsync("/api/workspace/teams", new TeamRequest("Copy destination"))).Content.ReadFromJsonAsync<TeamResponse>())!;
                client.DefaultRequestHeaders.Add("X-Organisation-Id", WorkspaceDefaults.OrganisationId.ToString());
                client.DefaultRequestHeaders.Add("X-Team-Id", destination.Id.ToString());
                var copiedResponse = await client.PostAsync($"/api/trainings/{library.Id}/copy-to-team", null);
                Assert.Equal(HttpStatusCode.OK, copiedResponse.StatusCode);
                var copied = (await copiedResponse.Content.ReadFromJsonAsync<TrainingResponse>())!;
                Assert.Equal(destination.Id, copied.Ownership!.OwnerTeamId);
                Assert.NotEqual(library.Items[0].DrillId, copied.Items[0].DrillId);
                Assert.Equal(copied.Items[0].DrillId, copied.Items[1].DrillId);
                Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/trainings", new TrainingRequest("Cross reference", "", [new(library.Items[0].DrillId, 10)]))).StatusCode);
                Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/trainings/{copied.Id}")).StatusCode);
                Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/drills/{copied.Items[0].DrillId}")).StatusCode);
                client.DefaultRequestHeaders.Remove("X-Organisation-Id");
                client.DefaultRequestHeaders.Remove("X-Team-Id");

            }

            await using (var database = new HockeyDbContext(new DbContextOptionsBuilder<HockeyDbContext>()
                .UseNpgsql(target.ConnectionString, postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", DatabaseConfiguration.MigrationHistorySchema)).Options))
            {
                var script = database.GetService<IMigrator>().GenerateScript(options: MigrationsSqlGenerationOptions.Idempotent);
                await using var migrationConnection = new NpgsqlConnection(migrationTarget.ConnectionString);
                await migrationConnection.OpenAsync();
                await ExecuteAsync(migrationConnection, script);
            }

            using (var application = new PostgreSqlApplication(runtimeTarget.ConnectionString))
            using (var client = application.CreateClient())
            {
                var drill = (await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{drillId}"))!;
                Assert.Equal("Updated notes", drill.Notes);
                Assert.Equal(270, Assert.Single(drill.Diagram.Objects).Rotation);
                Assert.Equal(new[] { "Skating", "Passing" }, drill.Tags);
                var practice = (await client.GetFromJsonAsync<TrainingResponse>($"/api/trainings/{practiceId}"))!;
                Assert.Equal(new[] { "Repeat", "First" }, practice.Items.Select(i => i.Notes));
                Assert.Equal(new[] { 20, 10 }, practice.Items.Select(i => i.DurationMinutes));
                var matching = (await client.GetFromJsonAsync<List<DrillResponse>>("/api/drills?search=åäö&tag=Passing"))!;
                Assert.Equal(2, matching.Count);
                Assert.Contains(matching, d => d.Id == drillId && d.Ownership!.OwnerTeamId == WorkspaceDefaults.TeamId);
                Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/trainings/{practiceId}")).StatusCode);
                Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/drills/{drillId}")).StatusCode);
            }
        }
        finally
        {
            NpgsqlConnection.ClearAllPools();
            await ExecuteAsync(connection, $"DROP DATABASE \"{databaseName}\" WITH (FORCE)");
            await ExecuteAsync(connection, $"DROP ROLE IF EXISTS {runtimeRole}; DROP ROLE IF EXISTS {migrationRole};");
        }
    }

    private static async Task ExecuteAsync(NpgsqlConnection connection, string sql)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.CommandTimeout = 120;
        await command.ExecuteNonQueryAsync();
    }

    private sealed class PostgreSqlApplication(string connectionString) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseSetting("Database:Provider", "PostgreSql");
            builder.UseSetting("ConnectionStrings:Hockey", connectionString);
        }
    }
}

public sealed class PostgreSqlFactAttribute : FactAttribute
{
    public PostgreSqlFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("HOCKEY_POSTGRES_TEST_CONNECTION")))
        {
            Skip = "Set HOCKEY_POSTGRES_TEST_CONNECTION to run against a disposable PostgreSQL database (required in CI).";
        }
    }
}

using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Data;
using HockeyTrainer.Database;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed class SqlServerTests
{
    [Fact]
    public void SqlServerModelMatchesReviewedMigrationsAndProducesIdempotentSql()
    {
        using var database = new SqlServerDesignTimeFactory().CreateDbContext([]);
        Assert.False(database.Database.HasPendingModelChanges());
        Assert.Single(database.Database.GetMigrations());
        var script = database.GetService<IMigrator>().GenerateScript(options: MigrationsSqlGenerationOptions.Idempotent);
        Assert.Contains("CREATE TABLE [Drills]", script);
        Assert.Contains("CREATE TABLE [Trainings]", script);
        Assert.Contains("CREATE TABLE [TrainingEntries]", script);
        Assert.Contains("IF NOT EXISTS", script);
        Assert.DoesNotContain("DROP TABLE", script);
    }

    [SqlServerFact]
    [Trait("Category", "SqlServer")]
    public async Task ReviewedMigrationsAndApiPreserveOrderedPracticesAcrossRestart()
    {
        var databaseName = "HockeyTests_" + Guid.NewGuid().ToString("N");
        var admin = new SqlConnectionStringBuilder(Environment.GetEnvironmentVariable("HOCKEY_SQLSERVER_TEST_CONNECTION"))
        {
            InitialCatalog = "master"
        };
        await using var connection = new SqlConnection(admin.ConnectionString);
        // A fresh CI service container may still be starting when the test begins.
        for (var attempt = 0; ; attempt++)
        {
            try { await connection.OpenAsync(); break; }
            catch (SqlException) when (attempt < 15) { await Task.Delay(TimeSpan.FromSeconds(2)); }
        }

        await ExecuteAsync(connection, $"CREATE DATABASE [{databaseName}]");
        var target = new SqlConnectionStringBuilder(admin.ConnectionString) { InitialCatalog = databaseName };
        try
        {
            using (var application = new SqlApplication(target.ConnectionString))
            using (var client = application.CreateClient())
            {
                Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/health")).StatusCode);
                Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/api/readiness")).StatusCode);
            }

            await using (var database = new HockeyDbContext(new DbContextOptionsBuilder<HockeyDbContext>()
                .UseSqlServer(target.ConnectionString).Options))
            {
                var script = database.GetService<IMigrator>().GenerateScript(options: MigrationsSqlGenerationOptions.Idempotent);
                await using var migrationConnection = new SqlConnection(target.ConnectionString);
                await migrationConnection.OpenAsync();
                // Exercise initial schema creation with the deployment role rather than SA permissions.
                await ExecuteAsync(migrationConnection, SqlScripts.MigrationRole + """

                    CREATE USER [migration_permission_test] WITHOUT LOGIN;
                    ALTER ROLE hockey_migrator ADD MEMBER [migration_permission_test];
                    EXECUTE AS USER = 'migration_permission_test';
                    """);
                // Exercise the same reviewed SQL artifact twice: applying it again must preserve data/schema.
                foreach (var batch in Regex.Split(script, @"^GO\s*$", RegexOptions.Multiline | RegexOptions.IgnoreCase))
                    if (!string.IsNullOrWhiteSpace(batch)) await ExecuteAsync(migrationConnection, batch);
                await Assert.ThrowsAsync<SqlException>(() => ExecuteAsync(migrationConnection,
                    "CREATE USER [not_permitted] WITHOUT LOGIN;"));
                await ExecuteAsync(migrationConnection, "REVERT;");
                Assert.Empty(await database.Database.GetPendingMigrationsAsync());
                Assert.Empty(await database.Drills.ToListAsync());
            }

            Guid drillId;
            Guid practiceId;
            using (var application = new SqlApplication(target.ConnectionString))
            using (var client = application.CreateClient())
            {
                Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/readiness")).StatusCode);
                var request = new DrillRequest("SQL skating åäö", "skating", "Coaching notes", new Diagram(1,
                    [new DiagramObject(Guid.NewGuid().ToString(), "goal", 100, 200, 270, "#ef4444")], []), ["Skating", "Passing"]);
                var create = await client.PostAsJsonAsync("/api/drills", request);
                Assert.Equal(HttpStatusCode.Created, create.StatusCode);
                var drill = (await create.Content.ReadFromJsonAsync<DrillResponse>())!;
                drillId = drill.Id;
                var practice = await client.PostAsJsonAsync("/api/trainings", new TrainingRequest("SQL practice", "Notes",
                    [new TrainingItem(drillId, 10, "First"), new TrainingItem(drillId, 20, "Repeat")], ["Passing"]));
                Assert.Equal(HttpStatusCode.Created, practice.StatusCode);
                practiceId = (await practice.Content.ReadFromJsonAsync<TrainingResponse>())!.Id;
                Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync($"/api/drills/{drillId}")).StatusCode);
                var update = await client.PutAsJsonAsync($"/api/drills/{drillId}", request with { Notes = "Updated notes" });
                Assert.Equal(HttpStatusCode.OK, update.StatusCode);
                var reorder = await client.PutAsJsonAsync($"/api/trainings/{practiceId}", new TrainingRequest("SQL practice", "Notes",
                    [new TrainingItem(drillId, 20, "Repeat"), new TrainingItem(drillId, 10, "First")], ["Passing"]));
                Assert.Equal(HttpStatusCode.OK, reorder.StatusCode);
            }

            await using (var database = new HockeyDbContext(new DbContextOptionsBuilder<HockeyDbContext>()
                .UseSqlServer(target.ConnectionString).Options))
            {
                var script = database.GetService<IMigrator>().GenerateScript(options: MigrationsSqlGenerationOptions.Idempotent);
                await using var migrationConnection = new SqlConnection(target.ConnectionString);
                await migrationConnection.OpenAsync();
                foreach (var batch in Regex.Split(script, @"^GO\s*$", RegexOptions.Multiline | RegexOptions.IgnoreCase))
                    if (!string.IsNullOrWhiteSpace(batch)) await ExecuteAsync(migrationConnection, batch);
            }

            using (var application = new SqlApplication(target.ConnectionString))
            using (var client = application.CreateClient())
            {
                var drill = (await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{drillId}"))!;
                Assert.Equal("Updated notes", drill.Notes);
                Assert.Equal(270, Assert.Single(drill.Diagram.Objects).Rotation);
                Assert.Equal(new[] { "Skating", "Passing" }, drill.Tags);
                var practice = (await client.GetFromJsonAsync<TrainingResponse>($"/api/trainings/{practiceId}"))!;
                Assert.Equal(new[] { "Repeat", "First" }, practice.Items.Select(i => i.Notes));
                Assert.Equal(new[] { 20, 10 }, practice.Items.Select(i => i.DurationMinutes));
                Assert.Single((await client.GetFromJsonAsync<List<DrillResponse>>("/api/drills?search=åäö&tag=Passing"))!);
                Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/trainings/{practiceId}")).StatusCode);
                Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/drills/{drillId}")).StatusCode);
            }
        }
        finally
        {
            SqlConnection.ClearAllPools();
            await ExecuteAsync(connection, $"ALTER DATABASE [{databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{databaseName}]");
        }
    }

    private static async Task ExecuteAsync(SqlConnection connection, string sql)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.CommandTimeout = 120;
        await command.ExecuteNonQueryAsync();
    }

    private sealed class SqlApplication(string connectionString) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseSetting("Database:Provider", "SqlServer");
            builder.UseSetting("ConnectionStrings:Hockey", connectionString);
        }
    }
}

public sealed class SqlServerFactAttribute : FactAttribute
{
    public SqlServerFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("HOCKEY_SQLSERVER_TEST_CONNECTION")))
            Skip = "Set HOCKEY_SQLSERVER_TEST_CONNECTION to run against a disposable SQL Server database (required in CI).";
    }
}

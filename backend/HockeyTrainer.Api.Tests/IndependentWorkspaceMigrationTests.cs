using HockeyTrainer.Api.Data;
using HockeyTrainer.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed class IndependentWorkspaceMigrationTests
{
    [Fact]
    public async Task SqliteMigrationPreservesContentRepairsReferencesAndIsRepeatable()
    {
        await using var db = new HockeyDbContext(new DbContextOptionsBuilder<HockeyDbContext>().UseSqlite("Data Source=:memory:").Options);
        await db.Database.OpenConnectionAsync();
        await db.Database.EnsureCreatedAsync();
        await AddLegacyVisibilityAsync(db);
        var source = await SeedAsync(db);
        await IndependentWorkspaceUpgrade.ApplySqliteAsync(db, default);
        await VerifyAsync(db, source);
        await IndependentWorkspaceUpgrade.ApplySqliteAsync(db, default);
        await VerifyAsync(db, source);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task AmbiguousPrivateReferencesBlockSqliteMigrationWithoutPartialCopies(bool privateLibrary)
    {
        await using var db = new HockeyDbContext(new DbContextOptionsBuilder<HockeyDbContext>().UseSqlite("Data Source=:memory:").Options);
        await db.Database.OpenConnectionAsync();
        await db.Database.EnsureCreatedAsync();
        await AddLegacyVisibilityAsync(db);
        var source = await SeedAsync(db);
        if (privateLibrary)
            await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE Trainings SET Visibility = 'team' WHERE Id = {source.LibraryPlan};");
        else
            await db.Database.ExecuteSqlRawAsync("UPDATE Drills SET Visibility = 'team';");
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => IndependentWorkspaceUpgrade.ApplySqliteAsync(db, default));
        Assert.Contains("owner review", error.Message);
        Assert.Equal(2, await db.Drills.CountAsync());
        Assert.Equal(3, await db.Trainings.CountAsync());
        Assert.Equal(6, await db.TrainingEntries.CountAsync());
        // An explicit, reviewed fix to the old visibility makes the graph safe to migrate.
        if (privateLibrary)
            await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE Trainings SET Visibility = 'organisation' WHERE Id = {source.LibraryPlan};");
        else
            await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE Drills SET Visibility = 'organisation' WHERE Id = {source.SharedDrill};");
        await IndependentWorkspaceUpgrade.ApplySqliteAsync(db, default);
        await VerifyAsync(db, source);
    }

    [PostgreSqlFact]
    [Trait("Category", "PostgreSql")]
    public async Task PostgreSqlMigrationPreservesLegacyContentAndBlocksAmbiguousReferencesAtomically()
    {
        var admin = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("HOCKEY_POSTGRES_TEST_CONNECTION")) { Database = "postgres" };
        await using var connection = new NpgsqlConnection(admin.ConnectionString);
        await connection.OpenAsync();
        var name = "hockey_copy_migration_" + Guid.NewGuid().ToString("N");
        await using var create = new NpgsqlCommand($"CREATE DATABASE {name}", connection);
        await create.ExecuteNonQueryAsync();
        try
        {
            var target = new NpgsqlConnectionStringBuilder(admin.ConnectionString) { Database = name };
            await using var db = new HockeyDbContext(new DbContextOptionsBuilder<HockeyDbContext>()
                .UseNpgsql(target.ConnectionString, p => p.MigrationsHistoryTable("__EFMigrationsHistory", DatabaseConfiguration.MigrationHistorySchema)).Options);
            var migrator = db.GetService<IMigrator>();
            await migrator.MigrateAsync("20261024084523_AgeGroupCatalog");
            var source = await SeedAsync(db);
            await db.Database.ExecuteSqlRawAsync("UPDATE hockey.\"Drills\" SET \"Visibility\" = 'team';");
            var error = await Assert.ThrowsAsync<PostgresException>(() => db.Database.MigrateAsync());
            Assert.Contains("owner review", error.MessageText);
            Assert.Equal(2, await db.Drills.CountAsync());
            Assert.Equal(3, await db.Trainings.CountAsync());
            await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE hockey.\"Drills\" SET \"Visibility\" = 'organisation' WHERE \"Id\" = {source.SharedDrill};");
            await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE hockey.\"Trainings\" SET \"Visibility\" = 'team' WHERE \"Id\" = {source.LibraryPlan};");
            await Assert.ThrowsAsync<PostgresException>(() => db.Database.MigrateAsync());
            Assert.Equal(2, await db.Drills.CountAsync());
            await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE hockey.\"Trainings\" SET \"Visibility\" = 'organisation' WHERE \"Id\" = {source.LibraryPlan};");
            await db.Database.MigrateAsync();
            await VerifyAsync(db, source);
            await db.Database.MigrateAsync();
            await VerifyAsync(db, source);
            var entry = await db.TrainingEntries.FirstAsync();
            entry.DrillId = source.PrivateDrill;
            // Choose a plan outside the private drill's team; the database must enforce the invariant.
            entry.TrainingId = IndependentWorkspaceUpgrade.PlanId(source.SharedPlan);
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
        finally
        {
            NpgsqlConnection.ClearAllPools();
            await using var drop = new NpgsqlCommand($"DROP DATABASE {name} WITH (FORCE)", connection);
            await drop.ExecuteNonQueryAsync();
        }
    }

    private static Task AddLegacyVisibilityAsync(HockeyDbContext db) => db.Database.ExecuteSqlRawAsync("ALTER TABLE Drills ADD COLUMN Visibility TEXT NOT NULL DEFAULT 'team'; ALTER TABLE Trainings ADD COLUMN Visibility TEXT NOT NULL DEFAULT 'team';");

    private sealed record LegacyIds(Guid SharedDrill, Guid PrivateDrill, Guid SharedPlan, Guid CrossPlan, Guid LibraryPlan, Guid OtherTeam);
    private static async Task<LegacyIds> SeedAsync(HockeyDbContext db)
    {
        var otherTeam = new Team
        {
            Id = Guid.NewGuid(),
            OrganisationId = WorkspaceDefaults.OrganisationId,
            Name = "Other team",
            AgeGroup = "U14"
        };
        var shared = new Drill
        {
            Id = Guid.NewGuid(),
            Title = "Old shared drill",
            Notes = "Original instructions",
            CategoryId = "skating",
            DiagramJson = "{\"version\":1,\"objects\":[],\"paths\":[]}",
            TagsJson = "[\"Skating\"]",
            AgeGroup = "U12",
            UpdatedAt = DateTimeOffset.Parse("2026-10-24T08:00:00Z")
        };
        var privateDrill = new Drill
        {
            Id = Guid.NewGuid(),
            Title = "Private drill",
            DiagramJson = shared.DiagramJson
        };
        Training Plan(string title, Guid? owner) => new()
        {
            Id = Guid.NewGuid(),
            Title = title,
            Notes = "Plan notes",
            OwnerTeamId = owner,
            AgeGroup = "U12",
            TagsJson = "[\"Tactics\"]",
            UpdatedAt = shared.UpdatedAt,
            Items = [new() { DrillId = shared.Id, Position = 0, DurationMinutes = 8, Notes = "First cue" }, new() { DrillId = shared.Id, Position = 1, DurationMinutes = 17, Notes = "Repeat cue" }]
        };
        var sharedPlan = Plan("Shared team plan", WorkspaceDefaults.TeamId);
        var crossPlan = Plan("Other team plan", otherTeam.Id);
        var libraryPlan = Plan("Existing library plan", null);
        if (db.Database.IsNpgsql())
        {
            // Seed the historical schema with its actual columns, independent of today's EF model.
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO hockey.\"Teams\" (\"Id\", \"OrganisationId\", \"Name\", \"AgeGroup\") VALUES ({otherTeam.Id}, {otherTeam.OrganisationId}, {otherTeam.Name}, {otherTeam.AgeGroup});");
            foreach (var drill in new[] { shared, privateDrill })
                await db.Database.ExecuteSqlInterpolatedAsync($"""
                    INSERT INTO hockey."Drills" ("Id", "OrganisationId", "OwnerTeamId", "OriginTeamId", "CreatedByUserId", "Title", "CategoryId", "Notes", "DiagramJson", "TagsJson", "AgeGroup", "UpdatedAt")
                    VALUES ({drill.Id}, {drill.OrganisationId}, {drill.OwnerTeamId}, {drill.OriginTeamId}, {drill.CreatedByUserId}, {drill.Title}, {drill.CategoryId}, {drill.Notes}, {drill.DiagramJson}, {drill.TagsJson}, {drill.AgeGroup}, {drill.UpdatedAt});
                    """);
            foreach (var plan in new[] { sharedPlan, crossPlan, libraryPlan })
            {
                await db.Database.ExecuteSqlInterpolatedAsync($"""
                    INSERT INTO hockey."Trainings" ("Id", "OrganisationId", "OwnerTeamId", "OriginTeamId", "CreatedByUserId", "Title", "Notes", "TagsJson", "AgeGroup", "UpdatedAt")
                    VALUES ({plan.Id}, {plan.OrganisationId}, {plan.OwnerTeamId}, {plan.OriginTeamId}, {plan.CreatedByUserId}, {plan.Title}, {plan.Notes}, {plan.TagsJson}, {plan.AgeGroup}, {plan.UpdatedAt});
                    """);
                foreach (var entry in plan.Items)
                    await db.Database.ExecuteSqlInterpolatedAsync($"""
                        INSERT INTO hockey."TrainingEntries" ("TrainingId", "DrillId", "Position", "DurationMinutes", "Notes")
                        VALUES ({plan.Id}, {entry.DrillId}, {entry.Position}, {entry.DurationMinutes}, {entry.Notes});
                        """);
            }
        }
        else
        {
            db.AddRange(otherTeam, shared, privateDrill, sharedPlan, crossPlan, libraryPlan);
            await db.SaveChangesAsync();
        }
        if (db.Database.IsNpgsql())
        {
            await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE hockey.\"Drills\" SET \"Visibility\" = 'organisation' WHERE \"Id\" = {shared.Id};");
            await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE hockey.\"Trainings\" SET \"Visibility\" = 'organisation' WHERE \"Id\" IN ({sharedPlan.Id}, {libraryPlan.Id});");
        }
        else
        {
            await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE Drills SET Visibility = 'organisation' WHERE Id = {shared.Id};");
            await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE Trainings SET Visibility = 'organisation' WHERE Id IN ({sharedPlan.Id}, {libraryPlan.Id});");
        }
        db.ChangeTracker.Clear();

        return new(shared.Id, privateDrill.Id, sharedPlan.Id, crossPlan.Id, libraryPlan.Id, otherTeam.Id);
    }

    private static async Task VerifyAsync(HockeyDbContext db, LegacyIds ids)
    {
        db.ChangeTracker.Clear();
        var drills = await db.Drills.ToDictionaryAsync(d => d.Id);
        var plans = await db.Trainings.Include(p => p.Items).ToDictionaryAsync(p => p.Id);
        Assert.Equal(4, drills.Count);
        Assert.Equal(4, plans.Count);
        var original = drills[ids.SharedDrill];
        Assert.Equal(WorkspaceDefaults.TeamId, original.OwnerTeamId);
        Assert.Equal("Original instructions", original.Notes);
        Assert.Equal("Private drill", drills[ids.PrivateDrill].Title);
        Assert.Equal(WorkspaceDefaults.TeamId, drills[ids.PrivateDrill].OwnerTeamId);
        var library = drills[IndependentWorkspaceUpgrade.DrillId(WorkspaceDefaults.OrganisationId, null, ids.SharedDrill)];
        Assert.Null(library.OwnerTeamId);
        Assert.Equal(original.DiagramJson, library.DiagramJson);
        Assert.Equal(original.Notes, library.Notes);
        Assert.Equal(original.TagsJson, library.TagsJson);
        Assert.Equal(original.UpdatedAt, library.UpdatedAt);
        Assert.Equal(original.AgeGroup, library.AgeGroup);
        Assert.Equal("Old shared drill", library.Title);
        Assert.Null(plans[IndependentWorkspaceUpgrade.PlanId(ids.SharedPlan)].OwnerTeamId);
        foreach (var plan in plans.Values)
        {
            var entries = plan.Items.OrderBy(i => i.Position).ToList();
            Assert.Equal(new[] { 8, 17 }, entries.Select(i => i.DurationMinutes));
            Assert.Equal(new[] { "First cue", "Repeat cue" }, entries.Select(i => i.Notes));
            Assert.Equal(new[] { 0, 1 }, entries.Select(i => i.Position));
            Assert.Equal(entries[0].DrillId, entries[1].DrillId);
            Assert.All(entries, e =>
            {
                Assert.Equal(plan.OrganisationId, drills[e.DrillId].OrganisationId);
                Assert.Equal(plan.OwnerTeamId, drills[e.DrillId].OwnerTeamId);
            });
        }
    }
}

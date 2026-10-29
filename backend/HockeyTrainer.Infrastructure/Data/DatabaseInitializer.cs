using System.Data.Common;
using System.Text.Json;
using HockeyTrainer.Application.Authentication;
using HockeyTrainer.Application.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;

namespace HockeyTrainer.Infrastructure.Data;

public static class DatabaseInitializer
{
    public static async Task InitializeAsync(IServiceProvider services, CancellationToken cancellationToken = default)
    {
        var db = services.GetRequiredService<HockeyDbContext>();
        // Hosted databases are migrated separately using reviewed SQL, never at startup.
        if (!db.Database.IsSqlite())
        {
            return;
        }

        var created = await db.Database.EnsureCreatedAsync(cancellationToken);
        var authenticated = services.GetRequiredService<IAuthenticationContext>().Enabled;
        await UpgradeOwnershipAsync(db, !authenticated, cancellationToken);
        if (created && authenticated)
        {
            // Fresh signed-in workspaces start with no clubs or teams. Preserve the POC seed only in local no-auth mode.
            await db.Database.ExecuteSqlRawAsync("""
                DELETE FROM OrganisationMembers;
                DELETE FROM Teams;
                DELETE FROM Organisations;
                """, cancellationToken);
        }
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS BrowserSessions (
                IdHash TEXT NOT NULL PRIMARY KEY, UserId TEXT NOT NULL, Email TEXT NOT NULL,
                ProtectedTokens TEXT NOT NULL, AccessExpiresAt INTEGER NOT NULL,
                AbsoluteExpiresAt INTEGER NOT NULL, IdleExpiresAt INTEGER NOT NULL, RefreshLeaseUntil INTEGER NOT NULL);
            CREATE INDEX IF NOT EXISTS IX_BrowserSessions_AbsoluteExpiresAt ON BrowserSessions (AbsoluteExpiresAt);
            CREATE INDEX IF NOT EXISTS IX_BrowserSessions_IdleExpiresAt ON BrowserSessions (IdleExpiresAt);
            """, cancellationToken);
        await AccountAndAgeUpgrade.ApplySqliteAsync(db, cancellationToken);
        await UpgradeAgeGroupsAsync(db, cancellationToken);
        await UpgradeTagsAsync(db, cancellationToken);
        await IndependentWorkspaceUpgrade.ApplySqliteAsync(db, cancellationToken);
    }

    private static async Task UpgradeAgeGroupsAsync(HockeyDbContext db, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await db.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS AgeGroups (Id TEXT NOT NULL PRIMARY KEY, Name TEXT NOT NULL, SortOrder INTEGER NOT NULL);", cancellationToken);
        foreach (var group in AgeGroupSeed.Items)
        {
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO AgeGroups (Id, Name, SortOrder) VALUES ({group.Id}, {group.Name}, {group.SortOrder}) ON CONFLICT DO NOTHING;", cancellationToken);
        }
        await transaction.CommitAsync(cancellationToken);
    }

    private static async Task UpgradeOwnershipAsync(HockeyDbContext db, bool seedLocalWorkspace, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        // Additive upgrade: never rebuild or drop the user's SQLite content tables.
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS Organisations (Id TEXT NOT NULL PRIMARY KEY, Name TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS Teams (Id TEXT NOT NULL PRIMARY KEY, OrganisationId TEXT NOT NULL, Name TEXT NOT NULL, AgeGroup TEXT NOT NULL, FOREIGN KEY (OrganisationId) REFERENCES Organisations(Id) ON DELETE RESTRICT);
            CREATE TABLE IF NOT EXISTS OrganisationMembers (OrganisationId TEXT NOT NULL, UserId TEXT NOT NULL, Role TEXT NOT NULL, PRIMARY KEY (OrganisationId, UserId), FOREIGN KEY (OrganisationId) REFERENCES Organisations(Id) ON DELETE RESTRICT);
            CREATE TABLE IF NOT EXISTS TeamMembers (TeamId TEXT NOT NULL, UserId TEXT NOT NULL, Role TEXT NOT NULL, PRIMARY KEY (TeamId, UserId), FOREIGN KEY (TeamId) REFERENCES Teams(Id) ON DELETE RESTRICT);
            CREATE INDEX IF NOT EXISTS IX_OrganisationMembers_UserId ON OrganisationMembers (UserId);
            CREATE INDEX IF NOT EXISTS IX_TeamMembers_UserId ON TeamMembers (UserId);
            """, cancellationToken);
        if (seedLocalWorkspace || !await HasColumnAsync(db.Database.GetDbConnection(), transaction.GetDbTransaction(), "Drills", "OrganisationId", cancellationToken))
        {
            await db.Database.ExecuteSqlRawAsync("""
                INSERT OR IGNORE INTO Organisations VALUES ('00000000-0000-0000-0000-000000000001', 'Legacy workspace');
                INSERT OR IGNORE INTO Teams VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Local team', '');
                INSERT OR IGNORE INTO OrganisationMembers VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'admin');
                """, cancellationToken);
        }

        foreach (var table in new[] { "Drills", "Trainings" })
        {
            foreach (var (column, defaultValue) in new[] {
                ("OrganisationId", "00000000-0000-0000-0000-000000000001"),
                ("OwnerTeamId", "00000000-0000-0000-0000-000000000002"),
                ("OriginTeamId", "00000000-0000-0000-0000-000000000002"),
                ("CreatedByUserId", "00000000-0000-0000-0000-000000000003"), ("AgeGroup", ""), ("AgeGroupsJson", "[]") })
            {
                if (!await HasColumnAsync(db.Database.GetDbConnection(), transaction.GetDbTransaction(), table, column, cancellationToken))
                {
                    var nullable = column is "OwnerTeamId" or "OriginTeamId" ? "" : "NOT NULL";
                    // All names/defaults are private constants, never request input.
#pragma warning disable EF1002
                    await db.Database.ExecuteSqlRawAsync($"ALTER TABLE {table} ADD COLUMN {column} TEXT {nullable} DEFAULT '{defaultValue}';", cancellationToken);
#pragma warning restore EF1002
                }
            }
#pragma warning disable EF1002
            await db.Database.ExecuteSqlRawAsync($"CREATE INDEX IF NOT EXISTS IX_{table}_OrganisationId_OwnerTeamId ON {table} (OrganisationId, OwnerTeamId);", cancellationToken);
#pragma warning restore EF1002
        }
        await transaction.CommitAsync(cancellationToken);
    }

    private static async Task UpgradeTagsAsync(HockeyDbContext db, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var connection = db.Database.GetDbConnection();
        await using var versionCommand = connection.CreateCommand();
        versionCommand.Transaction = transaction.GetDbTransaction();
        versionCommand.CommandText = "PRAGMA user_version;";
        var version = Convert.ToInt32(await versionCommand.ExecuteScalarAsync(cancellationToken));
        if (version >= 2)
        {
            await transaction.CommitAsync(cancellationToken);

            return;
        }

        if (version < 1)
        {
            var upgradeDrills = !await HasTagsColumnAsync(connection, transaction.GetDbTransaction(), "Drills", cancellationToken);
            var upgradeTrainings = !await HasTagsColumnAsync(connection, transaction.GetDbTransaction(), "Trainings", cancellationToken);
            if (upgradeDrills)
            {
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE Drills ADD COLUMN TagsJson TEXT NOT NULL DEFAULT '[]';", cancellationToken);
            }
            if (upgradeTrainings)
            {
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE Trainings ADD COLUMN TagsJson TEXT NOT NULL DEFAULT '[]';", cancellationToken);
            }

            // Backfill only newly introduced columns; subsequent starts preserve explicit tag edits.
            if (upgradeDrills)
            {
                foreach (var drill in await db.Drills.ToListAsync(cancellationToken))
                {
                    var category = Catalog.Categories.FirstOrDefault(c => c.Id == drill.CategoryId);
                    drill.TagsJson = JsonSerializer.Serialize(category is null ? Array.Empty<string>() : [category.Name]);
                }
                await db.SaveChangesAsync(cancellationToken);
            }
            if (upgradeTrainings)
            {
                foreach (var training in await db.Trainings.Include(t => t.Items).ThenInclude(i => i.Drill).ToListAsync(cancellationToken))
                {
                    var tags = training.Items.OrderBy(i => i.Position)
                        .SelectMany(i => TagRules.Read(i.Drill.TagsJson))
                        .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
                    training.TagsJson = JsonSerializer.Serialize(tags);
                }
                await db.SaveChangesAsync(cancellationToken);
            }

            await db.Database.ExecuteSqlRawAsync("PRAGMA user_version = 1;", cancellationToken);
        }

        foreach (var drill in await db.Drills.ToListAsync(cancellationToken))
        {
            drill.TagsJson = JsonSerializer.Serialize(TagRules.NormalizeLegacy(TagRules.Read(drill.TagsJson)));
        }
        foreach (var training in await db.Trainings.ToListAsync(cancellationToken))
        {
            training.TagsJson = JsonSerializer.Serialize(TagRules.NormalizeLegacy(TagRules.Read(training.TagsJson)));
        }
        await db.SaveChangesAsync(cancellationToken);
        await db.Database.ExecuteSqlRawAsync("PRAGMA user_version = 2;", cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private static Task<bool> HasTagsColumnAsync(DbConnection connection, DbTransaction transaction, string table, CancellationToken cancellationToken) =>
        HasColumnAsync(connection, transaction, table, "TagsJson", cancellationToken);

    private static async Task<bool> HasColumnAsync(DbConnection connection, DbTransaction transaction, string table, string column, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        // Table names are private constants supplied by the upgrade, never request input.
        command.CommandText = $"PRAGMA table_info(\"{table}\");";
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            if (string.Equals(reader.GetString(1), column, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }
}

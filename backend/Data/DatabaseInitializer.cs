using System.Data.Common;
using System.Text.Json;
using HockeyTrainer.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace HockeyTrainer.Api.Data;

public static class DatabaseInitializer
{
    public static async Task InitializeAsync(IServiceProvider services, CancellationToken cancellationToken = default)
    {
        var db = services.GetRequiredService<HockeyDbContext>();
        var created = await db.Database.EnsureCreatedAsync(cancellationToken);
        await UpgradeTagsAsync(db, cancellationToken);
        if (created)
        {
            await DatabaseSeeder.SeedAsync(services);
        }
    }

    private static async Task UpgradeTagsAsync(HockeyDbContext db, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var connection = db.Database.GetDbConnection();
        await using var versionCommand = connection.CreateCommand();
        versionCommand.Transaction = transaction.GetDbTransaction();
        versionCommand.CommandText = "PRAGMA user_version;";
        var version = Convert.ToInt32(await versionCommand.ExecuteScalarAsync(cancellationToken));
        if (version >= 1)
        {
            await transaction.CommitAsync(cancellationToken);
            return;
        }

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
        await transaction.CommitAsync(cancellationToken);
    }

    private static async Task<bool> HasTagsColumnAsync(DbConnection connection, DbTransaction transaction, string table, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        // Table names are private constants supplied by the upgrade, never request input.
        command.CommandText = $"PRAGMA table_info(\"{table}\");";
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            if (string.Equals(reader.GetString(1), "TagsJson", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        return false;
    }
}

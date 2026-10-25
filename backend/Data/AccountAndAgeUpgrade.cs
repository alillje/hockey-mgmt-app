using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace HockeyTrainer.Api.Data;

public static class AccountAndAgeUpgrade
{
    public static async Task ApplySqliteAsync(HockeyDbContext db, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS UserPreferences (
                UserId TEXT NOT NULL PRIMARY KEY, DefaultTeamId TEXT,
                FOREIGN KEY (DefaultTeamId) REFERENCES Teams(Id) ON DELETE SET NULL);
            CREATE INDEX IF NOT EXISTS IX_UserPreferences_DefaultTeamId ON UserPreferences(DefaultTeamId);
            CREATE TABLE IF NOT EXISTS ContentUpgrades (Name TEXT NOT NULL PRIMARY KEY);
            """, ct);
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.Transaction = transaction.GetDbTransaction();
        command.CommandText = "SELECT COUNT(*) FROM ContentUpgrades WHERE Name = 'MultipleContentAgeGroups';";
        if (Convert.ToInt32(await command.ExecuteScalarAsync(ct)) == 0)
        {
            await db.Database.ExecuteSqlRawAsync("""
                UPDATE Drills SET AgeGroupsJson = json_array(AgeGroup) WHERE AgeGroup <> '';
                UPDATE Trainings SET AgeGroupsJson = json_array(AgeGroup) WHERE AgeGroup <> '';
                INSERT INTO ContentUpgrades (Name) VALUES ('MultipleContentAgeGroups');
                """, ct);
        }
        await transaction.CommitAsync(ct);
    }
}

using HockeyTrainer.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace HockeyTrainer.Infrastructure.Data;

internal static class ContentNameUniquenessUpgrade
{
    public static async Task ApplySqliteAsync(HockeyDbContext db, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await using var versionCommand = db.Database.GetDbConnection().CreateCommand();
        versionCommand.Transaction = transaction.GetDbTransaction();
        versionCommand.CommandText = "SELECT COUNT(*) FROM ContentUpgrades WHERE Name = 'WorkspaceUniqueContentNames';";
        if (Convert.ToInt32(await versionCommand.ExecuteScalarAsync(cancellationToken)) > 0)
        {
            await transaction.CommitAsync(cancellationToken);

            return;
        }

        await RenameDuplicateDrillNamesAsync(db, cancellationToken);
        await RenameDuplicateTrainingNamesAsync(db, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await db.Database.ExecuteSqlRawAsync($"""
            CREATE UNIQUE INDEX IF NOT EXISTS UX_Drills_Workspace_NormalizedTitle
            ON Drills (OrganisationId, OwnerTeamId, lower(trim(Title))) WHERE OwnerTeamId IS NOT NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS UX_Drills_Library_NormalizedTitle
            ON Drills (OrganisationId, lower(trim(Title))) WHERE OwnerTeamId IS NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS UX_Trainings_Workspace_NormalizedTitle
            ON Trainings (OrganisationId, OwnerTeamId, lower(trim(Title))) WHERE OwnerTeamId IS NOT NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS UX_Trainings_Library_NormalizedTitle
            ON Trainings (OrganisationId, lower(trim(Title))) WHERE OwnerTeamId IS NULL;
            INSERT INTO ContentUpgrades (Name) VALUES ('WorkspaceUniqueContentNames');
            """, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private static async Task RenameDuplicateDrillNamesAsync(HockeyDbContext db, CancellationToken cancellationToken)
    {
        var drills = (await db.Drills.ToListAsync(cancellationToken)).OrderBy(drill => drill.UpdatedAt).ThenBy(drill => drill.Id).ToList();
        var namesByWorkspace = drills.GroupBy(drill => new WorkspaceKey(drill.OrganisationId, drill.OwnerTeamId))
            .ToDictionary(group => group.Key, group => group.Select(drill => Normalize(drill.Title)).ToHashSet(StringComparer.OrdinalIgnoreCase));
        var duplicateGroups = drills.GroupBy(drill => new WorkspaceTitleKey(
            drill.OrganisationId,
            drill.OwnerTeamId,
            Normalize(drill.Title)));
        foreach (var group in duplicateGroups.Where(group => group.Count() > 1))
        {
            var names = namesByWorkspace[new WorkspaceKey(group.Key.OrganisationId, group.Key.OwnerTeamId)];
            foreach (var drill in group.Skip(1))
            {
                drill.Title = CreateAvailableCopyTitle(drill.Title, names);
                names.Add(Normalize(drill.Title));
            }
        }
    }

    private static async Task RenameDuplicateTrainingNamesAsync(HockeyDbContext db, CancellationToken cancellationToken)
    {
        var trainings = (await db.Trainings.ToListAsync(cancellationToken)).OrderBy(training => training.UpdatedAt).ThenBy(training => training.Id).ToList();
        var namesByWorkspace = trainings.GroupBy(training => new WorkspaceKey(training.OrganisationId, training.OwnerTeamId))
            .ToDictionary(group => group.Key, group => group.Select(training => Normalize(training.Title)).ToHashSet(StringComparer.OrdinalIgnoreCase));
        var duplicateGroups = trainings.GroupBy(training => new WorkspaceTitleKey(
            training.OrganisationId,
            training.OwnerTeamId,
            Normalize(training.Title)));
        foreach (var group in duplicateGroups.Where(group => group.Count() > 1))
        {
            var names = namesByWorkspace[new WorkspaceKey(group.Key.OrganisationId, group.Key.OwnerTeamId)];
            foreach (var training in group.Skip(1))
            {
                training.Title = CreateAvailableCopyTitle(training.Title, names);
                names.Add(Normalize(training.Title));
            }
        }
    }

    private static string CreateAvailableCopyTitle(string originalTitle, HashSet<string> names)
    {
        for (var copyNumber = 1; ; copyNumber++)
        {
            var suffix = copyNumber == 1 ? " - Copy" : $" - Copy ({copyNumber})";
            var baseTitle = originalTitle.Trim();
            if (baseTitle.Length > 120 - suffix.Length)
            {
                baseTitle = baseTitle[..(120 - suffix.Length)].TrimEnd();
            }

            var candidate = $"{baseTitle}{suffix}";
            if (!names.Contains(Normalize(candidate)))
            {
                return candidate;
            }
        }
    }

    private static string Normalize(string title) => title.Trim().ToLowerInvariant();

    private readonly record struct WorkspaceKey(Guid OrganisationId, Guid? OwnerTeamId);

    private readonly record struct WorkspaceTitleKey(Guid OrganisationId, Guid? OwnerTeamId, string Title);
}

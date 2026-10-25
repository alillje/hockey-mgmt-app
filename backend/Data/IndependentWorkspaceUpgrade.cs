using System.Security.Cryptography;
using System.Text;
using HockeyTrainer.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace HockeyTrainer.Api.Data;

public static class IndependentWorkspaceUpgrade
{
    // Reserved only for the one-time migration. Normal copy operations always generate fresh IDs.
    public static Guid DrillId(Guid organisationId, Guid? teamId, Guid sourceId) => StableId($"workspace-drill:{organisationId:D}:{teamId?.ToString("D") ?? "library"}:{sourceId:D}");
    public static Guid PlanId(Guid sourceId) => StableId($"library-plan:{sourceId:D}");
    private static Guid StableId(string key) => Guid.ParseExact(Convert.ToHexString(MD5.HashData(Encoding.UTF8.GetBytes(key))), "N");

    public static async Task ApplySqliteAsync(HockeyDbContext db, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS ContentUpgrades (Name TEXT NOT NULL PRIMARY KEY);", ct);
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.Transaction = transaction.GetDbTransaction();
        command.CommandText = "SELECT COUNT(*) FROM ContentUpgrades WHERE Name = 'IndependentWorkspaceCopies';";
        if (Convert.ToInt32(await command.ExecuteScalarAsync(ct)) == 0)
        {
            command.CommandText = "SELECT COUNT(*) FROM pragma_table_info('Drills') WHERE name = 'Visibility';";
            if (Convert.ToInt32(await command.ExecuteScalarAsync(ct)) != 0)
            {
                var sharedDrills = new HashSet<Guid>();
                var sharedPlans = new HashSet<Guid>();
                foreach (var (table, ids) in new[] { ("Drills", sharedDrills), ("Trainings", sharedPlans) })
                {
                    command.CommandText = $"SELECT COUNT(*) FROM {table} WHERE Visibility NOT IN ('team', 'organisation') OR (OwnerTeamId IS NULL AND Visibility <> 'organisation');";
                    if (Convert.ToInt32(await command.ExecuteScalarAsync(ct)) != 0)
                        throw new InvalidOperationException("Independent-copy migration blocked: unknown or private library visibility needs owner review.");
                    command.CommandText = $"SELECT Id FROM {table} WHERE Visibility = 'organisation' AND OwnerTeamId IS NOT NULL;";
                    await using var reader = await command.ExecuteReaderAsync(ct);
                    while (await reader.ReadAsync(ct)) ids.Add(Guid.Parse(reader.GetString(0)));
                }
                db.ChangeTracker.Clear();
                var drills = await db.Drills.ToDictionaryAsync(d => d.Id, ct);
                var plans = await db.Trainings.Include(p => p.Items).ToListAsync(ct);
                var teams = await db.Teams.ToDictionaryAsync(t => t.Id, ct);
                var organisations = await db.Organisations.Select(o => o.Id).ToListAsync(ct);
                foreach (var content in drills.Values.Cast<IOwnedContent>().Concat(plans))
                    if (!organisations.Contains(content.OrganisationId) || content.OwnerTeamId is Guid teamId &&
                        (!teams.TryGetValue(teamId, out var team) || team.OrganisationId != content.OrganisationId))
                        throw new InvalidOperationException("Independent-copy migration blocked: content ownership is ambiguous. Review the migration guide; no content was reassigned.");
                foreach (var plan in plans)
                    foreach (var entry in plan.Items)
                    {
                        if (!drills.TryGetValue(entry.DrillId, out var drill) || drill.OrganisationId != plan.OrganisationId ||
                            ((plan.OwnerTeamId != drill.OwnerTeamId || sharedPlans.Contains(plan.Id)) && drill.OwnerTeamId is not null && !sharedDrills.Contains(drill.Id)))
                            throw new InvalidOperationException("Independent-copy migration blocked: an unavailable, private, or cross-organisation drill reference needs owner review. No content was exposed or reassigned.");
                    }

                var copies = new Dictionary<(Guid, Guid?), Drill>();
                Drill LocalCopy(Drill original, Guid? teamId)
                {
                    var key = (original.Id, teamId);
                    if (copies.TryGetValue(key, out var existing)) return existing;
                    var copy = new Drill
                    {
                        Id = DrillId(original.OrganisationId, teamId, original.Id),
                        OrganisationId = original.OrganisationId,
                        OwnerTeamId = teamId,
                        OriginTeamId = original.OwnerTeamId ?? original.OriginTeamId,
                        CreatedByUserId = original.CreatedByUserId,
                        Title = original.Title,
                        Notes = original.Notes,
                        DiagramJson = original.DiagramJson,
                        CategoryId = original.CategoryId,
                        TagsJson = original.TagsJson,
                        AgeGroup = original.AgeGroup,
                        AgeGroupsJson = original.AgeGroupsJson,
                        UpdatedAt = original.UpdatedAt
                    };
                    db.Drills.Add(copy);
                    copies.Add(key, copy);
                    return copy;
                }
                foreach (var id in sharedDrills.Order()) LocalCopy(drills[id], null);
                foreach (var plan in plans.OrderBy(p => p.Id))
                {
                    if (sharedPlans.Contains(plan.Id))
                        db.Trainings.Add(new Training
                        {
                            Id = PlanId(plan.Id),
                            OrganisationId = plan.OrganisationId,
                            OwnerTeamId = null,
                            OriginTeamId = plan.OwnerTeamId,
                            CreatedByUserId = plan.CreatedByUserId,
                            Title = plan.Title,
                            Notes = plan.Notes,
                            TagsJson = plan.TagsJson,
                            AgeGroup = plan.AgeGroup,
                            AgeGroupsJson = plan.AgeGroupsJson,
                            UpdatedAt = plan.UpdatedAt,
                            Items = plan.Items.OrderBy(i => i.Position).Select(i => new TrainingEntry
                            {
                                DrillId = LocalCopy(drills[i.DrillId], null).Id,
                                Position = i.Position,
                                DurationMinutes = i.DurationMinutes,
                                Notes = i.Notes
                            }).ToList()
                        });
                    foreach (var entry in plan.Items)
                    {
                        var drill = drills[entry.DrillId];
                        if (drill.OwnerTeamId != plan.OwnerTeamId) entry.DrillId = LocalCopy(drill, plan.OwnerTeamId).Id;
                    }
                }
                await db.SaveChangesAsync(ct);
                // Remove obsolete visibility data only after every preserved reference has been repaired.
                foreach (var table in new[] { "Drills", "Trainings" })
                {
#pragma warning disable EF1002
                    await db.Database.ExecuteSqlRawAsync($"DROP INDEX IF EXISTS IX_{table}_OrganisationId_OwnerTeamId_Visibility; ALTER TABLE {table} DROP COLUMN Visibility;", ct);
#pragma warning restore EF1002
                }
            }
            await db.Database.ExecuteSqlRawAsync("INSERT INTO ContentUpgrades (Name) VALUES ('IndependentWorkspaceCopies');", ct);
        }
        await db.Database.ExecuteSqlRawAsync(WorkspaceReferenceRules.Sqlite, ct);
        await transaction.CommitAsync(ct);
        db.ChangeTracker.Clear();
    }
}

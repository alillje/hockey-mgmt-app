using HockeyTrainer.Infrastructure.Data;
using HockeyTrainer.Domain.Models;
using HockeyTrainer.Application.Repositories;
using Microsoft.EntityFrameworkCore;
using System.Data;

namespace HockeyTrainer.Infrastructure.Repositories;

public sealed class WorkspaceRepository(HockeyDbContext db) : IWorkspaceRepository
{
    public Task<List<OrganisationMember>> MembershipsAsync(Guid userId, CancellationToken ct) =>
        db.OrganisationMembers.Where(m => m.UserId == userId).ToListAsync(ct);
    public Task<List<OrganisationMember>> MembersAsync(Guid organisationId, CancellationToken ct) =>
        db.OrganisationMembers.Where(m => m.OrganisationId == organisationId).ToListAsync(ct);
    public Task<List<Organisation>> OrganisationsAsync(IEnumerable<Guid> ids, CancellationToken ct) =>
        db.Organisations.Where(o => ids.Contains(o.Id)).OrderBy(o => o.Id == WorkspaceDefaults.OrganisationId ? 0 : 1).ThenBy(o => o.Name).ToListAsync(ct);
    public Task<List<Organisation>> AllOrganisationsAsync(CancellationToken ct) =>
        db.Organisations.OrderBy(o => o.Id == WorkspaceDefaults.OrganisationId ? 0 : 1).ThenBy(o => o.Name).ToListAsync(ct);
    public Task<List<Team>> TeamsAsync(Guid organisationId, CancellationToken ct) =>
        db.Teams.Where(t => t.OrganisationId == organisationId).OrderBy(t => t.Name).ToListAsync(ct);
    public Task<List<TeamMember>> TeamMembershipsAsync(Guid userId, CancellationToken ct) =>
        db.TeamMembers.Where(m => m.UserId == userId).ToListAsync(ct);
    public void Add(Organisation value) => db.Organisations.Add(value);
    public void Add(Team value) => db.Teams.Add(value);
    public void Add(OrganisationMember value) => db.OrganisationMembers.Add(value);
    public void Add(TeamMember value) => db.TeamMembers.Add(value);
    public void Remove(OrganisationMember value) => db.OrganisationMembers.Remove(value);
    public void Remove(TeamMember value) => db.TeamMembers.Remove(value);
    public async Task ExecuteInTransactionAsync(Func<Task> operation, CancellationToken ct)
    {
        await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            await operation();
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);

            return true;
        });
    }

    public async Task ClearDefaultTeamAsync(Guid userId, IEnumerable<Guid> teamIds, CancellationToken ct)
    {
        var preference = await db.UserPreferences.SingleOrDefaultAsync(p => p.UserId == userId, ct);
        if (preference?.DefaultTeamId is Guid teamId && teamIds.Contains(teamId))
        {
            preference.DefaultTeamId = null;
        }
    }
    public Task GrantLegacyAccessAsync(Guid userId, CancellationToken ct) => db.Database.IsNpgsql()
        ? db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO hockey."OrganisationMembers" ("OrganisationId", "UserId", "Role")
            VALUES ({WorkspaceDefaults.OrganisationId}, {userId}, 'admin') ON CONFLICT DO NOTHING;
            INSERT INTO hockey."TeamMembers" ("TeamId", "UserId", "Role")
            VALUES ({WorkspaceDefaults.TeamId}, {userId}, 'editor') ON CONFLICT DO NOTHING
            """, ct)
        : db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "OrganisationMembers" ("OrganisationId", "UserId", "Role")
            VALUES ({WorkspaceDefaults.OrganisationId}, {userId}, 'admin') ON CONFLICT DO NOTHING;
            INSERT INTO "TeamMembers" ("TeamId", "UserId", "Role")
            VALUES ({WorkspaceDefaults.TeamId}, {userId}, 'editor') ON CONFLICT DO NOTHING
            """, ct);

    public Task SaveAsync(CancellationToken ct) => db.SaveChangesAsync(ct);
}

using HockeyTrainer.Domain.Models;

namespace HockeyTrainer.Application.Repositories;

public interface IWorkspaceRepository
{
    Task<List<OrganisationMember>> MembershipsAsync(Guid userId, CancellationToken cancellationToken);
    Task<List<OrganisationMember>> MembersAsync(Guid organisationId, CancellationToken cancellationToken);
    Task<List<Organisation>> OrganisationsAsync(IEnumerable<Guid> ids, CancellationToken cancellationToken);
    Task<List<Organisation>> AllOrganisationsAsync(CancellationToken cancellationToken);
    Task<List<Team>> TeamsAsync(Guid organisationId, CancellationToken cancellationToken);
    Task<List<TeamMember>> TeamMembersAsync(Guid teamId, CancellationToken cancellationToken);
    Task<List<TeamMember>> TeamMembershipsAsync(Guid userId, CancellationToken cancellationToken);
    void Add(Organisation value);
    void Add(Team value);
    void Add(OrganisationMember value);
    void Add(TeamMember value);
    void Remove(OrganisationMember value);
    void Remove(TeamMember value);
    Task ExecuteInTransactionAsync(Func<Task> operation, CancellationToken cancellationToken);
    Task ClearDefaultTeamAsync(Guid userId, IEnumerable<Guid> teamIds, CancellationToken cancellationToken);
    Task GrantLegacyAccessAsync(Guid userId, CancellationToken cancellationToken);
    Task SaveAsync(CancellationToken cancellationToken);
}

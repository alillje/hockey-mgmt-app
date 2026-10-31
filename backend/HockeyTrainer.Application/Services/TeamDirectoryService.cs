using HockeyTrainer.Application.Contracts;
using HockeyTrainer.Application.Repositories;

namespace HockeyTrainer.Application.Services;

public sealed class TeamDirectoryService(IWorkspaceRepository repository, IUserProfileRepository userProfileRepository,
    WorkspaceService workspaceService)
{
    public async Task<TeamDirectoryResponse> GetAsync(Guid teamId, CancellationToken ct)
    {
        var access = await workspaceService.AccessAsync(ct);
        if (!access.Teams.Any(team => team.Id == teamId) ||
            (!access.IsAdmin && !access.Memberships.Any(member => member.TeamId == teamId)))
        {
            throw new ApiException(403, "Team access required");
        }

        var organisationMembers = await repository.MembersAsync(access.OrganisationId, ct);
        var teamMembers = (await repository.TeamMembersAsync(teamId, ct))
            .Where(member => organisationMembers.Any(orgMember => orgMember.UserId == member.UserId)).ToList();
        var administrators = organisationMembers.Where(member => member.Role == "admin").ToList();
        var profiles = (await userProfileRepository.GetManyAsync(
            teamMembers.Select(member => member.UserId).Concat(administrators.Select(member => member.UserId)), ct))
            .ToDictionary(profile => profile.UserId);
        DirectoryMemberResponse Describe(Guid userId, string role)
        {
            profiles.TryGetValue(userId, out var profile);

            return new(userId, profile?.FirstName ?? string.Empty, profile?.LastName ?? string.Empty, role);
        }

        return new(teamMembers.Select(member => Describe(member.UserId, member.Role)).OrderBy(member => member.LastName)
            .ThenBy(member => member.FirstName).ToList(),
            administrators.Select(member => Describe(member.UserId, "admin")).OrderBy(member => member.LastName)
                .ThenBy(member => member.FirstName).ToList());
    }
}

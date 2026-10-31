using HockeyTrainer.Application.Contracts;
using HockeyTrainer.Application.Authentication;
using System.ComponentModel.DataAnnotations;
using HockeyTrainer.Domain.Models;
using HockeyTrainer.Application.Repositories;

namespace HockeyTrainer.Application.Services;

public sealed class WorkspaceMembershipService(IWorkspaceRepository repository, WorkspaceService workspaceService,
    IAuthUserDirectory authUserDirectory, IUserProfileRepository userProfileRepository)
{
    public async Task AddMemberByEmailAsync(MemberEmailRequest request, CancellationToken ct)
    {
        // Authorise before querying the Auth directory, including role/team validation.
        var access = await workspaceService.RequireAdminAsync(ct);
        if (request.Role is not ("admin" or "member") || request.TeamRole is not ("editor" or "viewer"))
        {
            throw new ApiException(400, "Invalid membership");
        }
        if (request.Role == "admin")
        {
            RequirePlatformAdmin();
        }
        if (request.TeamId is not null && access.Teams.All(t => t.Id != request.TeamId))
        {
            throw new ApiException(400, "Unknown team");
        }
        var email = request.Email?.Trim();
        if (string.IsNullOrEmpty(email) || email.Length > 254 || !new EmailAddressAttribute().IsValid(email))
        {
            throw new ApiException(400, "Invalid email", "Enter a valid email address.");
        }
        var userId = await authUserDirectory.FindByEmailAsync(email.ToLowerInvariant(), ct)
            ?? throw new ApiException(404, "Registered user not found",
                "No registered user was found with that email address.");
        // Re-check permissions inside the existing atomic membership transaction.
        await AddMemberAsync(new MemberRequest(userId, request.Role, request.TeamId, request.TeamRole), ct);
    }

    public async Task<List<MemberResponse>> MembersAsync(CancellationToken ct)
    {
        var access = await workspaceService.RequireAdminAsync(ct);
        var result = new List<MemberResponse>();
        foreach (var member in await repository.MembersAsync(access.OrganisationId, ct))
        {
            var teams = (await repository.TeamMembershipsAsync(member.UserId, ct))
                .Where(m => access.Teams.Any(t => t.Id == m.TeamId)).ToList();
            if (teams.Count == 0)
            {
                result.Add(new(member.UserId, member.Role, null, null));
            }
            else
            {
                result.AddRange(teams.Select(m => new MemberResponse(member.UserId, member.Role, m.TeamId, m.Role)));
            }
        }

        var profiles = (await userProfileRepository.GetManyAsync(result.Select(member => member.UserId), ct))
            .ToDictionary(profile => profile.UserId);

        return result.Select(member => profiles.TryGetValue(member.UserId, out var profile)
            ? member with
            {
                FirstName = profile.FirstName,
                LastName = profile.LastName,
                Email = profile.Email
            }
            : member).ToList();
    }

    public Task AddMemberAsync(MemberRequest request, CancellationToken ct) =>
        repository.ExecuteInTransactionAsync(async () =>
        {
            var access = await workspaceService.RequireAdminAsync(ct);
            if (request.UserId == Guid.Empty || request.Role is not ("admin" or "member") || request.TeamRole is not ("editor" or "viewer"))
            {
                throw new ApiException(400, "Invalid membership");
            }

            if (request.TeamId is not null && access.Teams.All(t => t.Id != request.TeamId))
            {
                throw new ApiException(400, "Unknown team");
            }

            if (request.Role == "admin")
            {
                RequirePlatformAdmin();
            }

            var members = await repository.MembersAsync(access.OrganisationId, ct);
            var existing = members.FirstOrDefault(m => m.UserId == request.UserId);
            if (existing is not null)
            {
                RequireManageableMember(existing);
            }

            if (existing is null)
            {
                repository.Add(new OrganisationMember
                {
                    OrganisationId = access.OrganisationId,
                    UserId = request.UserId,
                    Role = request.Role
                });
            }
            else if (request.Role == "admin")
            {
                existing.Role = "admin";
            }

            if (request.TeamId is not null)
            {
                var teamMember = (await repository.TeamMembershipsAsync(request.UserId, ct))
                    .FirstOrDefault(m => m.TeamId == request.TeamId);
                if (teamMember is null)
                {
                    repository.Add(new TeamMember
                    {
                        TeamId = request.TeamId.Value,
                        UserId = request.UserId,
                        Role = request.TeamRole
                    });
                }
                else if (request.TeamRole == "editor")
                {
                    teamMember.Role = "editor";
                }
            }
        }, ct);

    public Task UpdateMemberRoleAsync(Guid userId, MemberRoleRequest request, CancellationToken ct) =>
        repository.ExecuteInTransactionAsync(async () =>
        {
            var access = await workspaceService.RequireAdminAsync(ct);
            if (request.Role is not ("admin" or "member"))
            {
                throw new ApiException(400, "Invalid membership");
            }

            var member = await ManageableMemberAsync(access, userId, ct);
            if (request.Role == "admin")
            {
                RequirePlatformAdmin();
            }

            member.Role = request.Role;
        }, ct);

    public Task UpdateTeamMemberRoleAsync(Guid teamId, Guid userId, TeamMemberRoleRequest request, CancellationToken ct) =>
        repository.ExecuteInTransactionAsync(async () =>
        {
            var access = await workspaceService.RequireAdminAsync(ct);
            if (request.TeamRole is not ("editor" or "viewer"))
            {
                throw new ApiException(400, "Invalid team role");
            }

            RequireTeam(access, teamId);
            await ManageableMemberAsync(access, userId, ct);
            var membership = (await repository.TeamMembershipsAsync(userId, ct)).FirstOrDefault(m => m.TeamId == teamId)
                ?? throw new ApiException(404, "Team membership not found");
            membership.Role = request.TeamRole;
        }, ct);

    public Task RemoveTeamMemberAsync(Guid teamId, Guid userId, CancellationToken ct) =>
        repository.ExecuteInTransactionAsync(async () =>
        {
            var access = await workspaceService.RequireAdminAsync(ct);
            RequireTeam(access, teamId);
            await ManageableMemberAsync(access, userId, ct);
            var membership = (await repository.TeamMembershipsAsync(userId, ct)).FirstOrDefault(m => m.TeamId == teamId)
                ?? throw new ApiException(404, "Team membership not found");
            repository.Remove(membership);
            await repository.ClearDefaultTeamAsync(userId, [teamId], ct);
        }, ct);

    public Task RemoveMemberAsync(Guid userId, CancellationToken ct) =>
        repository.ExecuteInTransactionAsync(async () =>
        {
            var access = await workspaceService.RequireAdminAsync(ct);
            var member = await ManageableMemberAsync(access, userId, ct);
            var teamIds = access.Teams.Select(t => t.Id).ToHashSet();
            foreach (var membership in await repository.TeamMembershipsAsync(userId, ct))
            {
                if (teamIds.Contains(membership.TeamId))
                {
                    repository.Remove(membership);
                }
            }

            repository.Remove(member);
            await repository.ClearDefaultTeamAsync(userId, teamIds, ct);
        }, ct);

    private async Task<OrganisationMember> ManageableMemberAsync(WorkspaceAccess access, Guid userId, CancellationToken ct)
    {
        var member = (await repository.MembersAsync(access.OrganisationId, ct)).FirstOrDefault(m => m.UserId == userId)
            ?? throw new ApiException(404, "Organisation member not found");
        RequireManageableMember(member);

        return member;
    }

    private void RequireManageableMember(OrganisationMember member)
    {
        var configuredAdministrator = workspaceService.IsConfiguredPlatformAdministrator(member.UserId);
        if ((member.Role == "admin" || configuredAdministrator) && !workspaceService.IsPlatformAdmin)
        {
            throw new ApiException(403, "Platform administrator required", "Only the platform administrator can change organisation administrators.");
        }
    }

    private void RequirePlatformAdmin()
    {
        if (!workspaceService.IsPlatformAdmin)
        {
            throw new ApiException(403, "Platform administrator required");
        }
    }

    private static void RequireTeam(WorkspaceAccess access, Guid teamId)
    {
        if (access.Teams.All(t => t.Id != teamId))
        {
            throw new ApiException(404, "Team not found");
        }
    }
}

using HockeyTrainer.Application.Authentication;
using HockeyTrainer.Application.Configuration;
using HockeyTrainer.Application.Contracts;
using HockeyTrainer.Domain.Models;
using HockeyTrainer.Application.Repositories;
using Microsoft.Extensions.Options;

namespace HockeyTrainer.Application.Services;

public sealed record WorkspaceAccess(Guid OrganisationId, Guid? TeamId, Guid UserId, bool IsAdmin,
    IReadOnlyList<Team> Teams, IReadOnlyList<TeamMember> Memberships, string OrganisationName)
{
    public bool CanEditTeam(Guid? teamId) => IsAdmin ||
        teamId is not null && Memberships.Any(m => m.TeamId == teamId && m.Role == "editor");
    public bool CanView(IOwnedContent content) => content.OrganisationId == OrganisationId &&
        (IsAdmin || content.OwnerTeamId is null || Memberships.Any(m => m.TeamId == content.OwnerTeamId));
    public bool CanEdit(IOwnedContent content) => CanView(content) && CanEditTeam(content.OwnerTeamId);
    public bool CanUseInPlan(IOwnedContent drill, Guid? planTeamId) =>
        CanView(drill) && drill.OwnerTeamId == planTeamId;
    public OwnershipResponse Describe(IOwnedContent content, string organisationName) => new(
        OrganisationId, content.OwnerTeamId,
        Teams.FirstOrDefault(t => t.Id == content.OwnerTeamId)?.Name ?? organisationName,
        content.OriginTeamId, Teams.FirstOrDefault(t => t.Id == content.OriginTeamId)?.Name,
        CanEdit(content), content.OwnerTeamId is null && TeamId is not null && CanEditTeam(TeamId),
        content.OwnerTeamId is not null && content.OwnerTeamId == TeamId && CanEdit(content));
}

public sealed class WorkspaceService(IWorkspaceRepository repository, IWorkspaceRequestContext requestContext,
    IAuthenticationContext auth, IOptions<WorkspaceOptions> workspaceOptions)
{
    private readonly WorkspaceOptions _workspaceOptions = workspaceOptions.Value;

    public Guid UserId => requestContext.UserId ??
        (!auth.Enabled ? WorkspaceDefaults.LocalUserId : throw new ApiException(401, "Sign in required"));
    public bool IsPlatformAdmin => !auth.Enabled ||
        IsConfiguredPlatformAdministrator(UserId);
    internal bool IsConfiguredPlatformAdministrator(Guid userId) =>
        Guid.TryParse(_workspaceOptions.LegacyAdminUserId, out var administratorId) && administratorId == userId;

    public async Task<WorkspaceResponse> GetAsync(CancellationToken ct)
    {
        var memberships = await repository.MembershipsAsync(UserId, ct);
        var teamMemberships = await TeamMembershipsAsync(ct);
        // An explicit administrator ID is required to adopt legacy hosted content. Never grant
        // its ownership to the first visitor or every authenticated Supabase user.
        if (IsConfiguredPlatformAdministrator(UserId) &&
            (memberships.All(m => m.OrganisationId != WorkspaceDefaults.OrganisationId) ||
             teamMemberships.All(m => m.TeamId != WorkspaceDefaults.TeamId)) &&
            (await repository.OrganisationsAsync([WorkspaceDefaults.OrganisationId], ct)).Count != 0)
        {
            var member = new OrganisationMember
            {
                OrganisationId = WorkspaceDefaults.OrganisationId,
                UserId = UserId,
                Role = "admin"
            };
            await repository.GrantLegacyAccessAsync(UserId, ct);
            if (memberships.All(m => m.OrganisationId != WorkspaceDefaults.OrganisationId))
            {
                memberships.Add(member);
            }

            teamMemberships = await TeamMembershipsAsync(ct);
        }
        var organisations = IsPlatformAdmin ? await repository.AllOrganisationsAsync(ct)
            : await repository.OrganisationsAsync(memberships.Select(m => m.OrganisationId), ct);
        var result = new List<OrganisationResponse>();
        foreach (var organisation in organisations)
        {
            var admin = IsPlatformAdmin || memberships.Single(m => m.OrganisationId == organisation.Id).Role == "admin";
            var teams = await repository.TeamsAsync(organisation.Id, ct);
            result.Add(new(organisation.Id, organisation.Name, admin,
                teams.Where(t => admin || teamMemberships.Any(m => m.TeamId == t.Id))
                    .Select(t => new TeamResponse(t.Id, t.Name,
                        admin || teamMemberships.Any(m => m.TeamId == t.Id && m.Role == "editor"),
                        admin || teamMemberships.Any(m => m.TeamId == t.Id),
                        teamMemberships.FirstOrDefault(m => m.TeamId == t.Id)?.Role)).ToList(),
                memberships.FirstOrDefault(m => m.OrganisationId == organisation.Id)?.Role));
        }

        return new(UserId, result, IsPlatformAdmin);
    }

    public async Task<WorkspaceAccess> AccessAsync(CancellationToken ct)
    {
        var workspaces = await GetAsync(ct);
        var organisationText = requestContext.OrganisationId;
        var teamText = requestContext.TeamId;
        var organisationId = string.IsNullOrEmpty(organisationText) && !auth.Enabled
            ? WorkspaceDefaults.OrganisationId : Guid.TryParse(organisationText, out var id) ? id : Guid.Empty;
        var organisation = workspaces.Organisations.FirstOrDefault(o => o.Id == organisationId)
            ?? throw new ApiException(403, "Choose an organisation", "Choose an organisation you belong to.");
        Guid? teamId = string.IsNullOrEmpty(teamText) ? (!auth.Enabled && string.IsNullOrEmpty(organisationText) ? WorkspaceDefaults.TeamId : null)
            : Guid.TryParse(teamText, out var parsed) ? parsed : throw new ApiException(400, "Invalid team");
        var memberships = await TeamMembershipsAsync(ct);
        if (teamId is not null && (organisation.Teams.All(t => t.Id != teamId) ||
            !organisation.IsAdmin && memberships.All(m => m.TeamId != teamId)))
        {
            throw new ApiException(403, "Team access denied");
        }

        return new(organisationId, teamId, UserId, organisation.IsAdmin,
            await repository.TeamsAsync(organisationId, ct), memberships, organisation.Name);
    }

    private async Task<List<TeamMember>> TeamMembershipsAsync(CancellationToken ct)
    {
        var memberships = await repository.TeamMembershipsAsync(UserId, ct);
        // The explicitly unauthenticated development workspace remains usable as a local POC.
        if (!auth.Enabled)
        {
            foreach (var membership in await repository.MembershipsAsync(UserId, ct))
            {
                foreach (var team in await repository.TeamsAsync(membership.OrganisationId, ct))
                {
                    if (memberships.All(m => m.TeamId != team.Id))
                    {
                        memberships.Add(new TeamMember
                        {
                            TeamId = team.Id,
                            UserId = UserId,
                            Role = "editor"
                        });
                    }
                }
            }
        }

        return memberships;
    }

    public async Task<OrganisationResponse> CreateAsync(OrganisationRequest request, CancellationToken ct)
    {
        RequirePlatformAdmin();
        var name = Name(request.Name);
        var organisation = new Organisation
        {
            Id = Guid.NewGuid(),
            Name = name
        };
        repository.Add(organisation);
        repository.Add(new OrganisationMember
        {
            OrganisationId = organisation.Id,
            UserId = UserId,
            Role = "admin"
        });
        await repository.SaveAsync(ct);

        return new(organisation.Id, name, true, [], "admin");
    }

    public async Task<TeamResponse> CreateTeamAsync(TeamRequest request, CancellationToken ct)
    {
        var access = await RequireAdminAsync(ct);
        var team = new Team
        {
            Id = Guid.NewGuid(),
            OrganisationId = access.OrganisationId,
            Name = Name(request.Name)
        };
        repository.Add(team);
        repository.Add(new TeamMember
        {
            TeamId = team.Id,
            UserId = UserId,
            Role = "editor"
        });
        await repository.SaveAsync(ct);

        return new(team.Id, team.Name, true, true, "editor");
    }

    public async Task<WorkspaceAccess> RequireAdminAsync(CancellationToken ct)
    {
        var access = await AccessAsync(ct);
        if (!access.IsAdmin)
        {
            throw new ApiException(403, "Organisation administrator required");
        }

        return access;
    }

    private void RequirePlatformAdmin()
    {
        if (!IsPlatformAdmin)
        {
            throw new ApiException(403, "Platform administrator required");
        }
    }

    private static string Name(string? value) => !string.IsNullOrWhiteSpace(value) && value.Trim().Length <= 120
        ? value.Trim() : throw new ApiException(400, "Invalid name", "Use a name of 1–120 characters.");
}

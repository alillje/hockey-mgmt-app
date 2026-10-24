using HockeyTrainer.Api.Authentication;
using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Models;
using HockeyTrainer.Api.Repositories;

namespace HockeyTrainer.Api.Services;

public sealed record WorkspaceAccess(Guid OrganisationId, Guid? TeamId, Guid UserId, bool IsAdmin,
    IReadOnlyList<Team> Teams, IReadOnlyList<TeamMember> Memberships, string OrganisationName)
{
    public bool CanEditTeam(Guid? teamId) => teamId is null ? IsAdmin : IsAdmin ||
        Memberships.Any(m => m.TeamId == teamId && m.Role == "editor");
    public bool CanView(IOwnedContent content) => content.OrganisationId == OrganisationId &&
        (IsAdmin || content.Visibility == "organisation" ||
         (content.OwnerTeamId is not null && Memberships.Any(m => m.TeamId == content.OwnerTeamId)));
    public bool CanEdit(IOwnedContent content) => content.OrganisationId == OrganisationId && CanEditTeam(content.OwnerTeamId);
    public bool CanUseInPlan(IOwnedContent drill, Guid? planTeamId, string visibility) =>
        CanView(drill) && (drill.Visibility == "organisation" ||
            (visibility == "team" && planTeamId is not null && drill.OwnerTeamId == planTeamId));
    public OwnershipResponse Describe(IOwnedContent content, string organisationName) => new(
        OrganisationId, content.OwnerTeamId,
        Teams.FirstOrDefault(t => t.Id == content.OwnerTeamId)?.Name ?? organisationName,
        content.OriginTeamId, Teams.FirstOrDefault(t => t.Id == content.OriginTeamId)?.Name,
        content.Visibility, CanEdit(content), TeamId is not null && CanEditTeam(TeamId));
}

public sealed class WorkspaceService(WorkspaceRepository repository, IHttpContextAccessor http,
    AuthConfiguration auth, IConfiguration configuration, CatalogService catalog)
{
    public Guid UserId => Guid.TryParse(http.HttpContext?.User.FindFirst("sub")?.Value, out var id)
        ? id : !auth.Enabled ? WorkspaceDefaults.LocalUserId : throw new ApiException(401, "Sign in required");

    public async Task<WorkspaceResponse> GetAsync(CancellationToken ct)
    {
        var memberships = await repository.MembershipsAsync(UserId, ct);
        // An explicit administrator ID is required to adopt legacy hosted content. Never grant
        // its ownership to the first visitor or every authenticated Supabase user.
        if (Guid.TryParse(configuration["Workspace:LegacyAdminUserId"], out var legacyAdminId) && legacyAdminId == UserId &&
            memberships.All(m => m.OrganisationId != WorkspaceDefaults.OrganisationId))
        {
            var member = new OrganisationMember { OrganisationId = WorkspaceDefaults.OrganisationId, UserId = UserId, Role = "admin" };
            await repository.GrantLegacyAccessAsync(UserId, ct);
            memberships.Add(member);
        }
        var organisations = await repository.OrganisationsAsync(memberships.Select(m => m.OrganisationId), ct);
        var teamMemberships = await repository.TeamMembershipsAsync(UserId, ct);
        var result = new List<OrganisationResponse>();
        foreach (var organisation in organisations)
        {
            var admin = memberships.Single(m => m.OrganisationId == organisation.Id).Role == "admin";
            var teams = await repository.TeamsAsync(organisation.Id, ct);
            result.Add(new(organisation.Id, organisation.Name, admin,
                teams.Where(t => admin || teamMemberships.Any(m => m.TeamId == t.Id))
                    .Select(t => new TeamResponse(t.Id, t.Name, t.AgeGroup,
                        admin || teamMemberships.Any(m => m.TeamId == t.Id && m.Role == "editor"))).ToList()));
        }
        return new(UserId, result);
    }

    public async Task<WorkspaceAccess> AccessAsync(CancellationToken ct)
    {
        var workspaces = await GetAsync(ct);
        var headers = http.HttpContext?.Request.Headers;
        var organisationText = headers?["X-Organisation-Id"].ToString();
        var teamText = headers?["X-Team-Id"].ToString();
        var organisationId = string.IsNullOrEmpty(organisationText) && !auth.Enabled
            ? WorkspaceDefaults.OrganisationId : Guid.TryParse(organisationText, out var id) ? id : Guid.Empty;
        var organisation = workspaces.Organisations.FirstOrDefault(o => o.Id == organisationId)
            ?? throw new ApiException(403, "Choose an organisation", "Choose an organisation you belong to.");
        Guid? teamId = string.IsNullOrEmpty(teamText) ? (!auth.Enabled && string.IsNullOrEmpty(organisationText) ? WorkspaceDefaults.TeamId : null)
            : Guid.TryParse(teamText, out var parsed) ? parsed : throw new ApiException(400, "Invalid team");
        if (teamId is not null && organisation.Teams.All(t => t.Id != teamId))
            throw new ApiException(403, "Team access denied");
        return new(organisationId, teamId, UserId, organisation.IsAdmin,
            await repository.TeamsAsync(organisationId, ct), await repository.TeamMembershipsAsync(UserId, ct), organisation.Name);
    }

    public async Task<OrganisationResponse> CreateAsync(OrganisationRequest request, CancellationToken ct)
    {
        var name = Name(request.Name);
        var organisation = new Organisation { Id = Guid.NewGuid(), Name = name };
        repository.Add(organisation);
        repository.Add(new OrganisationMember { OrganisationId = organisation.Id, UserId = UserId, Role = "admin" });
        await repository.SaveAsync(ct);
        return new(organisation.Id, name, true, []);
    }

    public async Task<TeamResponse> CreateTeamAsync(TeamRequest request, CancellationToken ct)
    {
        var access = await RequireAdminAsync(ct);
        var team = new Team
        {
            Id = Guid.NewGuid(),
            OrganisationId = access.OrganisationId,
            Name = Name(request.Name),
            AgeGroup = await catalog.ResolveAgeGroupAsync(request.AgeGroup, null, null, ct)
        };
        repository.Add(team);
        await repository.SaveAsync(ct);
        return new(team.Id, team.Name, team.AgeGroup, true);
    }

    public async Task<List<MemberResponse>> MembersAsync(CancellationToken ct)
    {
        var access = await RequireAdminAsync(ct);
        var result = new List<MemberResponse>();
        foreach (var member in await repository.MembersAsync(access.OrganisationId, ct))
        {
            var teams = (await repository.TeamMembershipsAsync(member.UserId, ct))
                .Where(m => access.Teams.Any(t => t.Id == m.TeamId)).ToList();
            if (teams.Count == 0) result.Add(new(member.UserId, member.Role, null, null));
            else result.AddRange(teams.Select(m => new MemberResponse(member.UserId, member.Role, m.TeamId, m.Role)));
        }
        return result;
    }

    public async Task AddMemberAsync(MemberRequest request, CancellationToken ct)
    {
        var access = await RequireAdminAsync(ct);
        if (request.UserId == Guid.Empty || request.Role is not ("admin" or "member") || request.TeamRole is not ("editor" or "viewer"))
            throw new ApiException(400, "Invalid membership");
        if (request.TeamId is not null && access.Teams.All(t => t.Id != request.TeamId))
            throw new ApiException(400, "Unknown team");
        // This endpoint adds access. Role removals/demotions need a separate dependency review.
        var members = await repository.MembersAsync(access.OrganisationId, ct);
        var existing = members.FirstOrDefault(m => m.UserId == request.UserId);
        if (existing is null) repository.Add(new OrganisationMember { OrganisationId = access.OrganisationId, UserId = request.UserId, Role = request.Role });
        else if (request.Role == "admin") existing.Role = "admin";
        if (request.TeamId is not null)
        {
            var teamMember = (await repository.TeamMembershipsAsync(request.UserId, ct)).FirstOrDefault(m => m.TeamId == request.TeamId);
            if (teamMember is null) repository.Add(new TeamMember { TeamId = request.TeamId.Value, UserId = request.UserId, Role = request.TeamRole });
            else if (request.TeamRole == "editor") teamMember.Role = "editor";
        }
        await repository.SaveAsync(ct);
    }

    public async Task<WorkspaceAccess> RequireAdminAsync(CancellationToken ct)
    {
        var access = await AccessAsync(ct);
        if (!access.IsAdmin) throw new ApiException(403, "Organisation administrator required");
        return access;
    }

    private static string Name(string? value) => !string.IsNullOrWhiteSpace(value) && value.Trim().Length <= 120
        ? value.Trim() : throw new ApiException(400, "Invalid name", "Use a name of 1–120 characters.");
}

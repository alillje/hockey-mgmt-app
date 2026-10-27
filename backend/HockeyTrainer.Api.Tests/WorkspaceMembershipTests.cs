using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using HockeyTrainer.Application.Contracts;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed class WorkspaceMembershipTests
{
    [Fact]
    public async Task OnlyConfiguredPlatformAdministratorCreatesOrganisationsAndAppointsAdministrators()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var platform = Client(app, app.PlatformAdminId);
        using var outsider = Client(app, Guid.NewGuid());
        var empty = (await outsider.GetFromJsonAsync<WorkspaceResponse>("/api/workspace"))!;
        Assert.False(empty.IsPlatformAdmin);
        Assert.Empty(empty.Organisations);
        Assert.True((await platform.GetFromJsonAsync<WorkspaceResponse>("/api/workspace"))!.IsPlatformAdmin);
        Assert.Equal(HttpStatusCode.Forbidden, (await outsider.PostAsJsonAsync("/api/workspace/organisations", new OrganisationRequest("Denied"))).StatusCode);
        var org = await CreateOrganisation(platform, "Club");
        Select(platform, org.Id);
        var administratorId = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.NoContent, (await platform.PostAsJsonAsync("/api/workspace/members", new MemberRequest(administratorId, "admin"))).StatusCode);
        using var administrator = Client(app, administratorId, org.Id);
        Assert.Equal(HttpStatusCode.Forbidden, (await administrator.PostAsJsonAsync("/api/workspace/organisations", new OrganisationRequest("Denied"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await administrator.PostAsJsonAsync("/api/workspace/members", new MemberRequest(Guid.NewGuid(), "admin"))).StatusCode);
        var team = await CreateTeam(administrator, "Team");
        Select(administrator, org.Id, team.Id);
        var workspace = (await administrator.GetFromJsonAsync<WorkspaceResponse>("/api/workspace"))!;
        Assert.True(Assert.Single(Assert.Single(workspace.Organisations).Teams).CanEdit);
        using var member = Client(app, Guid.NewGuid(), org.Id);
        var memberId = (await member.GetFromJsonAsync<WorkspaceResponse>("/api/workspace"))!.UserId;
        await administrator.PostAsJsonAsync("/api/workspace/members", new MemberRequest(memberId, "member"));
        Assert.Equal(HttpStatusCode.Forbidden, (await member.PostAsJsonAsync("/api/workspace/teams", new TeamRequest("Denied"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await administrator.PutAsJsonAsync($"/api/workspace/members/{memberId}", new MemberRoleRequest("admin"))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await platform.PutAsJsonAsync($"/api/workspace/members/{memberId}", new MemberRoleRequest("admin"))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await platform.PutAsJsonAsync($"/api/workspace/members/{memberId}", new MemberRoleRequest("member"))).StatusCode);
    }

    [Fact]
    public async Task OrganisationAdministratorsCannotChangeOrRemoveOtherAdministrators()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var platform = Client(app, app.PlatformAdminId);
        var org = await CreateOrganisation(platform, "Protected administrators");
        Select(platform, org.Id);
        var team = await CreateTeam(platform, "Team");
        var firstId = Guid.NewGuid();
        var secondId = Guid.NewGuid();
        foreach (var id in new[] { firstId, secondId })
        {
            await platform.PostAsJsonAsync("/api/workspace/members", new MemberRequest(id, "admin", team.Id, "editor"));
        }

        using var first = Client(app, firstId, org.Id);
        Assert.Equal(HttpStatusCode.Forbidden, (await first.PutAsJsonAsync($"/api/workspace/members/{secondId}", new MemberRoleRequest("member"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await first.DeleteAsync($"/api/workspace/members/{secondId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await first.DeleteAsync($"/api/workspace/teams/{team.Id}/members/{secondId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await first.PutAsJsonAsync($"/api/workspace/teams/{team.Id}/members/{secondId}", new TeamMemberRoleRequest("viewer"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await first.PostAsJsonAsync("/api/workspace/members", new MemberRequest(secondId, "member", team.Id, "editor"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await first.DeleteAsync($"/api/workspace/members/{firstId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await platform.DeleteAsync($"/api/workspace/members/{secondId}")).StatusCode);
    }

    [Fact]
    public async Task RoleChangesAndTeamRemovalApplyToExistingTokensAndPreserveContent()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var platform = Client(app, app.PlatformAdminId);
        var org = await CreateOrganisation(platform, "Access changes");
        Select(platform, org.Id);
        var team = await CreateTeam(platform, "Team");
        var administratorId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        await platform.PostAsJsonAsync("/api/workspace/members", new MemberRequest(administratorId, "admin"));
        using var administrator = Client(app, administratorId, org.Id, team.Id);
        using var member = Client(app, memberId, org.Id, team.Id);
        await administrator.PostAsJsonAsync("/api/workspace/members", new MemberRequest(memberId, "member", team.Id, "viewer"));
        Assert.Equal(HttpStatusCode.BadRequest, (await administrator.PutAsJsonAsync($"/api/workspace/teams/{team.Id}/members/{memberId}", new TeamMemberRoleRequest("admin"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.PostAsJsonAsync("/api/drills", Drill())).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await administrator.PutAsJsonAsync($"/api/workspace/teams/{team.Id}/members/{memberId}", new TeamMemberRoleRequest("editor"))).StatusCode);
        var created = await member.PostAsJsonAsync("/api/drills", Drill());
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var drill = (await created.Content.ReadFromJsonAsync<DrillResponse>())!;
        await member.PutAsJsonAsync("/api/account/preferences", new AccountPreferencesRequest(team.Id));
        Assert.Equal(HttpStatusCode.NoContent, (await administrator.PutAsJsonAsync($"/api/workspace/teams/{team.Id}/members/{memberId}", new TeamMemberRoleRequest("viewer"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.PutAsJsonAsync($"/api/drills/{drill.Id}", Drill())).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await member.GetAsync($"/api/drills/{drill.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await administrator.DeleteAsync($"/api/workspace/teams/{team.Id}/members/{memberId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync($"/api/drills/{drill.Id}")).StatusCode);
        Assert.Null((await member.GetFromJsonAsync<AccountPreferencesResponse>("/api/account/preferences"))!.DefaultTeamId);
        Assert.Equal(HttpStatusCode.OK, (await administrator.GetAsync($"/api/drills/{drill.Id}")).StatusCode);
        // The member still has organisation-library access, but cannot regain team access through headers.
        Select(member, org.Id);
        Assert.Empty((await member.GetFromJsonAsync<List<DrillResponse>>("/api/drills"))!);
    }

    [Fact]
    public async Task OrganisationRemovalClearsOnlyItsTeamAccessAndRejectsCrossOrganisationChanges()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var platform = Client(app, app.PlatformAdminId);
        var first = await CreateOrganisation(platform, "First");
        Select(platform, first.Id);
        var firstTeam = await CreateTeam(platform, "First team");
        var anotherTeam = await CreateTeam(platform, "Another team");
        var administratorId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        await platform.PostAsJsonAsync("/api/workspace/members", new MemberRequest(administratorId, "admin"));
        await platform.PostAsJsonAsync("/api/workspace/members", new MemberRequest(userId, "member", firstTeam.Id, "editor"));
        await platform.PostAsJsonAsync("/api/workspace/members", new MemberRequest(userId, "member", anotherTeam.Id, "viewer"));
        var second = await CreateOrganisation(platform, "Second");
        Select(platform, second.Id);
        var secondTeam = await CreateTeam(platform, "Second team");
        await platform.PostAsJsonAsync("/api/workspace/members", new MemberRequest(userId, "member", secondTeam.Id, "viewer"));
        using var administrator = Client(app, administratorId, first.Id);
        using var member = Client(app, userId, first.Id, firstTeam.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await administrator.DeleteAsync($"/api/workspace/teams/{secondTeam.Id}/members/{userId}")).StatusCode);
        Select(administrator, second.Id);
        Assert.Equal(HttpStatusCode.Forbidden, (await administrator.DeleteAsync($"/api/workspace/members/{userId}")).StatusCode);
        Select(administrator, first.Id);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.DeleteAsync($"/api/workspace/members/{administratorId}")).StatusCode);
        await member.PutAsJsonAsync("/api/account/preferences", new AccountPreferencesRequest(firstTeam.Id));
        Assert.Equal(HttpStatusCode.NoContent, (await administrator.DeleteAsync($"/api/workspace/members/{userId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync("/api/drills")).StatusCode);
        var remaining = (await member.GetFromJsonAsync<WorkspaceResponse>("/api/workspace"))!;
        Assert.Equal(second.Id, Assert.Single(remaining.Organisations).Id);
        Assert.Equal(secondTeam.Id, Assert.Single(remaining.Organisations[0].Teams).Id);
        // Rejoining the first organisation does not resurrect its old team memberships.
        await administrator.PostAsJsonAsync("/api/workspace/members", new MemberRequest(userId, "member"));
        var rejoined = (await member.GetFromJsonAsync<WorkspaceResponse>("/api/workspace"))!;
        Assert.Empty(rejoined.Organisations.Single(org => org.Id == first.Id).Teams);
        Select(member, first.Id, anotherTeam.Id);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync("/api/drills")).StatusCode);
    }

    private static HttpClient Client(AuthenticationTests.AuthenticatedApplication app, Guid userId, Guid? organisationId = null, Guid? teamId = null)
    {
        var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", app.Token(userId));
        if (organisationId is Guid id)
        {
            Select(client, id, teamId);
        }

        return client;
    }

    private static void Select(HttpClient client, Guid organisationId, Guid? teamId = null)
    {
        client.DefaultRequestHeaders.Remove("X-Organisation-Id");
        client.DefaultRequestHeaders.Remove("X-Team-Id");
        client.DefaultRequestHeaders.Add("X-Organisation-Id", organisationId.ToString());
        if (teamId is Guid id)
        {
            client.DefaultRequestHeaders.Add("X-Team-Id", id.ToString());
        }
    }

    private static async Task<OrganisationResponse> CreateOrganisation(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync("/api/workspace/organisations", new OrganisationRequest(name));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        return (await response.Content.ReadFromJsonAsync<OrganisationResponse>())!;
    }

    private static async Task<TeamResponse> CreateTeam(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync("/api/workspace/teams", new TeamRequest(name));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        return (await response.Content.ReadFromJsonAsync<TeamResponse>())!;
    }

    private static DrillRequest Drill() => new("Preserved team drill", "skating", "", new Diagram(1, [], []));
}

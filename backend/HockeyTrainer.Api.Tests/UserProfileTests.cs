using System.Net;
using System.Net.Http.Json;
using HockeyTrainer.Application.Contracts;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed class UserProfileTests
{
    [Fact]
    public async Task ProfileIsRequiredValidatedAndAlwaysOwnedByTheAuthenticatedUser()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/account/profile")).StatusCode);
        app.AuthenticateClient(client, app.PlatformAdminId, completeProfile: false);
        Assert.False((await client.GetFromJsonAsync<UserProfileResponse>("/api/account/profile"))!.IsComplete);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/workspace/organisations", new OrganisationRequest("Blocked"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/account/profile", new UserProfileRequest(" ", "Coach"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/account/profile", new UserProfileRequest(new string('x', 101), "Coach"))).StatusCode);
        var otherId = Guid.NewGuid();
        var saved = await client.PutAsJsonAsync("/api/account/profile", new { firstName = " Åsa ", lastName = " O'Neill ", userId = otherId, email = "forged@example.com", role = "admin" });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var profile = (await saved.Content.ReadFromJsonAsync<UserProfileResponse>())!;
        Assert.True(profile.IsComplete);
        Assert.Equal("Åsa", profile.FirstName);
        Assert.Equal("O'Neill", profile.LastName);
        Assert.Equal("coach@example.com", profile.Email);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/workspace/organisations", new OrganisationRequest("Allowed"))).StatusCode);
        using var other = app.CreateClient();
        app.AuthenticateClient(other, otherId, completeProfile: false);
        Assert.False((await other.GetFromJsonAsync<UserProfileResponse>("/api/account/profile"))!.IsComplete);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/account/profile", new UserProfileRequest("Updated", "Name"))).StatusCode);
        Assert.Equal("Updated", (await client.GetFromJsonAsync<UserProfileResponse>("/api/account/profile"))!.FirstName);
    }

    [Fact]
    public async Task TeamRosterIsScopedToCurrentMembershipAndDoesNotExposeEmails()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var admin = app.CreateClient();
        app.AuthenticateClient(admin, app.PlatformAdminId);
        await admin.PutAsJsonAsync("/api/account/profile", new UserProfileRequest("Organisation", "Admin"));
        var org = (await (await admin.PostAsJsonAsync("/api/workspace/organisations", new OrganisationRequest("Club"))).Content.ReadFromJsonAsync<OrganisationResponse>())!;
        admin.DefaultRequestHeaders.Add("X-Organisation-Id", org.Id.ToString());
        var team = (await (await admin.PostAsJsonAsync("/api/workspace/teams", new TeamRequest("My team"))).Content.ReadFromJsonAsync<TeamResponse>())!;
        var foreignTeam = (await (await admin.PostAsJsonAsync("/api/workspace/teams", new TeamRequest("Other team"))).Content.ReadFromJsonAsync<TeamResponse>())!;
        await admin.DeleteAsync($"/api/workspace/teams/{team.Id}/members/{app.PlatformAdminId}");
        var viewerId = Guid.NewGuid();
        var foreignId = Guid.NewGuid();
        await admin.PostAsJsonAsync("/api/workspace/members", new MemberRequest(viewerId, "member", team.Id, "viewer"));
        await admin.PostAsJsonAsync("/api/workspace/members", new MemberRequest(foreignId, "member", foreignTeam.Id, "editor"));
        using var viewer = app.CreateClient();
        app.AuthenticateClient(viewer, viewerId);
        await viewer.PutAsJsonAsync("/api/account/profile", new UserProfileRequest("Team", "Viewer"));
        viewer.DefaultRequestHeaders.Add("X-Organisation-Id", org.Id.ToString());
        var response = await viewer.GetAsync($"/api/workspace/teams/{team.Id}/members");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain("email", await response.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
        var roster = (await response.Content.ReadFromJsonAsync<TeamDirectoryResponse>())!;
        var member = Assert.Single(roster.Members);
        Assert.Equal(viewerId, member.UserId);
        Assert.Equal("Viewer", member.LastName);
        Assert.Equal("viewer", member.Role);
        Assert.Equal(app.PlatformAdminId, Assert.Single(roster.Administrators).UserId);
        Assert.DoesNotContain(roster.Members, entry => entry.UserId == app.PlatformAdminId || entry.UserId == foreignId);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.GetAsync($"/api/workspace/teams/{foreignTeam.Id}/members")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.GetAsync("/api/workspace/members")).StatusCode);
        viewer.DefaultRequestHeaders.Remove("X-Organisation-Id");
        viewer.DefaultRequestHeaders.Add("X-Organisation-Id", Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.GetAsync($"/api/workspace/teams/{team.Id}/members")).StatusCode);
        viewer.DefaultRequestHeaders.Remove("X-Organisation-Id");
        viewer.DefaultRequestHeaders.Add("X-Organisation-Id", org.Id.ToString());
        var workspaces = (await viewer.GetFromJsonAsync<WorkspaceResponse>("/api/workspace"))!;
        var membership = Assert.Single(workspaces.Organisations);
        Assert.Equal("member", membership.Role);
        Assert.Equal("viewer", Assert.Single(membership.Teams).Role);
        var adminList = (await admin.GetFromJsonAsync<List<MemberResponse>>("/api/workspace/members"))!;
        Assert.Equal("Team", Assert.Single(adminList, entry => entry.UserId == viewerId).FirstName);
        Assert.Equal("coach@example.com", Assert.Single(adminList, entry => entry.UserId == viewerId).Email);
        await admin.DeleteAsync($"/api/workspace/teams/{team.Id}/members/{viewerId}");
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.GetAsync($"/api/workspace/teams/{team.Id}/members")).StatusCode);
    }
}

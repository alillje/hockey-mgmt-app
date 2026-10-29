using System.Net;
using System.Net.Http.Json;
using HockeyTrainer.Application.Contracts;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed class EmailMembershipTests
{
    [Fact]
    public async Task EmailAddsExistingUserToOrganisationAndTeamAndPreservesExistingAccess()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var admin = app.CreateClient();
        app.AuthenticateClient(admin, app.PlatformAdminId);
        var org = await CreateOrganisationAsync(admin);
        admin.DefaultRequestHeaders.Add("X-Organisation-Id", org.Id.ToString());
        var team = await (await admin.PostAsJsonAsync("/api/workspace/teams", new TeamRequest("Team"))).Content.ReadFromJsonAsync<TeamResponse>();
        var userId = Guid.NewGuid();
        app.AuthUsers.Users.Add("coach@example.com", userId);
        var body = new MemberEmailRequest("  COACH@EXAMPLE.COM  ", "member", team!.Id, "editor");
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsJsonAsync("/api/workspace/members/by-email", body)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsJsonAsync("/api/workspace/members/by-email",
            body with { Email = "coach@example.com", TeamRole = "viewer" })).StatusCode);
        var members = await admin.GetFromJsonAsync<List<MemberResponse>>("/api/workspace/members");
        var added = Assert.Single(members!, m => m.UserId == userId);
        Assert.Equal(team.Id, added.TeamId);
        Assert.Equal("editor", added.TeamRole);
        Assert.Equal("member", added.Role);

        var organisationOnly = Guid.NewGuid();
        app.AuthUsers.Users.Add("other@example.com", organisationOnly);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsJsonAsync("/api/workspace/members/by-email",
            new MemberEmailRequest("other@example.com", "member"))).StatusCode);
        members = await admin.GetFromJsonAsync<List<MemberResponse>>("/api/workspace/members");
        Assert.Null(Assert.Single(members!, m => m.UserId == organisationOnly).TeamId);
    }

    [Fact]
    public async Task MissingUserAndInvalidEmailDoNotCreateMembership()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var admin = app.CreateClient();
        app.AuthenticateClient(admin, app.PlatformAdminId);
        var org = await CreateOrganisationAsync(admin);
        admin.DefaultRequestHeaders.Add("X-Organisation-Id", org.Id.ToString());
        using var missing = await admin.PostAsJsonAsync("/api/workspace/members/by-email", new MemberEmailRequest("missing@example.com", "member"));
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Contains("No registered user was found with that email address.", await missing.Content.ReadAsStringAsync());
        var lookups = app.AuthUsers.LookupCount;
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/workspace/members/by-email",
            new MemberEmailRequest("not-an-email", "member"))).StatusCode);
        Assert.Equal(lookups, app.AuthUsers.LookupCount);
        Assert.Single((await admin.GetFromJsonAsync<List<MemberResponse>>("/api/workspace/members"))!);
    }

    [Fact]
    public async Task AuthorisationPrecedesLookupAndAdministratorProtectionsRemain()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var platform = app.CreateClient();
        app.AuthenticateClient(platform, app.PlatformAdminId);
        var org = await CreateOrganisationAsync(platform);
        platform.DefaultRequestHeaders.Add("X-Organisation-Id", org.Id.ToString());
        var adminId = Guid.NewGuid();
        var memberId = Guid.NewGuid();
        await platform.PostAsJsonAsync("/api/workspace/members", new MemberRequest(adminId, "admin"));
        await platform.PostAsJsonAsync("/api/workspace/members", new MemberRequest(memberId, "member"));
        app.AuthUsers.Users.Add("platform@example.com", app.PlatformAdminId);
        app.AuthUsers.Users.Add("member@example.com", memberId);
        using var administrator = app.CreateClient();
        app.AuthenticateClient(administrator, adminId);
        administrator.DefaultRequestHeaders.Add("X-Organisation-Id", org.Id.ToString());
        using var member = app.CreateClient();
        app.AuthenticateClient(member, memberId);
        member.DefaultRequestHeaders.Add("X-Organisation-Id", org.Id.ToString());
        using var anonymous = app.CreateClient();
        var body = new MemberEmailRequest("member@example.com", "member");
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync("/api/workspace/members/by-email", body)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.PostAsJsonAsync("/api/workspace/members/by-email", body)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await administrator.PostAsJsonAsync("/api/workspace/members/by-email", body with { Role = "admin" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await administrator.PostAsJsonAsync("/api/workspace/members/by-email", body with { TeamId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(0, app.AuthUsers.LookupCount);
        Assert.Equal(HttpStatusCode.NoContent, (await administrator.PostAsJsonAsync("/api/workspace/members/by-email", body)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await administrator.PostAsJsonAsync("/api/workspace/members/by-email",
            body with { Email = "platform@example.com" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await platform.PostAsJsonAsync("/api/workspace/members/by-email", body with { Role = "admin" })).StatusCode);
    }

    private static async Task<OrganisationResponse> CreateOrganisationAsync(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/workspace/organisations", new OrganisationRequest("Email lookup club"));

        return (await response.Content.ReadFromJsonAsync<OrganisationResponse>())!;
    }
}

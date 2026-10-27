using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using HockeyTrainer.Application.Contracts;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed class AccountPreferencesTests
{
    [Fact]
    public async Task DefaultTeamIsAutomaticForOneTeamPersistentForSeveralAndPrivateToEachUser()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        var adminId = app.PlatformAdminId;
        using var admin = app.CreateClient();
        admin.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", app.Token(adminId));
        Assert.Empty((await admin.GetFromJsonAsync<WorkspaceResponse>("/api/workspace"))!.Organisations);
        Assert.Null((await admin.GetFromJsonAsync<AccountPreferencesResponse>("/api/account/preferences"))!.DefaultTeamId);
        var org = (await (await admin.PostAsJsonAsync("/api/workspace/organisations", new OrganisationRequest("Default team club"))).Content.ReadFromJsonAsync<OrganisationResponse>())!;
        admin.DefaultRequestHeaders.Add("X-Organisation-Id", org.Id.ToString());
        var first = (await (await admin.PostAsJsonAsync("/api/workspace/teams", new TeamRequest("First team"))).Content.ReadFromJsonAsync<TeamResponse>())!;
        Assert.Equal(first.Id, (await admin.GetFromJsonAsync<AccountPreferencesResponse>("/api/account/preferences"))!.DefaultTeamId);
        var second = (await (await admin.PostAsJsonAsync("/api/workspace/teams", new TeamRequest("Second team"))).Content.ReadFromJsonAsync<TeamResponse>())!;
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync("/api/account/preferences", new AccountPreferencesRequest(first.Id))).StatusCode);
        Assert.Equal(first.Id, (await admin.GetFromJsonAsync<AccountPreferencesResponse>("/api/account/preferences"))!.DefaultTeamId);
        var otherId = Guid.NewGuid();
        using var other = app.CreateClient();
        other.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", app.Token(otherId));
        Assert.Equal(HttpStatusCode.Forbidden, (await other.PutAsJsonAsync("/api/account/preferences", new AccountPreferencesRequest(first.Id))).StatusCode);
        Assert.Null((await other.GetFromJsonAsync<AccountPreferencesResponse>("/api/account/preferences"))!.DefaultTeamId);
        await admin.PostAsJsonAsync("/api/workspace/members", new MemberRequest(otherId, "member", second.Id, "viewer"));
        Assert.Equal(second.Id, (await other.GetFromJsonAsync<AccountPreferencesResponse>("/api/account/preferences"))!.DefaultTeamId);
        Assert.Equal(HttpStatusCode.Forbidden, (await other.PutAsJsonAsync("/api/account/preferences", new AccountPreferencesRequest(first.Id))).StatusCode);
        Assert.Equal(first.Id, (await admin.GetFromJsonAsync<AccountPreferencesResponse>("/api/account/preferences"))!.DefaultTeamId);
    }
}

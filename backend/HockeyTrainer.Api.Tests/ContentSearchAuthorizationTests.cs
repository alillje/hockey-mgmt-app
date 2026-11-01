using System.Net;
using System.Net.Http.Json;
using HockeyTrainer.Application.Contracts;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed class ContentSearchAuthorizationTests
{
    [Fact]
    public async Task PagesAndCountsOnlyIncludeAuthorisedSourcesAndForeignDetailsAreDenied()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var admin = app.CreateClient();
        app.AuthenticateClient(admin, app.PlatformAdminId);
        var club = (await (await admin.PostAsJsonAsync("/api/workspace/organisations", new OrganisationRequest("Pagination club")))
            .Content.ReadFromJsonAsync<OrganisationResponse>())!;
        admin.DefaultRequestHeaders.Add("X-Organisation-Id", club.Id.ToString());
        var first = (await (await admin.PostAsJsonAsync("/api/workspace/teams", new TeamRequest("First"))).Content.ReadFromJsonAsync<TeamResponse>())!;
        var second = (await (await admin.PostAsJsonAsync("/api/workspace/teams", new TeamRequest("Second"))).Content.ReadFromJsonAsync<TeamResponse>())!;
        var userId = Guid.NewGuid();
        await admin.PostAsJsonAsync("/api/workspace/members", new MemberRequest(userId, "member", first.Id, "viewer"));
        admin.DefaultRequestHeaders.Add("X-Team-Id", first.Id.ToString());
        var visible = (await (await admin.PostAsJsonAsync("/api/drills", new DrillRequest("Visible", "skating", Diagram: new Diagram(1, [], []), Tags: ["Skating"])))
            .Content.ReadFromJsonAsync<DrillResponse>())!;
        admin.DefaultRequestHeaders.Remove("X-Team-Id");
        admin.DefaultRequestHeaders.Add("X-Team-Id", second.Id.ToString());
        var hidden = (await (await admin.PostAsJsonAsync("/api/drills", new DrillRequest("Private", "shooting", Diagram: new Diagram(1, [], []), Tags: ["Shooting"])))
            .Content.ReadFromJsonAsync<DrillResponse>())!;
        var plan = (await (await admin.PostAsJsonAsync("/api/trainings", new TrainingRequest("Private plan", Items: [new(hidden.Id, 10)])))
            .Content.ReadFromJsonAsync<TrainingResponse>())!;
        using var viewer = app.CreateClient();
        app.AuthenticateClient(viewer, userId);
        viewer.DefaultRequestHeaders.Add("X-Organisation-Id", club.Id.ToString());
        viewer.DefaultRequestHeaders.Add("X-Team-Id", first.Id.ToString());
        var page = (await viewer.GetFromJsonAsync<ContentPageResponse>("/api/drills/search"))!;
        Assert.Equal(visible.Id, Assert.Single(page.Items).Id);
        Assert.Equal(1, page.TotalCount);
        Assert.Equal(0, page.Categories.Single(category => category.Label == "Shooting").Count);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.GetAsync($"/api/drills/search?source={second.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await viewer.GetAsync($"/api/trainings/{plan.Id}/details")).StatusCode);
        var library = (await viewer.GetFromJsonAsync<ContentPageResponse>("/api/drills/search?source=club"))!;
        Assert.Empty(library.Items);
        Assert.Equal(0, library.SourceCount);
    }
}

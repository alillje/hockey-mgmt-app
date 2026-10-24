using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Data;
using HockeyTrainer.Api.Models;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed class ClubLibraryTests
{
    [Fact]
    public async Task MembershipAndOwnershipAreEnforcedEvenWithSpoofedTeamHeaders()
    {
        using var fixture = await Fixture.CreateAsync();
        var drill = await CreateDrill(fixture.EditorA, "Private A");
        Assert.Equal(fixture.TeamA.Id, drill.Ownership!.OwnerTeamId);
        Assert.Equal("team", drill.Ownership.Visibility);
        Assert.Equal(HttpStatusCode.NotFound, (await fixture.EditorB.GetAsync($"/api/drills/{drill.Id}")).StatusCode);
        Assert.Empty((await fixture.EditorB.GetFromJsonAsync<List<DrillResponse>>("/api/drills"))!);
        fixture.EditorB.DefaultRequestHeaders.Remove("X-Team-Id");
        fixture.EditorB.DefaultRequestHeaders.Add("X-Team-Id", fixture.TeamA.Id.ToString());
        Assert.Equal(HttpStatusCode.Forbidden, (await fixture.EditorB.GetAsync("/api/drills")).StatusCode);
        fixture.EditorB.DefaultRequestHeaders.Remove("X-Team-Id");
        fixture.EditorB.DefaultRequestHeaders.Add("X-Team-Id", fixture.TeamB.Id.ToString());
        var sharedResponse = await fixture.EditorA.PostAsJsonAsync($"/api/drills/{drill.Id}/visibility", new VisibilityRequest("organisation", drill.UpdatedAt));
        Assert.Equal(HttpStatusCode.OK, sharedResponse.StatusCode);
        var shared = (await fixture.EditorB.GetFromJsonAsync<DrillResponse>($"/api/drills/{drill.Id}"))!;
        Assert.False(shared.Ownership!.CanEdit);
        Assert.Equal(drill.Ownership.OwnerTeamId, shared.Ownership.OwnerTeamId);
        Assert.Equal(HttpStatusCode.Forbidden, (await fixture.EditorB.PutAsJsonAsync($"/api/drills/{drill.Id}", Request("Hacked"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await fixture.ViewerB.PostAsync($"/api/drills/{drill.Id}/copy", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await fixture.ViewerB.PostAsJsonAsync("/api/workspace/teams", new TeamRequest("Forbidden"))).StatusCode);
        using var outsider = fixture.Client(Guid.NewGuid());
        Assert.Equal(HttpStatusCode.Forbidden, (await outsider.GetAsync("/api/drills")).StatusCode);
        var otherOrg = (await (await outsider.PostAsJsonAsync("/api/workspace/organisations", new OrganisationRequest("Other club"))).Content.ReadFromJsonAsync<OrganisationResponse>())!;
        outsider.DefaultRequestHeaders.Remove("X-Organisation-Id");
        outsider.DefaultRequestHeaders.Add("X-Organisation-Id", otherOrg.Id.ToString());
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"/api/drills/{drill.Id}")).StatusCode);
    }

    [Fact]
    public async Task SharingPlanRequiresCurrentExplicitConfirmationAndChangesAllVisibilityTogether()
    {
        using var fixture = await Fixture.CreateAsync();
        var first = await CreateDrill(fixture.EditorA, "First private drill");
        var second = await CreateDrill(fixture.EditorA, "Second private drill");
        var plan = await CreatePlan(fixture.EditorA, "Plan", [new(first.Id, 10, "First cue"), new(second.Id, 15, "Second cue")]);
        var preview = (await fixture.EditorA.GetFromJsonAsync<SharingPreview>($"/api/trainings/{plan.Id}/sharing"))!;
        Assert.Equal(2, preview.Drills.Count);
        var missing = await fixture.EditorA.PostAsJsonAsync($"/api/trainings/{plan.Id}/visibility", new VisibilityRequest("organisation", preview.UpdatedAt));
        Assert.Equal(HttpStatusCode.Conflict, missing.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await fixture.EditorB.GetAsync($"/api/drills/{first.Id}")).StatusCode);
        await fixture.EditorA.PutAsJsonAsync($"/api/drills/{second.Id}", Request("Changed second"));
        var stale = await fixture.EditorA.PostAsJsonAsync($"/api/trainings/{plan.Id}/visibility", new VisibilityRequest("organisation", preview.UpdatedAt,
            preview.Drills.Select(d => new ConfirmedDrill(d.Id, d.UpdatedAt)).ToList()));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("team", (await fixture.EditorA.GetFromJsonAsync<DrillResponse>($"/api/drills/{first.Id}"))!.Ownership!.Visibility);
        Assert.Equal(HttpStatusCode.NotFound, (await fixture.EditorB.GetAsync($"/api/trainings/{plan.Id}")).StatusCode);
        preview = (await fixture.EditorA.GetFromJsonAsync<SharingPreview>($"/api/trainings/{plan.Id}/sharing"))!;
        var shared = await fixture.EditorA.PostAsJsonAsync($"/api/trainings/{plan.Id}/visibility", new VisibilityRequest("organisation", preview.UpdatedAt,
            preview.Drills.Select(d => new ConfirmedDrill(d.Id, d.UpdatedAt)).ToList()));
        Assert.Equal(HttpStatusCode.OK, shared.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await fixture.EditorB.GetAsync($"/api/trainings/{plan.Id}")).StatusCode);
        foreach (var id in new[] { first.Id, second.Id }) Assert.Equal(HttpStatusCode.OK, (await fixture.EditorB.GetAsync($"/api/drills/{id}")).StatusCode);
    }

    [Fact]
    public async Task CopiesPreservePlanEntriesAndCanReplaceOneDrillWithoutChangingOriginal()
    {
        using var fixture = await Fixture.CreateAsync();
        var original = await CreateDrill(fixture.EditorA, "Reusable original");
        var sourcePlan = await CreatePlan(fixture.EditorA, "Original practice", [new(original.Id, 8, "Warm up"), new(original.Id, 22, "Repeat faster")]);
        await fixture.EditorA.PostAsJsonAsync($"/api/drills/{original.Id}/visibility", new VisibilityRequest("organisation", original.UpdatedAt));
        Assert.Equal(HttpStatusCode.NotFound, (await fixture.EditorB.GetAsync($"/api/trainings/{sourcePlan.Id}")).StatusCode);
        await fixture.EditorA.PostAsJsonAsync($"/api/trainings/{sourcePlan.Id}/visibility", new VisibilityRequest("organisation", sourcePlan.UpdatedAt));
        var copiedResponse = await fixture.EditorB.PostAsync($"/api/trainings/{sourcePlan.Id}/copy", null);
        Assert.Equal(HttpStatusCode.OK, copiedResponse.StatusCode);
        var copy = (await copiedResponse.Content.ReadFromJsonAsync<TrainingResponse>())!;
        Assert.NotEqual(sourcePlan.Id, copy.Id);
        Assert.Equal(sourcePlan.Items, copy.Items);
        Assert.Equal(fixture.TeamB.Id, copy.Ownership!.OwnerTeamId);
        Assert.Equal("team", copy.Ownership.Visibility);
        Assert.Equal(sourcePlan.Tags, copy.Tags);
        Assert.Equal("U12", copy.AgeGroup);
        var replacedResponse = await fixture.EditorB.PostAsJsonAsync($"/api/trainings/{copy.Id}/items/0/copy-drill", new CopyRequest(copy.UpdatedAt));
        Assert.Equal(HttpStatusCode.OK, replacedResponse.StatusCode);
        var replaced = (await replacedResponse.Content.ReadFromJsonAsync<TrainingResponse>())!;
        Assert.NotEqual(original.Id, replaced.Items[0].DrillId);
        Assert.Equal(original.Id, replaced.Items[1].DrillId);
        Assert.Equal(copy.Items[0].Notes, replaced.Items[0].Notes);
        Assert.Equal(copy.Items[0].DurationMinutes, replaced.Items[0].DurationMinutes);
        var drillCopy = (await fixture.EditorB.GetFromJsonAsync<DrillResponse>($"/api/drills/{replaced.Items[0].DrillId}"))!;
        Assert.Equal(System.Text.Json.JsonSerializer.Serialize(original.Diagram), System.Text.Json.JsonSerializer.Serialize(drillCopy.Diagram));
        Assert.Equal(original.Notes, drillCopy.Notes);
        Assert.Equal("team", drillCopy.Ownership!.Visibility);
        await fixture.EditorA.PutAsJsonAsync($"/api/drills/{original.Id}", Request("Changed original") with { Notes = "New original instructions" });
        var after = (await fixture.EditorB.GetFromJsonAsync<DrillResponse>($"/api/drills/{drillCopy.Id}"))!;
        Assert.Equal(drillCopy.Notes, after.Notes);
        Assert.Equal(sourcePlan.Items, (await fixture.EditorA.GetFromJsonAsync<TrainingResponse>($"/api/trainings/{sourcePlan.Id}"))!.Items);
        await fixture.EditorA.PutAsJsonAsync($"/api/trainings/{sourcePlan.Id}", new TrainingRequest("Changed source plan", "Changed plan notes", [new(original.Id, 3, "Changed source entry")]));
        var unchangedCopy = (await fixture.EditorB.GetFromJsonAsync<TrainingResponse>($"/api/trainings/{copy.Id}"))!;
        Assert.Equal(replaced.Items, unchangedCopy.Items);
        Assert.Equal(copy.Notes, unchangedCopy.Notes);
        await fixture.EditorA.DeleteAsync($"/api/trainings/{sourcePlan.Id}");
        Assert.Equal(HttpStatusCode.OK, (await fixture.EditorB.GetAsync($"/api/trainings/{copy.Id}")).StatusCode);
    }

    [Fact]
    public async Task UnsharingAndDeletionProtectPrivateDependentPlansWithoutDisclosingTheirDetails()
    {
        using var fixture = await Fixture.CreateAsync();
        var drill = await CreateDrill(fixture.EditorA, "Shared drill");
        var share = await fixture.EditorA.PostAsJsonAsync($"/api/drills/{drill.Id}/visibility", new VisibilityRequest("organisation", drill.UpdatedAt));
        drill = (await share.Content.ReadFromJsonAsync<DrillResponse>())!;
        var privatePlan = await CreatePlan(fixture.EditorB, "Secret B strategy", [new(drill.Id, 12, "Private cue")]);
        var unshare = await fixture.EditorA.PostAsJsonAsync($"/api/drills/{drill.Id}/visibility", new VisibilityRequest("team", drill.UpdatedAt));
        Assert.Equal(HttpStatusCode.Conflict, unshare.StatusCode);
        Assert.DoesNotContain(privatePlan.Title, await unshare.Content.ReadAsStringAsync());
        var delete = await fixture.EditorA.DeleteAsync($"/api/drills/{drill.Id}");
        Assert.Equal(HttpStatusCode.Conflict, delete.StatusCode);
        Assert.DoesNotContain(privatePlan.Title, await delete.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.NotFound, (await fixture.EditorA.GetAsync($"/api/trainings/{privatePlan.Id}")).StatusCode);
        await fixture.EditorB.DeleteAsync($"/api/trainings/{privatePlan.Id}");
        Assert.Equal(HttpStatusCode.OK, (await fixture.EditorA.PostAsJsonAsync($"/api/drills/{drill.Id}/visibility", new VisibilityRequest("team", drill.UpdatedAt))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await fixture.EditorB.GetAsync($"/api/drills/{drill.Id}")).StatusCode);
    }

    [Fact]
    public async Task OrganisationOwnedContentIsVisibleToMembersAndEditableOnlyByAdministrators()
    {
        using var fixture = await Fixture.CreateAsync();
        var drill = await CreateDrill(fixture.Admin, "Club-owned drill");
        Assert.Null(drill.Ownership!.OwnerTeamId);
        Assert.Equal("organisation", drill.Ownership.Visibility);
        var visible = (await fixture.EditorA.GetFromJsonAsync<DrillResponse>($"/api/drills/{drill.Id}"))!;
        Assert.False(visible.Ownership!.CanEdit);
        Assert.Equal(HttpStatusCode.Forbidden, (await fixture.EditorA.DeleteAsync($"/api/drills/{drill.Id}")).StatusCode);
        var plan = await CreatePlan(fixture.Admin, "Club plan", [new(drill.Id, 15)]);
        Assert.Null(plan.Ownership!.OwnerTeamId);
        var privateDrill = await CreateDrill(fixture.EditorA, "Private team drill");
        Assert.Equal(HttpStatusCode.Conflict, (await fixture.Admin.PutAsJsonAsync($"/api/trainings/{plan.Id}",
            new TrainingRequest("Club plan", "", [new(privateDrill.Id, 15)]))).StatusCode);
    }

    [Fact]
    public async Task SharingRefusesAnImportedDependencyWithoutPermissionAndLeavesAllVisibilityUnchanged()
    {
        using var fixture = await Fixture.CreateAsync();
        var user = (await fixture.EditorB.GetFromJsonAsync<WorkspaceResponse>("/api/workspace"))!;
        await fixture.Admin.PostAsJsonAsync("/api/workspace/members", new MemberRequest(user.UserId, "member", fixture.TeamA.Id, "viewer"));
        var privateA = await CreateDrill(fixture.EditorA, "A's instructions");
        var privateB = await CreateDrill(fixture.EditorB, "B's instructions");
        var plan = await CreatePlan(fixture.EditorB, "Imported plan", [new(privateB.Id, 12)]);
        // Simulate an imported legacy relationship. Normal plan writes reject audience mismatches.
        using (var scope = fixture.Application.Services.CreateScope())
        {
            var database = scope.ServiceProvider.GetRequiredService<HockeyDbContext>();
            database.TrainingEntries.Add(new TrainingEntry { TrainingId = plan.Id, DrillId = privateA.Id, Position = 1, DurationMinutes = 10 });
            await database.SaveChangesAsync();
        }
        var preview = (await fixture.EditorB.GetFromJsonAsync<SharingPreview>($"/api/trainings/{plan.Id}/sharing"))!;
        Assert.False(preview.CanShare);
        Assert.False(preview.Drills.Single(d => d.Id == privateA.Id).CanShare);
        var denied = await fixture.EditorB.PostAsJsonAsync($"/api/trainings/{plan.Id}/visibility", new VisibilityRequest("organisation", preview.UpdatedAt,
            preview.Drills.Select(d => new ConfirmedDrill(d.Id, d.UpdatedAt)).ToList()));
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        Assert.Equal("team", (await fixture.EditorB.GetFromJsonAsync<DrillResponse>($"/api/drills/{privateB.Id}"))!.Ownership!.Visibility);
        Assert.Equal("team", (await fixture.EditorB.GetFromJsonAsync<TrainingResponse>($"/api/trainings/{plan.Id}"))!.Ownership!.Visibility);
    }

    [Fact]
    public async Task LegacyWorkspaceRequiresAnExplicitAdministratorAndBootstrapIsIdempotent()
    {
        var userId = Guid.NewGuid();
        using var application = new AuthenticationTests.AuthenticatedApplication(userId);
        using var admin = application.CreateClient();
        admin.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", application.Token(userId));
        var results = await Task.WhenAll(admin.GetFromJsonAsync<WorkspaceResponse>("/api/workspace"), admin.GetFromJsonAsync<WorkspaceResponse>("/api/workspace"));
        foreach (var result in results)
        {
            var legacy = Assert.Single(result!.Organisations);
            Assert.Equal(WorkspaceDefaults.OrganisationId, legacy.Id);
            Assert.True(legacy.IsAdmin);
        }
        using var otherUser = application.CreateClient();
        otherUser.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", application.Token(Guid.NewGuid()));
        Assert.Empty((await otherUser.GetFromJsonAsync<WorkspaceResponse>("/api/workspace"))!.Organisations);
        otherUser.DefaultRequestHeaders.Add("X-Organisation-Id", WorkspaceDefaults.OrganisationId.ToString());
        Assert.Equal(HttpStatusCode.Forbidden, (await otherUser.GetAsync("/api/drills")).StatusCode);
    }

    private static DrillRequest Request(string title) => new(title, "skating", "Reusable instructions", new Diagram(1, [new DiagramObject(Guid.NewGuid().ToString(), "goal", 100, 250, 90, "#ef4444")], []), ["Skating"], "U12");
    private static async Task<DrillResponse> CreateDrill(HttpClient client, string title)
    {
        var response = await client.PostAsJsonAsync("/api/drills", Request(title));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<DrillResponse>())!;
    }
    private static async Task<TrainingResponse> CreatePlan(HttpClient client, string title, List<TrainingItem> items)
    {
        var response = await client.PostAsJsonAsync("/api/trainings", new TrainingRequest(title, "Plan notes", items, ["Tactics"], "U12"));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<TrainingResponse>())!;
    }

    private sealed class Fixture : IDisposable
    {
        public AuthenticationTests.AuthenticatedApplication Application { get; } = new();
        public HttpClient Admin { get; private set; } = null!;
        public HttpClient EditorA { get; private set; } = null!;
        public HttpClient EditorB { get; private set; } = null!;
        public HttpClient ViewerB { get; private set; } = null!;
        public OrganisationResponse Organisation { get; private set; } = null!;
        public TeamResponse TeamA { get; private set; } = null!;
        public TeamResponse TeamB { get; private set; } = null!;
        public HttpClient Client(Guid userId, Guid? teamId = null)
        {
            var client = Application.CreateClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Application.Token(userId));
            if (Organisation is not null) client.DefaultRequestHeaders.Add("X-Organisation-Id", Organisation.Id.ToString());
            if (teamId is not null) client.DefaultRequestHeaders.Add("X-Team-Id", teamId.ToString());
            return client;
        }
        public static async Task<Fixture> CreateAsync()
        {
            var fixture = new Fixture();
            fixture.Admin = fixture.Client(Guid.NewGuid());
            fixture.Organisation = (await (await fixture.Admin.PostAsJsonAsync("/api/workspace/organisations", new OrganisationRequest("Test club"))).Content.ReadFromJsonAsync<OrganisationResponse>())!;
            fixture.Admin.DefaultRequestHeaders.Add("X-Organisation-Id", fixture.Organisation.Id.ToString());
            fixture.TeamA = (await (await fixture.Admin.PostAsJsonAsync("/api/workspace/teams", new TeamRequest("Team A", "U12"))).Content.ReadFromJsonAsync<TeamResponse>())!;
            fixture.TeamB = (await (await fixture.Admin.PostAsJsonAsync("/api/workspace/teams", new TeamRequest("Team B", "U14"))).Content.ReadFromJsonAsync<TeamResponse>())!;
            var editorA = Guid.NewGuid(); var editorB = Guid.NewGuid(); var viewerB = Guid.NewGuid();
            foreach (var member in new[] { new MemberRequest(editorA, "member", fixture.TeamA.Id, "editor"), new MemberRequest(editorB, "member", fixture.TeamB.Id, "editor"), new MemberRequest(viewerB, "member", fixture.TeamB.Id, "viewer") })
                Assert.Equal(HttpStatusCode.NoContent, (await fixture.Admin.PostAsJsonAsync("/api/workspace/members", member)).StatusCode);
            fixture.EditorA = fixture.Client(editorA, fixture.TeamA.Id);
            fixture.EditorB = fixture.Client(editorB, fixture.TeamB.Id);
            fixture.ViewerB = fixture.Client(viewerB, fixture.TeamB.Id);
            return fixture;
        }
        public void Dispose() { Admin.Dispose(); EditorA.Dispose(); EditorB.Dispose(); ViewerB.Dispose(); Application.Dispose(); }
    }
}

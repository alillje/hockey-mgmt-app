using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Data;
using HockeyTrainer.Api.Models;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using Microsoft.EntityFrameworkCore;

namespace HockeyTrainer.Api.Tests;

public sealed class ClubLibraryTests
{
    [Fact]
    public async Task DrillCopiesAreIndependentAcrossBothDirectionsAndDoNotExposeOriginals()
    {
        using var f = await Fixture.CreateAsync();
        var original = await CreateDrill(f.EditorA, "Same title");
        Assert.Equal(HttpStatusCode.NotFound, (await f.EditorB.GetAsync($"/api/drills/{original.Id}")).StatusCode);
        var library = await CopyDrill(f.EditorA, original.Id, "library");
        Assert.NotEqual(original.Id, library.Id);
        Assert.Null(library.Ownership!.OwnerTeamId);
        Assert.Equal(f.Organisation.Id, library.Ownership.OrganisationId);
        Assert.False(library.Ownership.CanEdit);
        Assert.Equal(original.Title, library.Title);
        Assert.Equal(original.Notes, library.Notes);
        Assert.Equal(original.Tags, library.Tags);
        Assert.Equal(System.Text.Json.JsonSerializer.Serialize(original.Diagram), System.Text.Json.JsonSerializer.Serialize(library.Diagram));
        Assert.Equal(HttpStatusCode.NotFound, (await f.EditorB.GetAsync($"/api/drills/{original.Id}")).StatusCode);
        var team = await CopyDrill(f.EditorB, library.Id, "team");
        var second = await CopyDrill(f.EditorB, library.Id, "team");
        Assert.NotEqual(library.Id, team.Id);
        Assert.NotEqual(team.Id, second.Id);
        Assert.Equal(f.TeamB.Id, team.Ownership!.OwnerTeamId);
        Assert.Equal(HttpStatusCode.OK, (await f.EditorA.PutAsJsonAsync($"/api/drills/{original.Id}", Request("Changed source"))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await f.EditorA.DeleteAsync($"/api/drills/{original.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await f.Admin.PutAsJsonAsync($"/api/drills/{library.Id}", Request("Changed library"))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await f.Admin.DeleteAsync($"/api/drills/{library.Id}")).StatusCode);
        var independent = (await f.EditorB.GetFromJsonAsync<DrillResponse>($"/api/drills/{team.Id}"))!;
        Assert.Equal("Same title", independent.Title);
        Assert.Equal(System.Text.Json.JsonSerializer.Serialize(original.Diagram), System.Text.Json.JsonSerializer.Serialize(independent.Diagram));
    }

    [Fact]
    public async Task CompletePlansCopyAllDrillsOncePerOperationAndPreserveEntryData()
    {
        using var f = await Fixture.CreateAsync();
        var first = await CreateDrill(f.EditorA, "Repeated drill");
        var second = await CreateDrill(f.EditorA, "Other drill");
        var source = await CreatePlan(f.EditorA, "Complete plan", [new(first.Id, 8, "First cue"), new(second.Id, 17, "Second cue"), new(first.Id, 12, "Repeat cue")]);
        var library = await CopyPlan(f.EditorA, source.Id, "library");
        var team = await CopyPlan(f.EditorB, library.Id, "team");
        var repeated = await CopyPlan(f.EditorB, library.Id, "team");
        foreach (var (plan, client, owner) in new[] { (library, f.Admin, (Guid?)null), (team, f.EditorB, (Guid?)f.TeamB.Id), (repeated, f.EditorB, (Guid?)f.TeamB.Id) })
        {
            Assert.NotEqual(source.Id, plan.Id);
            Assert.Equal(owner, plan.Ownership!.OwnerTeamId);
            Assert.Equal(source.Title, plan.Title);
            Assert.Equal(source.Notes, plan.Notes);
            Assert.Equal(source.Tags, plan.Tags);
            Assert.Equal(source.AgeGroup, plan.AgeGroup);
            Assert.Equal(source.Items.Select(i => (i.DurationMinutes, i.Notes)), plan.Items.Select(i => (i.DurationMinutes, i.Notes)));
            Assert.Equal(plan.Items[0].DrillId, plan.Items[2].DrillId);
            Assert.Equal(2, plan.Items.Select(i => i.DrillId).Distinct().Count());
            Assert.DoesNotContain(first.Id, plan.Items.Select(i => i.DrillId));
            Assert.DoesNotContain(second.Id, plan.Items.Select(i => i.DrillId));
            foreach (var id in plan.Items.Select(i => i.DrillId).Distinct())
            {
                var drill = (await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{id}"))!;
                Assert.Equal(owner, drill.Ownership!.OwnerTeamId);
                Assert.Equal(f.Organisation.Id, drill.Ownership.OrganisationId);
            }
        }
        Assert.Empty(library.Items.Select(i => i.DrillId).Intersect(team.Items.Select(i => i.DrillId)));
        Assert.Empty(team.Items.Select(i => i.DrillId).Intersect(repeated.Items.Select(i => i.DrillId)));
        Assert.Equal(HttpStatusCode.OK, (await f.EditorA.PutAsJsonAsync($"/api/trainings/{source.Id}",
            new TrainingRequest("Changed source plan", "Changed notes", [new(first.Id, 20, "Changed cue")], ["Shooting"], "U18"))).StatusCode);
        Assert.Equal(source.Notes, (await f.Admin.GetFromJsonAsync<TrainingResponse>($"/api/trainings/{library.Id}"))!.Notes);
        Assert.Equal(HttpStatusCode.NoContent, (await f.EditorA.DeleteAsync($"/api/trainings/{source.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await f.EditorA.DeleteAsync($"/api/drills/{first.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await f.Admin.DeleteAsync($"/api/drills/{library.Items[0].DrillId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await f.Admin.DeleteAsync($"/api/trainings/{library.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await f.Admin.DeleteAsync($"/api/drills/{library.Items[0].DrillId}")).StatusCode);
        Assert.Equal(team.Items, (await f.EditorB.GetFromJsonAsync<TrainingResponse>($"/api/trainings/{team.Id}"))!.Items);
    }

    [Fact]
    public async Task MembershipsAndWorkspaceRulesRejectUnauthorisedReadsWritesAndCopies()
    {
        using var f = await Fixture.CreateAsync();
        var privateDrill = await CreateDrill(f.EditorA, "Private A");
        var library = await CopyDrill(f.EditorA, privateDrill.Id, "library");
        var teamB = await CreateDrill(f.EditorB, "Private B");
        var forgedDestination = await f.EditorB.PostAsJsonAsync($"/api/drills/{library.Id}/copy-to-team",
            new { ownerTeamId = f.TeamA.Id, organisationId = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.OK, forgedDestination.StatusCode);
        var actualDestination = (await forgedDestination.Content.ReadFromJsonAsync<DrillResponse>())!.Ownership!;
        Assert.Equal(f.TeamB.Id, actualDestination.OwnerTeamId);
        Assert.Equal(f.Organisation.Id, actualDestination.OrganisationId);

        Assert.Equal(HttpStatusCode.NotFound, (await f.EditorB.GetAsync($"/api/drills/{privateDrill.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.EditorB.PostAsync($"/api/drills/{privateDrill.Id}/copy-to-library", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await f.EditorA.DeleteAsync($"/api/drills/{library.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await f.ViewerB.PostAsync($"/api/drills/{library.Id}/copy-to-team", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await f.ViewerB.PostAsync($"/api/drills/{teamB.Id}/copy-to-library", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await f.EditorA.PostAsync($"/api/drills/{privateDrill.Id}/copy-to-team", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await f.Admin.PostAsync($"/api/drills/{library.Id}/copy-to-library", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await f.EditorB.PostAsJsonAsync("/api/trainings", new TrainingRequest("Invalid", "", [new(library.Id, 10)]))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await f.EditorB.PostAsJsonAsync("/api/trainings", new TrainingRequest("Invalid", "", [new(privateDrill.Id, 10)]))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await f.Admin.PostAsJsonAsync("/api/trainings", new TrainingRequest("Invalid", "", [new(privateDrill.Id, 10)]))).StatusCode);
        var privatePlan = await CreatePlan(f.EditorA, "Private team plan", [new(privateDrill.Id, 12, "Private cue")]);
        var libraryPlan = await CopyPlan(f.EditorA, privatePlan.Id, "library");
        Assert.Equal(HttpStatusCode.NotFound, (await f.EditorB.GetAsync($"/api/trainings/{privatePlan.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await f.ViewerB.PostAsync($"/api/trainings/{libraryPlan.Id}/copy-to-team", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await f.EditorB.DeleteAsync($"/api/trainings/{libraryPlan.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await f.EditorA.PostAsync($"/api/trainings/{privatePlan.Id}/copy-to-team", null)).StatusCode);
        var outsider = f.Client(Guid.NewGuid());
        using (outsider)
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await outsider.GetAsync($"/api/drills/{library.Id}")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await outsider.PostAsync($"/api/drills/{library.Id}/copy-to-team", null)).StatusCode);
        }
        // Organisation administrators can manage every team without individual team memberships.
        var orgAdminId = Guid.NewGuid();
        await f.Admin.PostAsJsonAsync("/api/workspace/members", new MemberRequest(orgAdminId, "admin"));
        using var orgAdmin = f.Client(orgAdminId);
        var adminWorkspace = (await orgAdmin.GetFromJsonAsync<WorkspaceResponse>("/api/workspace"))!;
        Assert.All(Assert.Single(adminWorkspace.Organisations).Teams, t => { Assert.True(t.CanView); Assert.True(t.CanEdit); });
        Assert.Equal(HttpStatusCode.OK, (await orgAdmin.GetAsync($"/api/drills/{privateDrill.Id}")).StatusCode);
        orgAdmin.DefaultRequestHeaders.Add("X-Team-Id", f.TeamA.Id.ToString());
        Assert.Equal(HttpStatusCode.OK, (await orgAdmin.GetAsync("/api/drills")).StatusCode);
        // Headers and submitted owner fields cannot manufacture membership or move content.
        f.EditorA.DefaultRequestHeaders.Remove("X-Team-Id");
        f.EditorA.DefaultRequestHeaders.Add("X-Team-Id", f.TeamB.Id.ToString());
        Assert.Equal(HttpStatusCode.Forbidden, (await f.EditorA.PostAsync($"/api/drills/{library.Id}/copy-to-team", null)).StatusCode);
        using var otherOrg = f.Client(Guid.NewGuid());
        var organisation = (await (await f.Admin.PostAsJsonAsync("/api/workspace/organisations", new OrganisationRequest("Other club"))).Content.ReadFromJsonAsync<OrganisationResponse>())!;
        f.Admin.DefaultRequestHeaders.Remove("X-Organisation-Id");
        f.Admin.DefaultRequestHeaders.Add("X-Organisation-Id", organisation.Id.ToString());
        var otherUser = (await otherOrg.GetFromJsonAsync<WorkspaceResponse>("/api/workspace"))!.UserId;
        await f.Admin.PostAsJsonAsync("/api/workspace/members", new MemberRequest(otherUser, "admin"));
        f.Admin.DefaultRequestHeaders.Remove("X-Organisation-Id");
        f.Admin.DefaultRequestHeaders.Add("X-Organisation-Id", f.Organisation.Id.ToString());
        otherOrg.DefaultRequestHeaders.Remove("X-Organisation-Id");
        otherOrg.DefaultRequestHeaders.Add("X-Organisation-Id", organisation.Id.ToString());
        Assert.Equal(HttpStatusCode.NotFound, (await otherOrg.PostAsync($"/api/drills/{library.Id}/copy-to-team", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await otherOrg.PostAsync($"/api/trainings/{libraryPlan.Id}/copy-to-team", null)).StatusCode);
        var foreignTeam = (await (await otherOrg.PostAsJsonAsync("/api/workspace/teams", new TeamRequest("Other organisation's team"))).Content.ReadFromJsonAsync<TeamResponse>())!;
        otherOrg.DefaultRequestHeaders.Remove("X-Organisation-Id");
        otherOrg.DefaultRequestHeaders.Add("X-Organisation-Id", f.Organisation.Id.ToString());
        otherOrg.DefaultRequestHeaders.Add("X-Team-Id", foreignTeam.Id.ToString());
        await f.Admin.PostAsJsonAsync("/api/workspace/members", new MemberRequest(otherUser, "member"));
        Assert.Equal(HttpStatusCode.Forbidden, (await otherOrg.PostAsync($"/api/drills/{library.Id}/copy-to-team", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.EditorB.PostAsync($"/api/drills/{library.Id}/visibility", null)).StatusCode);
    }

    [Fact]
    public async Task DatabaseGuardRejectsCrossWorkspaceReferencesAndCopyFailureRollsBack()
    {
        using var f = await Fixture.CreateAsync();
        var first = await CreateDrill(f.EditorA, "Copy one");
        var second = await CreateDrill(f.EditorA, "Fail copy");
        var other = await CreateDrill(f.EditorB, "Other workspace");
        var plan = await CreatePlan(f.EditorA, "Atomic plan", [new(first.Id, 8, "Keep"), new(second.Id, 12, "Also keep")]);
        using var scope = f.Application.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<HockeyDbContext>();
        db.TrainingEntries.Add(new TrainingEntry { TrainingId = plan.Id, DrillId = other.Id, Position = 2, DurationMinutes = 10 });
        await Assert.ThrowsAsync<Microsoft.EntityFrameworkCore.DbUpdateException>(() => db.SaveChangesAsync());
        db.ChangeTracker.Clear();
        var drillCount = await db.Drills.CountAsync();
        var planCount = await db.Trainings.CountAsync();
        await db.Database.ExecuteSqlRawAsync("CREATE TRIGGER forced_copy_failure BEFORE INSERT ON Drills WHEN NEW.OwnerTeamId IS NULL AND NEW.Title = 'Fail copy' BEGIN SELECT RAISE(ABORT, 'Test copy failure'); END;");
        Assert.Equal(HttpStatusCode.Conflict, (await f.EditorA.PostAsync($"/api/trainings/{plan.Id}/copy-to-library", null)).StatusCode);
        Assert.Equal(drillCount, await db.Drills.CountAsync());
        Assert.Equal(planCount, await db.Trainings.CountAsync());
        Assert.Equal(plan.Items, (await f.EditorA.GetFromJsonAsync<TrainingResponse>($"/api/trainings/{plan.Id}"))!.Items);
    }

    private static async Task<DrillResponse> CopyDrill(HttpClient client, Guid id, string destination)
    {
        var response = await client.PostAsync($"/api/drills/{id}/copy-to-{destination}", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<DrillResponse>())!;
    }
    private static async Task<TrainingResponse> CopyPlan(HttpClient client, Guid id, string destination)
    {
        var response = await client.PostAsync($"/api/trainings/{id}/copy-to-{destination}", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<TrainingResponse>())!;
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

    [Fact]
    public async Task ExplicitCopyDestinationsEnforceSourceAndDestinationPermissions()
    {
        using var f = await Fixture.CreateAsync();
        var source = await CreateDrill(f.EditorA, "Chosen destination");
        var self = await f.EditorA.PostAsJsonAsync($"/api/drills/{source.Id}/copy", new CopyDestinationRequest(f.Organisation.Id, f.TeamA.Id));
        Assert.Equal(HttpStatusCode.OK, self.StatusCode);
        var sameTeam = (await self.Content.ReadFromJsonAsync<DrillResponse>())!;
        Assert.NotEqual(source.Id, sameTeam.Id);
        Assert.Equal(f.TeamA.Id, sameTeam.Ownership!.OwnerTeamId);
        Assert.Equal(HttpStatusCode.Forbidden, (await f.EditorA.PostAsJsonAsync($"/api/drills/{source.Id}/copy", new CopyDestinationRequest(f.Organisation.Id, f.TeamB.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.EditorB.PostAsJsonAsync($"/api/drills/{source.Id}/copy", new CopyDestinationRequest(f.Organisation.Id, f.TeamB.Id))).StatusCode);
        var copied = await f.Admin.PostAsJsonAsync($"/api/drills/{source.Id}/copy", new CopyDestinationRequest(f.Organisation.Id, f.TeamB.Id));
        Assert.Equal(HttpStatusCode.OK, copied.StatusCode);
        var otherTeam = (await copied.Content.ReadFromJsonAsync<DrillResponse>())!;
        Assert.Equal(f.TeamB.Id, otherTeam.Ownership!.OwnerTeamId);
        Assert.Equal(source.Notes, otherTeam.Notes);
        Assert.Equal(HttpStatusCode.Forbidden, (await f.ViewerB.PostAsJsonAsync($"/api/drills/{otherTeam.Id}/copy", new CopyDestinationRequest(f.Organisation.Id, f.TeamB.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await f.ViewerB.PostAsJsonAsync($"/api/drills/{otherTeam.Id}/copy", new CopyDestinationRequest(f.Organisation.Id, null))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await f.Admin.PostAsJsonAsync($"/api/drills/{source.Id}/copy", new CopyDestinationRequest(Guid.NewGuid(), f.TeamA.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await f.Admin.PostAsJsonAsync($"/api/drills/{source.Id}/copy", new CopyDestinationRequest(f.Organisation.Id, Guid.NewGuid()))).StatusCode);
        var contribution = await f.EditorA.PostAsJsonAsync($"/api/drills/{source.Id}/copy", new CopyDestinationRequest(f.Organisation.Id, null));
        Assert.Equal(HttpStatusCode.OK, contribution.StatusCode);
        var club = (await contribution.Content.ReadFromJsonAsync<DrillResponse>())!;
        Assert.Null(club.Ownership!.OwnerTeamId);
        Assert.Equal(HttpStatusCode.Forbidden, (await f.EditorA.PostAsJsonAsync($"/api/drills/{club.Id}/copy", new CopyDestinationRequest(f.Organisation.Id, null))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await f.Admin.PostAsJsonAsync($"/api/drills/{club.Id}/copy", new CopyDestinationRequest(f.Organisation.Id, null))).StatusCode);
        await f.EditorA.DeleteAsync($"/api/drills/{source.Id}");
        Assert.Equal(source.Title, (await f.EditorB.GetFromJsonAsync<DrillResponse>($"/api/drills/{otherTeam.Id}"))!.Title);
    }

    [Fact]
    public async Task ChosenTeamPlanCopiesHaveIndependentLocalDrillsAndRejectedCopiesLeaveNoRows()
    {
        using var f = await Fixture.CreateAsync();
        var drill = await CreateDrill(f.EditorA, "Repeated source");
        var source = await CreatePlan(f.EditorA, "Destination plan", [new(drill.Id, 12, "First cue"), new(drill.Id, 8, "Second cue")]);
        var before = (await f.EditorB.GetFromJsonAsync<List<DrillResponse>>("/api/drills"))!.Count;
        Assert.Equal(HttpStatusCode.Forbidden, (await f.EditorA.PostAsJsonAsync($"/api/trainings/{source.Id}/copy", new CopyDestinationRequest(f.Organisation.Id, f.TeamB.Id))).StatusCode);
        Assert.Equal(before, (await f.EditorB.GetFromJsonAsync<List<DrillResponse>>("/api/drills"))!.Count);
        var response = await f.Admin.PostAsJsonAsync($"/api/trainings/{source.Id}/copy", new CopyDestinationRequest(f.Organisation.Id, f.TeamB.Id));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var copy = (await response.Content.ReadFromJsonAsync<TrainingResponse>())!;
        Assert.NotEqual(source.Id, copy.Id);
        Assert.Equal(f.TeamB.Id, copy.Ownership!.OwnerTeamId);
        Assert.Equal(source.Items.Select(i => (i.DurationMinutes, i.Notes)), copy.Items.Select(i => (i.DurationMinutes, i.Notes)));
        Assert.Equal(copy.Items[0].DrillId, copy.Items[1].DrillId);
        Assert.NotEqual(drill.Id, copy.Items[0].DrillId);
        var copiedDrill = (await f.EditorB.GetFromJsonAsync<DrillResponse>($"/api/drills/{copy.Items[0].DrillId}"))!;
        Assert.Equal(f.TeamB.Id, copiedDrill.Ownership!.OwnerTeamId);
        Assert.Equal(f.Organisation.Id, copiedDrill.Ownership.OrganisationId);
        Assert.Equal(before + 1, (await f.EditorB.GetFromJsonAsync<List<DrillResponse>>("/api/drills"))!.Count);
        Assert.Equal(HttpStatusCode.Forbidden, (await f.ViewerB.PostAsJsonAsync($"/api/trainings/{copy.Id}/copy", new CopyDestinationRequest(f.Organisation.Id, f.TeamB.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await f.Admin.PostAsJsonAsync($"/api/trainings/{source.Id}/copy", new CopyDestinationRequest(Guid.NewGuid(), null))).StatusCode);
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
            fixture.Admin = fixture.Client(fixture.Application.PlatformAdminId);
            fixture.Organisation = (await (await fixture.Admin.PostAsJsonAsync("/api/workspace/organisations", new OrganisationRequest("Test club"))).Content.ReadFromJsonAsync<OrganisationResponse>())!;
            fixture.Admin.DefaultRequestHeaders.Add("X-Organisation-Id", fixture.Organisation.Id.ToString());
            fixture.TeamA = (await (await fixture.Admin.PostAsJsonAsync("/api/workspace/teams", new TeamRequest("Team A"))).Content.ReadFromJsonAsync<TeamResponse>())!;
            fixture.TeamB = (await (await fixture.Admin.PostAsJsonAsync("/api/workspace/teams", new TeamRequest("Team B"))).Content.ReadFromJsonAsync<TeamResponse>())!;
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

using System.Net;
using System.Net.Http.Json;
using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed class AgeGroupCatalogTests
{
    private static readonly string[] Expected = ["U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U18", "U19", "U20", "Senior"];

    [Fact]
    public async Task CatalogProvidesOrderedHockeyLevelsAndAllWritesRejectUnsupportedValues()
    {
        using var application = CreateApplication(TemporaryDatabase());
        using var client = application.CreateClient();
        var catalog = (await client.GetFromJsonAsync<CatalogResponse>("/api/catalog"))!;
        Assert.Equal(Expected, catalog.AgeGroups.Select(group => group.Id));
        Assert.Equal(catalog.AgeGroups.OrderBy(group => group.SortOrder), catalog.AgeGroups);
        Assert.Empty((await client.GetFromJsonAsync<List<DrillResponse>>("/api/drills"))!);
        Assert.Empty((await client.GetFromJsonAsync<List<TrainingResponse>>("/api/trainings"))!);
        var created = await client.PostAsJsonAsync("/api/drills", Drill(" u12 "));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal("U12", (await created.Content.ReadFromJsonAsync<DrillResponse>())!.AgeGroup);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/drills", Drill("U17"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/trainings", new TrainingRequest("Invalid plan", "", [], AgeGroup: "U7"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/workspace/teams", new TeamRequest("Invalid team", "Professionals"))).StatusCode);
        var senior = await client.PostAsJsonAsync("/api/workspace/teams", new TeamRequest("Senior team", "senior"));
        Assert.Equal("Senior", (await senior.Content.ReadFromJsonAsync<TeamResponse>())!.AgeGroup);
    }

    [Fact]
    public async Task ExistingMetadataSurvivesAdditiveCatalogUpgradeAndUnchangedLegacyEdits()
    {
        var path = TemporaryDatabase();
        Guid id;
        using (var application = CreateApplication(path))
        using (var client = application.CreateClient())
        {
            id = (await (await client.PostAsJsonAsync("/api/drills", Drill("U12"))).Content.ReadFromJsonAsync<DrillResponse>())!.Id;
            using var scope = application.Services.CreateScope();
            var database = scope.ServiceProvider.GetRequiredService<HockeyDbContext>();
            var drill = await database.Drills.SingleAsync(d => d.Id == id);
            drill.AgeGroup = "Mixed juniors";
            (await database.Teams.SingleAsync()).AgeGroup = "Mixed juniors";
            await database.SaveChangesAsync();
            // This isolated fixture represents the schema before the age-catalog table existed.
            await database.Database.ExecuteSqlRawAsync("DROP TABLE AgeGroups;");
        }
        using (var restarted = CreateApplication(path))
        using (var client = restarted.CreateClient())
        {
            var catalog = (await client.GetFromJsonAsync<CatalogResponse>("/api/catalog"))!;
            Assert.Equal(Expected, catalog.AgeGroups.Select(group => group.Id));
            var saved = (await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{id}"))!;
            Assert.Equal("Mixed juniors", saved.AgeGroup);
            Assert.Equal("Reusable instructions", saved.Notes);
            var inherited = await client.PostAsJsonAsync("/api/drills", Drill(null));
            Assert.Equal(HttpStatusCode.Created, inherited.StatusCode);
            Assert.Equal("", (await inherited.Content.ReadFromJsonAsync<DrillResponse>())!.AgeGroup);
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/drills/{id}", Drill("Mixed juniors"))).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/drills/{id}", Drill(null))).StatusCode);
            Assert.Equal("Mixed juniors", (await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{id}"))!.AgeGroup);
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/drills", Drill("Mixed juniors"))).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/drills/{id}", Drill("Senior"))).StatusCode);
            Assert.Equal("Senior", (await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{id}"))!.AgeGroup);
        }
    }

    private static DrillRequest Drill(string? ageGroup) => new("Age-group drill", "skating", "Reusable instructions", new Diagram(1, [], []), AgeGroup: ageGroup);
    private static string TemporaryDatabase() => Path.Combine(Path.GetTempPath(), "hockey-age-tests", Guid.NewGuid().ToString(), "hockey.db");
    private static WebApplicationFactory<Program> CreateApplication(string path) => new WebApplicationFactory<Program>()
        .WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.UseSetting("Auth:Mode", "Disabled");
            builder.UseSetting("Database:Provider", "Sqlite");
            builder.UseSetting("DatabasePath", path);
        });
}

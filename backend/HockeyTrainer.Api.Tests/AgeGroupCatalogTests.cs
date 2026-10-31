using System.Net;
using System.Net.Http.Json;
using HockeyTrainer.Application.Contracts;
using HockeyTrainer.Infrastructure.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed class AgeGroupCatalogTests
{
    private static readonly string[] Expected = ["HockeySchool", "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U18", "U20", "Senior"];

    [Fact]
    public async Task CatalogProvidesOrderedHockeyLevelsAndContentWritesRejectUnsupportedValues()
    {
        using var application = CreateApplication(TemporaryDatabase());
        using var client = application.CreateClient();
        var catalog = (await client.GetFromJsonAsync<CatalogResponse>("/api/catalog"))!;
        Assert.Equal(Expected, catalog.AgeGroups.Select(group => group.Id));
        Assert.Equal(catalog.AgeGroups.OrderBy(group => group.SortOrder), catalog.AgeGroups);
        Assert.DoesNotContain(catalog.Categories, category => category.Id == "hockey-school");
        Assert.Empty((await client.GetFromJsonAsync<List<DrillResponse>>("/api/drills"))!);
        Assert.Empty((await client.GetFromJsonAsync<List<TrainingResponse>>("/api/trainings"))!);
        var created = await client.PostAsJsonAsync("/api/drills", Drill(" u12 "));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal("U12", (await created.Content.ReadFromJsonAsync<DrillResponse>())!.AgeGroup);
        var hockeySchool = await client.PostAsJsonAsync("/api/drills", Drill("HockeySchool"));
        Assert.Equal(HttpStatusCode.Created, hockeySchool.StatusCode);
        Assert.Equal("HockeySchool", (await hockeySchool.Content.ReadFromJsonAsync<DrillResponse>())!.AgeGroup);
        var categoryHockeySchool = await client.PostAsJsonAsync("/api/drills", Drill(null) with { Tags = ["Hockey School"] });
        Assert.Equal(HttpStatusCode.BadRequest, categoryHockeySchool.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/drills", Drill("U17"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/trainings", new TrainingRequest("Invalid plan", "", [], AgeGroup: "U7"))).StatusCode);
        var team = await client.PostAsJsonAsync("/api/workspace/teams", new { name = "Team", ageGroup = "U12" });
        Assert.Equal(HttpStatusCode.OK, team.StatusCode);
        Assert.DoesNotContain("ageGroup", await team.Content.ReadAsStringAsync());
        using var scope = application.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<HockeyDbContext>();
        // A valid age saved by the older team model must no longer become a content default.
        (await database.Teams.SingleAsync(t => t.Id == HockeyTrainer.Domain.Models.WorkspaceDefaults.TeamId)).AgeGroup = "U12";
        await database.SaveChangesAsync();
        var unspecifiedDrill = await client.PostAsJsonAsync("/api/drills", Drill(null));
        Assert.Empty((await unspecifiedDrill.Content.ReadFromJsonAsync<DrillResponse>())!.AgeGroups!);
        var unspecifiedPlan = await client.PostAsJsonAsync("/api/trainings", new TrainingRequest("Unspecified", "", []));
        Assert.Empty((await unspecifiedPlan.Content.ReadFromJsonAsync<TrainingResponse>())!.AgeGroups!);
    }

    [Fact]
    public async Task HockeySchoolCategoryMetadataMovesToAgeGroupsDuringSqliteUpgrade()
    {
        var path = TemporaryDatabase();
        Guid drillId;
        Guid trainingId;
        using (var application = CreateApplication(path))
        {
            using var scope = application.Services.CreateScope();
            var database = scope.ServiceProvider.GetRequiredService<HockeyDbContext>();
            var drill = new HockeyTrainer.Domain.Models.Drill
            {
                Id = Guid.NewGuid(),
                Title = "Old hockey school drill",
                CategoryId = "hockey-school",
                TagsJson = "[\"Hockey School\",\"Skating\"]",
                AgeGroup = "U10",
                AgeGroupsJson = "[\"U10\"]",
                DiagramJson = "{}"
            };
            var training = new HockeyTrainer.Domain.Models.Training
            {
                Id = Guid.NewGuid(),
                Title = "Old hockey school practice",
                TagsJson = "[\"Hockey School\",\"Passing\"]"
            };
            database.Drills.Add(drill);
            database.Trainings.Add(training);
            await database.SaveChangesAsync();
            await database.Database.ExecuteSqlRawAsync("PRAGMA user_version = 2;");
            drillId = drill.Id;
            trainingId = training.Id;
        }

        using (var upgraded = CreateApplication(path))
        {
            using var scope = upgraded.Services.CreateScope();
            var database = scope.ServiceProvider.GetRequiredService<HockeyDbContext>();
            var drill = await database.Drills.SingleAsync(item => item.Id == drillId);
            var training = await database.Trainings.SingleAsync(item => item.Id == trainingId);
            Assert.Equal("other", drill.CategoryId);
            Assert.Equal("[\"Skating\"]", drill.TagsJson);
            Assert.Equal("[\"U10\",\"HockeySchool\"]", drill.AgeGroupsJson);
            Assert.Equal("[\"Passing\"]", training.TagsJson);
            Assert.Equal("[\"HockeySchool\"]", training.AgeGroupsJson);
        }
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
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/drills/{id}", Drill("Mixed juniors") with { Title = saved.Title })).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/drills/{id}", Drill(null) with { Title = saved.Title })).StatusCode);
            Assert.Equal("Mixed juniors", (await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{id}"))!.AgeGroup);
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/drills", Drill("Mixed juniors"))).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/drills/{id}", Drill("Senior"))).StatusCode);
            Assert.Equal("Senior", (await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{id}"))!.AgeGroup);
        }
    }

    private static DrillRequest Drill(string? ageGroup) => new($"Age-group drill {ageGroup ?? "unspecified"}", "skating", "Reusable instructions", new Diagram(1, [], []), AgeGroup: ageGroup);
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

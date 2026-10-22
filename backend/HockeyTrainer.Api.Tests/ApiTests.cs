using System.Net;
using System.Net.Http.Json;
using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed class ApiTests
{
    [Fact]
    public async Task SavedDrillSurvivesRestartAndFiltersCorrectly()
    {
        var path = TemporaryDatabase();
        Guid id;
        using (var app = new TestApplication(path))
        using (var client = app.CreateClient())
        {
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/health")).StatusCode);
            var response = await client.PostAsJsonAsync("/api/drills", Drill("Persistence test"));
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            var drill = (await response.Content.ReadFromJsonAsync<DrillResponse>())!;
            id = drill.Id;
            Assert.EndsWith(id.ToString(), response.Headers.Location!.ToString());
            Assert.True(File.Exists(path));
            var diagram = new Diagram(1,
                [new(Guid.NewGuid().ToString(), "cone", 350, 200, 45, "#f97316", "Turn")],
                [new(Guid.NewGuid().ToString(), "skating", [new(100, 200), new(350, 200)], "#2563eb")]);
            var updated = await client.PutAsJsonAsync($"/api/drills/{id}",
                Drill("Persistence test updated") with { Notes = "Coaching notes", Diagram = diagram });
            Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        }
        using (var restartedApp = new TestApplication(path))
        using (var client = restartedApp.CreateClient())
        {
            var saved = await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{id}");
            Assert.Equal("Persistence test updated", saved!.Title);
            Assert.Equal("Coaching notes", saved.Notes);
            var cone = Assert.Single(saved.Diagram.Objects);
            Assert.Equal("Turn", cone.Label);
            Assert.Equal(350, cone.X);
            Assert.Equal(45, cone.Rotation);
            var pathData = Assert.Single(saved.Diagram.Paths);
            Assert.Equal("skating", pathData.Kind);
            Assert.Equal(new[] { new Point(100, 200), new Point(350, 200) }, pathData.Points);
            var results = await client.GetFromJsonAsync<List<DrillResponse>>("/api/drills?search=persistence&categoryId=skating");
            Assert.Equal(id, Assert.Single(results!).Id);
        }
    }

    [Fact]
    public async Task TrainingPreservesDuplicatesAndOrderAndProtectsReferencedDrills()
    {
        using var app = new TestApplication(TemporaryDatabase());
        using var client = app.CreateClient();
        var drillResponse = await client.PostAsJsonAsync("/api/drills", Drill("Reusable drill"));
        var drill = (await drillResponse.Content.ReadFromJsonAsync<DrillResponse>())!;
        var request = new TrainingRequest("Practice", "", [new(drill.Id, 10, "first"), new(drill.Id, 20, "second")]);
        var created = await client.PostAsJsonAsync("/api/trainings", request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var training = (await created.Content.ReadFromJsonAsync<TrainingResponse>())!;
        var loaded = await client.GetFromJsonAsync<TrainingResponse>($"/api/trainings/{training.Id}");
        Assert.Equal(new[] { "first", "second" }, loaded!.Items.Select(i => i.Notes));
        var blocked = await client.DeleteAsync($"/api/drills/{drill.Id}");
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        Assert.False(string.IsNullOrWhiteSpace((await blocked.Content.ReadFromJsonAsync<ProblemDetails>())!.Detail));
        var updated = await client.PutAsJsonAsync($"/api/trainings/{training.Id}", request with { Items = [] });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/drills/{drill.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/drills/{drill.Id}")).StatusCode);
    }

    [Fact]
    public async Task InvalidReferencesCoordinatesAndJsonReturnProblemDetails()
    {
        using var app = new TestApplication(TemporaryDatabase());
        using var client = app.CreateClient();
        var badDiagram = new Diagram(1, [new(Guid.NewGuid().ToString(), "cone", 1001, 250, 0, "#f97316")], []);
        var badDrill = await client.PostAsJsonAsync("/api/drills", Drill("Bad coordinates") with { Diagram = badDiagram });
        Assert.Equal(HttpStatusCode.BadRequest, badDrill.StatusCode);
        Assert.Contains("Coordinates", (await badDrill.Content.ReadFromJsonAsync<ProblemDetails>())!.Detail);
        var badTraining = await client.PostAsJsonAsync("/api/trainings", new TrainingRequest("Missing reference", "", [new(Guid.NewGuid(), 10)]));
        Assert.Equal(HttpStatusCode.BadRequest, badTraining.StatusCode);
        Assert.Equal("Unknown drill", (await badTraining.Content.ReadFromJsonAsync<ProblemDetails>())!.Title);
        var malformed = await client.PostAsync("/api/drills", new StringContent("{bad json", System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, malformed.StatusCode);
        Assert.Equal("Invalid request", (await malformed.Content.ReadFromJsonAsync<ProblemDetails>())!.Title);
    }

    private static DrillRequest Drill(string title) => new(title, "skating", "", new Diagram(1, [], []));
    private static string TemporaryDatabase() => Path.Combine(Path.GetTempPath(), "hockey-tests", Guid.NewGuid().ToString(), "test.db");

    private sealed class TestApplication(string databasePath) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(databasePath)!);
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<HockeyDbContext>();
                services.AddScoped(_ => new HockeyDbContext(
                    new DbContextOptionsBuilder<HockeyDbContext>()
                        .UseSqlite($"Data Source={databasePath}").Options));
            });
        }
    }
}

using System.Net;
using System.Net.Http.Json;
using HockeyTrainer.Application.Contracts;
using HockeyTrainer.Infrastructure.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed partial class ApiTests
{
    [Fact]
    public async Task NewDatabaseStartsEmptyAndStaysEmptyAfterRestart()
    {
        var path = TemporaryDatabase();
        for (var start = 0; start < 2; start++)
        {
            using var app = new TestApplication(path);
            using var client = app.CreateClient();
            Assert.Empty((await client.GetFromJsonAsync<List<DrillResponse>>("/api/drills"))!);
            Assert.Empty((await client.GetFromJsonAsync<List<TrainingResponse>>("/api/trainings"))!);
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/readiness")).StatusCode);
        }
    }

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
    public async Task NewDrawingRoutesPersistAcrossRestart()
    {
        var databasePath = TemporaryDatabase();
        var route = new DiagramPath(Guid.NewGuid().ToString(), "skatingBackward", [new(100, 200), new(170, 210)], "#167e83");
        var shot = new DiagramPath(Guid.NewGuid().ToString(), "shooting", [new(170, 210), new(270, 210)], "#167e83");
        var solid = new DiagramPath(Guid.NewGuid().ToString(), "solid", [new(100, 260), new(270, 260)], "#167e83");
        var dotted = new DiagramPath(Guid.NewGuid().ToString(), "dotted", [new(100, 300), new(170, 300)], "#167e83");
        var dashed = new DiagramPath(Guid.NewGuid().ToString(), "dashed", [new(170, 300), new(270, 300)], "#167e83");
        var box = new DiagramPath(Guid.NewGuid().ToString(), "box", [new(310, 360), new(100, 260)], "#000000");
        Guid drillId;
        using (var app = new TestApplication(databasePath))
        using (var client = app.CreateClient())
        {
            var created = await client.PostAsJsonAsync("/api/drills", Drill("Backwards skating") with
            {
                Diagram = new Diagram(1, [], [route, shot, solid, dotted, dashed, box])
            });
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
            drillId = (await created.Content.ReadFromJsonAsync<DrillResponse>())!.Id;
        }
        using (var app = new TestApplication(databasePath))
        using (var client = app.CreateClient())
        {
            var saved = await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{drillId}");
            Assert.Equal(new[] { route.Kind, shot.Kind, solid.Kind, dotted.Kind, dashed.Kind, box.Kind }, saved!.Diagram.Paths.Select(path => path.Kind));
            Assert.Equal(route.Points, saved.Diagram.Paths[0].Points);
            Assert.Equal(shot.Points, saved.Diagram.Paths[1].Points);
            Assert.Equal(solid.Points, saved.Diagram.Paths[2].Points);
            Assert.Equal(dotted.Points, saved.Diagram.Paths[3].Points);
            Assert.Equal(dashed.Points, saved.Diagram.Paths[4].Points);
            Assert.Equal(box.Points, saved.Diagram.Paths[5].Points);
        }
    }

    [Fact]
    public async Task NewEquipmentTypesPersistThroughCreateUpdateAndRestart()
    {
        var path = TemporaryDatabase();
        var puckPileId = Guid.NewGuid().ToString();
        var smallTireId = Guid.NewGuid().ToString();
        var goalId = Guid.NewGuid().ToString();
        var playerId = Guid.NewGuid().ToString();
        var diagram = new Diagram(1,
        [
            new(puckPileId, "puckPile", 120, 200, 0, "#111827", "Pucks"),
            new(smallTireId, "smallTire", 220, 200, 30, "#64748b", "Small tire"),
            new(goalId, "goal", 350, 250, 90, "#dc3545", "Goal"),
            new(playerId, "player", 400, 250, 0, "#dc3545", "Red player")
        ], []);
        Guid drillId;
        using (var app = new TestApplication(path))
        using (var client = app.CreateClient())
        {
            var created = await client.PostAsJsonAsync("/api/drills", Drill("Equipment") with { Diagram = diagram });
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
            var drill = (await created.Content.ReadFromJsonAsync<DrillResponse>())!;
            drillId = drill.Id;
            Assert.Equal(new[] { "puckPile", "smallTire", "goal", "player" }, drill.Diagram.Objects.Select(o => o.Type));

            var updatedDiagram = diagram with { Objects = diagram.Objects.Select(o => o.Id == goalId ? o with { Rotation = 180 } : o).ToList() };
            var updated = await client.PutAsJsonAsync($"/api/drills/{drillId}", Drill("Equipment updated") with { Notes = "Keep the equipment", Diagram = updatedDiagram });
            Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
            Assert.Equal(180, (await updated.Content.ReadFromJsonAsync<DrillResponse>())!.Diagram.Objects.Single(o => o.Id == goalId).Rotation);

            var unknownDiagram = diagram with { Objects = [new(Guid.NewGuid().ToString(), "puckpile", 120, 200, 0, "#111827")] };
            var rejected = await client.PostAsJsonAsync("/api/drills", Drill("Unknown") with { Diagram = unknownDiagram });
            Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
            Assert.Contains("Unknown diagram object type", (await rejected.Content.ReadFromJsonAsync<ProblemDetails>())!.Detail);
        }
        using (var app = new TestApplication(path))
        using (var client = app.CreateClient())
        {
            var saved = (await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{drillId}"))!;
            Assert.Equal("Equipment updated", saved.Title);
            Assert.Equal("Keep the equipment", saved.Notes);
            Assert.Equal(1, saved.Diagram.Version);
            Assert.Equal(new[] { puckPileId, smallTireId, goalId, playerId }, saved.Diagram.Objects.Select(o => o.Id));
            Assert.Equal(new[] { "puckPile", "smallTire", "goal", "player" }, saved.Diagram.Objects.Select(o => o.Type));
            Assert.Equal(180, saved.Diagram.Objects.Single(o => o.Id == goalId).Rotation);
            Assert.Equal("#dc3545", saved.Diagram.Objects.Single(o => o.Id == playerId).Color);
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

    private static async Task CreateLegacyDatabaseAsync(string path, Guid drillId, Guid trainingId)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using var connection = new SqliteConnection($"Data Source={path}");
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE Drills (Id TEXT NOT NULL PRIMARY KEY, Title TEXT NOT NULL, CategoryId TEXT NOT NULL, Notes TEXT NOT NULL, DiagramJson TEXT NOT NULL, UpdatedAt TEXT NOT NULL);
            CREATE TABLE Trainings (Id TEXT NOT NULL PRIMARY KEY, Title TEXT NOT NULL, Notes TEXT NOT NULL, UpdatedAt TEXT NOT NULL);
            CREATE TABLE TrainingEntries (Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, TrainingId TEXT NOT NULL, DrillId TEXT NOT NULL, Position INTEGER NOT NULL, DurationMinutes INTEGER NOT NULL, Notes TEXT NOT NULL, FOREIGN KEY (TrainingId) REFERENCES Trainings(Id) ON DELETE CASCADE, FOREIGN KEY (DrillId) REFERENCES Drills(Id) ON DELETE RESTRICT);
            CREATE INDEX IX_TrainingEntries_DrillId ON TrainingEntries (DrillId);
            CREATE INDEX IX_TrainingEntries_TrainingId_Position ON TrainingEntries (TrainingId, Position);
            INSERT INTO Drills VALUES ($drillId, 'Original drill', 'skating', 'Original notes', '{"version":1,"objects":[],"paths":[]}', '2026-10-22 08:00:00+00:00');
            INSERT INTO Drills VALUES ($secondDrillId, 'Original shooting drill', 'shooting', 'Finishing notes', '{"version":1,"objects":[],"paths":[]}', '2026-10-22 08:00:00+00:00');
            INSERT INTO Trainings VALUES ($trainingId, 'Original practice', 'Original practice notes', '2026-10-22 08:00:00+00:00');
            INSERT INTO TrainingEntries (TrainingId, DrillId, Position, DurationMinutes, Notes) VALUES ($trainingId, $drillId, 0, 10, 'First'), ($trainingId, $drillId, 1, 20, 'Repeat'), ($trainingId, $secondDrillId, 2, 15, 'Finish');
            """;
        command.Parameters.AddWithValue("$drillId", drillId);
        command.Parameters.AddWithValue("$trainingId", trainingId);
        command.Parameters.AddWithValue("$secondDrillId", Guid.NewGuid());
        await command.ExecuteNonQueryAsync();
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

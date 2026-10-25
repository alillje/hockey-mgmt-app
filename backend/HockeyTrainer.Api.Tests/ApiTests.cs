using System.Net;
using System.Net.Http.Json;
using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed class ApiTests
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
        Guid drillId;
        using (var app = new TestApplication(databasePath))
        using (var client = app.CreateClient())
        {
            var created = await client.PostAsJsonAsync("/api/drills", Drill("Backwards skating") with
            {
                Diagram = new Diagram(1, [], [route, shot, solid, dotted, dashed])
            });
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
            drillId = (await created.Content.ReadFromJsonAsync<DrillResponse>())!.Id;
        }
        using (var app = new TestApplication(databasePath))
        using (var client = app.CreateClient())
        {
            var saved = await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{drillId}");
            Assert.Equal(new[] { route.Kind, shot.Kind, solid.Kind, dotted.Kind, dashed.Kind }, saved!.Diagram.Paths.Select(path => path.Kind));
            Assert.Equal(route.Points, saved.Diagram.Paths[0].Points);
            Assert.Equal(shot.Points, saved.Diagram.Paths[1].Points);
            Assert.Equal(solid.Points, saved.Diagram.Paths[2].Points);
            Assert.Equal(dotted.Points, saved.Diagram.Paths[3].Points);
            Assert.Equal(dashed.Points, saved.Diagram.Paths[4].Points);
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

    [Fact]
    public async Task MultipleTagsNormalizeFilterAndRemainIndependent()
    {
        using var app = new TestApplication(TemporaryDatabase());
        using var client = app.CreateClient();
        var request = Drill("Tagged drill") with { Tags = ["  shooting  ", "  STICK   handling ", "SHOOTING", "stick handling"] };
        var created = await client.PostAsJsonAsync("/api/drills", request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var drill = (await created.Content.ReadFromJsonAsync<DrillResponse>())!;
        Assert.Equal(new[] { "Shooting", "Stick handling" }, drill.Tags);
        var filtered = await client.GetFromJsonAsync<List<DrillResponse>>("/api/drills?tag=stick%20handling&search=HANDLING");
        Assert.Equal(drill.Id, Assert.Single(filtered!).Id);
        Assert.Empty((await client.GetFromJsonAsync<List<DrillResponse>>("/api/drills?tag=stick"))!);

        var practiceResponse = await client.PostAsJsonAsync("/api/trainings",
            new TrainingRequest("Tagged practice", "", [new(drill.Id, 10)], ["  skating", "STICK   handling"]));
        var practice = (await practiceResponse.Content.ReadFromJsonAsync<TrainingResponse>())!;
        Assert.Equal(new[] { "Skating", "Stick handling" }, practice.Tags);
        var practices = await client.GetFromJsonAsync<List<TrainingResponse>>("/api/trainings?tag=STICK%20HANDLING&search=handling");
        Assert.Equal(practice.Id, Assert.Single(practices!).Id);

        var preserve = await client.PutAsJsonAsync($"/api/drills/{drill.Id}", request with { Tags = null });
        Assert.Equal(drill.Tags, (await preserve.Content.ReadFromJsonAsync<DrillResponse>())!.Tags);
        var empty = await client.PutAsJsonAsync($"/api/drills/{drill.Id}", request with { Tags = [] });
        Assert.Empty((await empty.Content.ReadFromJsonAsync<DrillResponse>())!.Tags);
        Assert.Equal(practice.Tags, (await client.GetFromJsonAsync<TrainingResponse>($"/api/trainings/{practice.Id}"))!.Tags);
        var omittedPractice = await client.PutAsJsonAsync($"/api/trainings/{practice.Id}", new TrainingRequest("Edited practice", "", []));
        Assert.Equal(practice.Tags, (await omittedPractice.Content.ReadFromJsonAsync<TrainingResponse>())!.Tags);
        var clearPractice = await client.PutAsJsonAsync($"/api/trainings/{practice.Id}", new TrainingRequest("Edited practice", "", [], []));
        Assert.Empty((await clearPractice.Content.ReadFromJsonAsync<TrainingResponse>())!.Tags);

        var legacyDefault = await client.PostAsJsonAsync("/api/drills", Drill("Legacy client"));
        Assert.Equal(new[] { "Skating" }, (await legacyDefault.Content.ReadFromJsonAsync<DrillResponse>())!.Tags);
        var emptyDraft = await client.PostAsJsonAsync("/api/trainings", new TrainingRequest("Draft", "", []));
        Assert.Empty((await emptyDraft.Content.ReadFromJsonAsync<TrainingResponse>())!.Tags);
    }

    [Theory]
    [InlineData(" ")]
    [InlineData("This tag is deliberately longer than forty characters")]
    [InlineData("U12 skills")]
    [InlineData("stick-handling")]
    public async Task InvalidTagsProduceValidationProblems(string tag)
    {
        using var app = new TestApplication(TemporaryDatabase());
        using var client = app.CreateClient();
        var invalidDrill = await client.PostAsJsonAsync("/api/drills", Drill("Invalid") with { Tags = [tag] });
        Assert.Equal(HttpStatusCode.BadRequest, invalidDrill.StatusCode);
        Assert.Equal("Invalid tags", (await invalidDrill.Content.ReadFromJsonAsync<ProblemDetails>())!.Title);
        var invalidTraining = await client.PostAsJsonAsync("/api/trainings", new TrainingRequest("Invalid", "", [], [tag]));
        Assert.Equal(HttpStatusCode.BadRequest, invalidTraining.StatusCode);
        Assert.Equal("Invalid tags", (await invalidTraining.Content.ReadFromJsonAsync<ProblemDetails>())!.Title);
        var tooMany = await client.PostAsJsonAsync("/api/trainings", new TrainingRequest("Invalid", "", [], Enumerable.Range(0, 21).Select(i => $"Tag {i}").ToList()));
        Assert.Equal(HttpStatusCode.BadRequest, tooMany.StatusCode);
    }

    [Fact]
    public async Task UnknownTagOnUpdateIsRejectedWithoutChangingSavedTags()
    {
        using var app = new TestApplication(TemporaryDatabase());
        using var client = app.CreateClient();
        var created = await client.PostAsJsonAsync("/api/drills", Drill("Saved") with { Tags = ["Passing"] });
        var drill = (await created.Content.ReadFromJsonAsync<DrillResponse>())!;
        var rejected = await client.PutAsJsonAsync($"/api/drills/{drill.Id}", Drill("Changed") with { Tags = ["Custom"] });
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        Assert.Equal("Choose tags from fixed catalog.", (await rejected.Content.ReadFromJsonAsync<ProblemDetails>())!.Detail);
        var saved = (await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{drill.Id}"))!;
        Assert.Equal("Saved", saved.Title);
        Assert.Equal(new[] { "Passing" }, saved.Tags);
    }

    [Fact]
    public async Task LegacyDatabaseUpgradePreservesDataAndOnlyBackfillsOnce()
    {
        var path = TemporaryDatabase();
        var drillId = Guid.NewGuid();
        var trainingId = Guid.NewGuid();
        await CreateLegacyDatabaseAsync(path, drillId, trainingId);
        using (var app = new TestApplication(path))
        using (var client = app.CreateClient())
        {
            var drill = (await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{drillId}"))!;
            Assert.Equal("Original notes", drill.Notes);
            Assert.Equal(new[] { "Skating" }, drill.Tags);
            Assert.Equal(new DateTimeOffset(2026, 10, 22, 8, 0, 0, TimeSpan.Zero), drill.UpdatedAt);
            var training = (await client.GetFromJsonAsync<TrainingResponse>($"/api/trainings/{trainingId}"))!;
            Assert.Equal(new[] { "Skating", "Shooting" }, training.Tags);
            Assert.Equal("Original practice notes", training.Notes);
            Assert.Equal(new[] { "First", "Repeat", "Finish" }, training.Items.Select(i => i.Notes));
            Assert.Equal(drillId, training.Items[0].DrillId);
            Assert.Equal(drillId, training.Items[1].DrillId);
            Assert.NotEqual(drillId, training.Items[2].DrillId);
            Assert.Equal(new[] { 10, 20, 15 }, training.Items.Select(i => i.DurationMinutes));
            var clear = await client.PutAsJsonAsync($"/api/drills/{drillId}", Drill(drill.Title) with { Tags = [] });
            Assert.Equal(HttpStatusCode.OK, clear.StatusCode);
            var edit = await client.PutAsJsonAsync($"/api/trainings/{trainingId}", new TrainingRequest(training.Title, training.Notes, training.Items, ["Tactics"]));
            Assert.Equal(HttpStatusCode.OK, edit.StatusCode);
        }
        using (var app = new TestApplication(path))
        using (var client = app.CreateClient())
        {
            Assert.Empty((await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{drillId}"))!.Tags);
            var training = (await client.GetFromJsonAsync<TrainingResponse>($"/api/trainings/{trainingId}"))!;
            Assert.Equal(new[] { "Tactics" }, training.Tags);
            Assert.Equal(3, training.Items.Count);
            Assert.Equal(2, (await client.GetFromJsonAsync<List<DrillResponse>>("/api/drills"))!.Count);
        }
        await using var connection = new SqliteConnection($"Data Source={path}");
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA user_version;";
        Assert.Equal(2L, await command.ExecuteScalarAsync());
    }

    [Fact]
    public async Task VersionOneUpgradeMapsCustomTagsAndPreservesResourcesAndExplicitEmptyTags()
    {
        var path = TemporaryDatabase();
        var drillId = Guid.NewGuid();
        var trainingId = Guid.NewGuid();
        await CreateLegacyDatabaseAsync(path, drillId, trainingId);
        await using (var connection = new SqliteConnection($"Data Source={path}"))
        {
            await connection.OpenAsync();
            await using var command = connection.CreateCommand();
            command.CommandText = """
                ALTER TABLE Drills ADD COLUMN TagsJson TEXT NOT NULL DEFAULT '[]';
                ALTER TABLE Trainings ADD COLUMN TagsJson TEXT NOT NULL DEFAULT '[]';
                UPDATE Drills SET TagsJson = '["  SHOOTING ","shooting","U12 skills","another custom","stick-handling","Other"]', DiagramJson = '{"version":1,"objects":[{"id":"88bd8668-f72f-4bf5-9d30-b0799df3ae15","type":"cone","x":350,"y":200,"rotation":45,"color":"#f97316","label":"Turn"}],"paths":[]}' WHERE Id = $drillId;
                UPDATE Trainings SET TagsJson = '[" Warm-up ","warm-up","custom practice","OTHER"]' WHERE Id = $trainingId;
                PRAGMA user_version = 1;
                """;
            command.Parameters.AddWithValue("$drillId", drillId);
            command.Parameters.AddWithValue("$trainingId", trainingId);
            await command.ExecuteNonQueryAsync();
        }

        using (var app = new TestApplication(path))
        using (var client = app.CreateClient())
        {
            var drill = (await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{drillId}"))!;
            Assert.Equal(new[] { "Shooting", "Other", "Stick handling" }, drill.Tags);
            Assert.Equal("Original notes", drill.Notes);
            Assert.Equal(new DateTimeOffset(2026, 10, 22, 8, 0, 0, TimeSpan.Zero), drill.UpdatedAt);
            Assert.Equal("Turn", Assert.Single(drill.Diagram.Objects).Label);
            var training = (await client.GetFromJsonAsync<TrainingResponse>($"/api/trainings/{trainingId}"))!;
            Assert.Equal(new[] { "Warm-up", "Other" }, training.Tags);
            Assert.Equal("Original practice notes", training.Notes);
            Assert.Equal(new[] { "First", "Repeat", "Finish" }, training.Items.Select(i => i.Notes));
            Assert.Equal(new[] { 10, 20, 15 }, training.Items.Select(i => i.DurationMinutes));
            Assert.Equal(drillId, training.Items[0].DrillId);
            Assert.Equal(drillId, training.Items[1].DrillId);
            var drills = (await client.GetFromJsonAsync<List<DrillResponse>>("/api/drills"))!;
            Assert.Empty(Assert.Single(drills, d => d.Id != drillId).Tags);
            var clear = await client.PutAsJsonAsync($"/api/drills/{drillId}", Drill(drill.Title) with { Tags = [] });
            Assert.Equal(HttpStatusCode.OK, clear.StatusCode);
        }
        using (var app = new TestApplication(path))
        using (var client = app.CreateClient())
        {
            Assert.Empty((await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{drillId}"))!.Tags);
            Assert.Equal(new[] { "Warm-up", "Other" }, (await client.GetFromJsonAsync<TrainingResponse>($"/api/trainings/{trainingId}"))!.Tags);
        }
        await using var verify = new SqliteConnection($"Data Source={path}");
        await verify.OpenAsync();
        await using var version = verify.CreateCommand();
        version.CommandText = "PRAGMA user_version;";
        Assert.Equal(2L, await version.ExecuteScalarAsync());
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

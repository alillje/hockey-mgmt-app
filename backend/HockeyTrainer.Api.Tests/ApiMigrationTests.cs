using System.Net;
using System.Net.Http.Json;
using HockeyTrainer.Application.Contracts;
using Microsoft.Data.Sqlite;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed partial class ApiTests
{
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
        Assert.Equal(3L, await command.ExecuteScalarAsync());
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
        Assert.Equal(3L, await version.ExecuteScalarAsync());
    }

}

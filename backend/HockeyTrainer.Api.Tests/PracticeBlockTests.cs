using System.Net;
using System.Net.Http.Json;
using HockeyTrainer.Application.Contracts;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed partial class ApiTests
{
    [Fact]
    public async Task PracticeBlocksPreserveSharedTimingNotesAndOrderAcrossRestart()
    {
        var path = TemporaryDatabase();
        Guid id;
        using (var app = new TestApplication(path))
        using (var client = app.CreateClient())
        {
            var createdDrill = await client.PostAsJsonAsync("/api/drills", Drill("Block drill"));
            var drill = (await createdDrill.Content.ReadFromJsonAsync<DrillResponse>())!;
            var request = new TrainingRequest("Parallel practice", Items: [new(drill.Id, 12, "Station 1"), new(drill.Id, 12, "Station 2", true), new(drill.Id, 0, "Untimed")]);
            var response = await client.PostAsJsonAsync("/api/trainings", request);
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            id = (await response.Content.ReadFromJsonAsync<TrainingResponse>())!.Id;
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/trainings/{id}", request with { Items = [new(drill.Id, 5, RunInParallelWithPrevious: true)] })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/trainings/{id}", request with { Items = [new(drill.Id, 5), new(drill.Id, 6, RunInParallelWithPrevious: true)] })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/trainings/{id}", request with { Items = [new(drill.Id, -1)] })).StatusCode);
        }
        using var restarted = new TestApplication(path);
        using var reader = restarted.CreateClient();
        var saved = (await reader.GetFromJsonAsync<TrainingResponse>($"/api/trainings/{id}"))!;
        Assert.Equal(new[] { false, true, false }, saved.Items.Select(entry => entry.RunInParallelWithPrevious));
        Assert.Equal(new[] { 12, 12, 0 }, saved.Items.Select(entry => entry.DurationMinutes));
        Assert.Equal(new[] { "Station 1", "Station 2", "Untimed" }, saved.Items.Select(entry => entry.Notes));
    }
}

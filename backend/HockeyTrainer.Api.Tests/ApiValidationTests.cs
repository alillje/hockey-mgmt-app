using System.Net;
using System.Net.Http.Json;
using HockeyTrainer.Application.Contracts;
using Microsoft.AspNetCore.Mvc;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed partial class ApiTests
{
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
    public async Task BoxesRejectExtraCornersAndZeroDimensions()
    {
        using var app = new TestApplication(TemporaryDatabase());
        using var client = app.CreateClient();
        List<List<Point>> invalidCorners =
        [
            [new(100, 100), new(100, 200)],
            [new(100, 100), new(200, 100)],
            [new(100, 100), new(200, 200), new(300, 300)],
            [new(100, 100), new(1001, 200)]
        ];
        foreach (var corners in invalidCorners)
        {
            var request = Drill("Invalid box") with
            {
                Diagram = new Diagram(1, [], [new(Guid.NewGuid().ToString(), "box", corners, "#000000")])
            };
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/drills", request)).StatusCode);
        }
        Assert.Empty((await client.GetFromJsonAsync<List<DrillResponse>>("/api/drills"))!);
    }
}

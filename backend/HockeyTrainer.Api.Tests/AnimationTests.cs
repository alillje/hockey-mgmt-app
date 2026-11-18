using System.Net;
using System.Net.Http.Json;
using HockeyTrainer.Application.Contracts;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed partial class ApiTests
{
    [Theory]
    [InlineData("P")]
    [InlineData("C")]
    public async Task PlayersAndCoachesCanPassAnExplicitIndividualPuck(string label)
    {
        using var app = new TestApplication(TemporaryDatabase());
        using var client = app.CreateClient();
        var diagram = AnimatedDiagram();
        diagram = diagram with
        {
            Objects = [diagram.Objects[0] with { Label = label }, diagram.Objects[1]],
            Animation = new DrillAnimation(1, [new(Guid.NewGuid().ToString(), diagram.Objects[0].Id, diagram.Paths[1].Id, 0.5, diagram.Objects[1].Id)])
        };
        var response = await client.PostAsJsonAsync("/api/drills", Drill("Pass animation") with { Diagram = diagram });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(diagram.Animation.Actions, (await response.Content.ReadFromJsonAsync<DrillResponse>())!.Diagram.Animation!.Actions);
        var invalid = diagram with { Animation = new DrillAnimation(1, [diagram.Animation.Actions[0] with { PuckId = null }]) };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/drills", Drill("Missing puck") with { Diagram = invalid })).StatusCode);
    }

    [Theory]
    [InlineData("puckPile")]
    [InlineData("cone")]
    [InlineData("tire")]
    [InlineData("smallTire")]
    [InlineData("goal")]
    public async Task EquipmentCannotBeAnAnimationActorOrUsedAsTheSelectedPuck(string type)
    {
        using var app = new TestApplication(TemporaryDatabase());
        using var client = app.CreateClient();
        var diagram = AnimatedDiagram();
        var equipment = diagram.Objects[1] with { Type = type };
        var invalid = diagram with
        {
            Objects = [diagram.Objects[0], equipment],
            Animation = new DrillAnimation(1, [new(Guid.NewGuid().ToString(), equipment.Id, diagram.Paths[1].Id, 0.5)])
        };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/drills", Drill("Equipment actor") with { Diagram = invalid })).StatusCode);
        invalid = invalid with { Animation = new DrillAnimation(1, [new(Guid.NewGuid().ToString(), diagram.Objects[0].Id, diagram.Paths[1].Id, 0.5, equipment.Id)]) };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/drills", Drill("Equipment puck") with { Diagram = invalid })).StatusCode);
    }

    internal static Diagram AnimatedDiagram()
    {
        var player = Guid.NewGuid().ToString();
        var puck = Guid.NewGuid().ToString();
        var skate = Guid.NewGuid().ToString();
        var pass = Guid.NewGuid().ToString();

        return new Diagram(1,
            [new(player, "player", 100, 200, 0, "#167e83", "P"), new(puck, "puck", 108, 208, 0, "#000000")],
            [new(skate, "puckHandling", [new(100, 200), new(200, 200)], "#000000"), new(pass, "passing", [new(208, 208), new(400, 208)], "#000000")],
            new DrillAnimation(1, [new(Guid.NewGuid().ToString(), player, skate, 2, puck), new(Guid.NewGuid().ToString(), puck, pass, 1)]));
    }

    [Fact]
    public async Task OptionalAnimationPersistsAcrossRestartAndCanBeRemovedWithoutChangingDrawing()
    {
        var path = TemporaryDatabase();
        Guid id;
        var diagram = AnimatedDiagram();
        using (var app = new TestApplication(path))
        using (var client = app.CreateClient())
        {
            var response = await client.PostAsJsonAsync("/api/drills", Drill("Animated drill") with { Diagram = diagram });
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            id = (await response.Content.ReadFromJsonAsync<DrillResponse>())!.Id;
        }
        using var restarted = new TestApplication(path);
        using var reader = restarted.CreateClient();
        var loaded = (await reader.GetFromJsonAsync<DrillResponse>($"/api/drills/{id}"))!;
        Assert.Equal(diagram.Animation!.Actions, loaded.Diagram.Animation!.Actions);
        Assert.Equal(diagram.Objects, loaded.Diagram.Objects);
        var changed = await reader.PutAsJsonAsync($"/api/drills/{id}", Drill("Animated drill") with { Diagram = diagram with { Animation = null } });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        var removed = (await changed.Content.ReadFromJsonAsync<DrillResponse>())!.Diagram;
        Assert.Null(removed.Animation);
        Assert.Equal(diagram.Objects, removed.Objects);
    }

    [Fact]
    public async Task SkatingExchangePersistsAndRejectsPassingBeforeReception()
    {
        using var app = new TestApplication(TemporaryDatabase());
        using var client = app.CreateClient();
        var diagram = AnimatedDiagram();
        var route = diagram.Paths[0] with
        {
            Kind = "skating"
        };
        var receiver = diagram.Objects[0] with
        {
            Id = Guid.NewGuid().ToString(),
            Y = 260
        };
        var receiving = new AnimationAction(Guid.NewGuid().ToString(), receiver.Id, route.Id, 2, StartWithPrevious: true);
        var sending = new AnimationAction(Guid.NewGuid().ToString(), diagram.Objects[0].Id, route.Id, 2);
        sending = sending with
        {
            SkatingPassChain = new SkatingPassChain(diagram.Objects[1].Id,
            [
                new(receiving.Id, 0.25, 0.25),
                new(sending.Id, 0.625, 0.925)
            ])
        };
        var exchange = diagram with
        {
            Objects = [.. diagram.Objects, receiver],
            Paths = [route],
            Animation = new DrillAnimation(1, [sending, receiving])
        };

        var created = await client.PostAsJsonAsync("/api/drills", Drill("Moving exchange") with { Diagram = exchange });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var saved = (await created.Content.ReadFromJsonAsync<DrillResponse>())!;
        var reloaded = (await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{saved.Id}"))!;
        var chain = reloaded.Diagram.Animation!.Actions[0].SkatingPassChain!;
        Assert.Equal(sending.SkatingPassChain!.Passes, chain.Passes);

        chain.Passes[1] = chain.Passes[1] with
        {
            ReleaseFraction = 0.2
        };
        var invalid = await client.PutAsJsonAsync($"/api/drills/{saved.Id}", Drill("Moving exchange") with { Diagram = reloaded.Diagram });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
    }

    [Fact]
    public async Task SkatingPassPersistsReleaseAndRejectsAnInvalidPoint()
    {
        using var app = new TestApplication(TemporaryDatabase());
        using var client = app.CreateClient();
        var diagram = AnimatedDiagram();
        var combined = diagram.Animation!.Actions[0] with
        {
            PassRelease = new PassRelease(diagram.Paths[1].Id, 0.5)
        };
        diagram = diagram with
        {
            Animation = new DrillAnimation(1, [combined])
        };

        var created = await client.PostAsJsonAsync("/api/drills", Drill("Skating pass") with { Diagram = diagram });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var saved = (await created.Content.ReadFromJsonAsync<DrillResponse>())!;
        var reloaded = (await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{saved.Id}"))!;
        Assert.Equal(combined.PassRelease, Assert.Single(reloaded.Diagram.Animation!.Actions).PassRelease);

        var invalid = diagram with
        {
            Animation = new DrillAnimation(1,
            [
                combined with
                {
                    PassRelease = new PassRelease(diagram.Paths[1].Id, 1)
                }
            ])
        };
        var rejected = await client.PostAsJsonAsync("/api/drills", Drill("Invalid skating pass") with { Diagram = invalid });
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
    }

    [Fact]
    public async Task GroupedAnimationRoundTripsAndRejectsSharedMarkers()
    {
        using var app = new TestApplication(TemporaryDatabase());
        using var client = app.CreateClient();
        var diagram = AnimatedDiagram();
        var carry = diagram.Animation!.Actions[0];
        var pass = diagram.Animation.Actions[1];
        var skate = carry with
        {
            PuckId = null
        };
        var simultaneousPass = pass with
        {
            StartWithPrevious = true
        };
        var grouped = diagram with
        {
            Paths = [diagram.Paths[0] with { Kind = "skating" }, diagram.Paths[1]],
            Animation = new DrillAnimation(1, [skate, simultaneousPass])
        };

        var created = await client.PostAsJsonAsync("/api/drills", Drill("Grouped actions") with { Diagram = grouped });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var saved = (await created.Content.ReadFromJsonAsync<DrillResponse>())!;
        var reloaded = (await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{saved.Id}"))!;
        Assert.Equal(grouped.Animation.Actions, reloaded.Diagram.Animation!.Actions);

        var conflict = diagram with
        {
            Animation = new DrillAnimation(1, [carry, simultaneousPass])
        };
        var rejected = await client.PostAsJsonAsync("/api/drills", Drill("Conflicting actions") with { Diagram = conflict });
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
    }

    [Theory]
    [InlineData(24, 1.25, HttpStatusCode.Created)]
    [InlineData(25, 1, HttpStatusCode.BadRequest)]
    [InlineData(24, 1.5, HttpStatusCode.BadRequest)]
    public async Task AnimationEnforcesActionAndDurationLimits(int count, double duration, HttpStatusCode expected)
    {
        using var app = new TestApplication(TemporaryDatabase());
        using var client = app.CreateClient();
        var diagram = AnimatedDiagram();
        var template = diagram.Animation!.Actions[0];
        var actions = Enumerable.Range(0, count).Select(_ => template with
        {
            Id = Guid.NewGuid().ToString(),
            DurationSeconds = duration
        }).ToList();
        var request = Drill("Animation limits") with
        {
            Diagram = diagram with
            {
                Animation = new DrillAnimation(1, actions)
            }
        };

        var response = await client.PostAsJsonAsync("/api/drills", request);
        Assert.Equal(expected, response.StatusCode);
    }

    [Theory]
    [InlineData("reference")]
    [InlineData("actor")]
    [InlineData("puck")]
    [InlineData("duration")]
    [InlineData("total")]
    [InlineData("duplicate")]
    [InlineData("version")]
    [InlineData("count")]
    [InlineData("null-action")]
    public async Task InvalidAnimationIsRejectedWithoutSavingContent(string invalid)
    {
        using var app = new TestApplication(TemporaryDatabase());
        using var client = app.CreateClient();
        var diagram = AnimatedDiagram();
        var animation = diagram.Animation!;
        var action = animation.Actions[0];
        animation = invalid switch
        {
            "reference" => animation with { Actions = [action with { PathId = Guid.NewGuid().ToString() }] },
            "actor" => animation with { Actions = [action with { ObjectId = diagram.Objects[1].Id }] },
            "puck" => animation with { Actions = [action with { PuckId = null }] },
            "duration" => animation with { Actions = [action with { DurationSeconds = 0 }] },
            "total" => animation with { Actions = [action with { DurationSeconds = 10 }, action with { Id = Guid.NewGuid().ToString(), DurationSeconds = 10 }, action with { Id = Guid.NewGuid().ToString(), DurationSeconds = 10 }, action with { Id = Guid.NewGuid().ToString(), DurationSeconds = 1 }] },
            "duplicate" => animation with { Actions = [action, action] },
            "version" => animation with { Version = 2 },
            "count" => animation with { Actions = [] },
            "null-action" => animation with { Actions = [null!] },
            _ => animation
        };
        var response = await client.PostAsJsonAsync("/api/drills", Drill("Invalid animation") with { Diagram = diagram with { Animation = animation } });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty((await client.GetFromJsonAsync<List<DrillResponse>>("/api/drills"))!);
    }
}

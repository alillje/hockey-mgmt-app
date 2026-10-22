using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace HockeyTrainer.Api.Data;

public static class DatabaseSeeder
{
    public static async Task SeedAsync(IServiceProvider services)
    {
        var db = services.GetRequiredService<HockeyDbContext>();
        // Only initialize a completely empty database; never replace a coach's saved work.
        if (await db.Drills.AnyAsync() || await db.Trainings.AnyAsync())
        {
            return;
        }
        var service = services.GetRequiredService<IHockeyService>();
        var skating = await service.SaveDrillAsync(null, new DrillRequest(
            "Edge control circuit", "skating",
            "Start at the blue line. Weave through the cones using inside and outside edges. Keep knees bent and finish with a controlled stop. Repeat in both directions.",
            new Diagram(1,
                [Object("player", 180, 250, "#2563eb", "Start"), Object("cone", 350, 180, "#f97316"), Object("cone", 500, 320, "#f97316"), Object("cone", 650, 180, "#f97316")],
                [new DiagramPath(Guid.NewGuid().ToString(), "skating", [new(200, 250), new(350, 140), new(500, 360), new(650, 140), new(820, 250)], "#2563eb")])), default);
        var passing = await service.SaveDrillAsync(null, new DrillRequest(
            "Pass and follow", "passing",
            "Pass across the rink and skate to the back of the opposite line. Receive with soft hands and keep the puck moving. Progress to one-touch passes.",
            new Diagram(1, [Object("player", 300, 150, "#2563eb", "A"), Object("player", 700, 350, "#dc2626", "B"), Object("puck", 330, 170, "#111827")],
                [new DiagramPath(Guid.NewGuid().ToString(), "passing", [new(330, 170), new(680, 330)], "#111827")])), default);
        var shooting = await service.SaveDrillAsync(null, new DrillRequest(
            "Quick release finish", "shooting",
            "Carry the puck around the tire, pull into the shooting lane and release before reaching the hash marks. Aim low for a rebound and follow your shot.",
            new Diagram(1, [Object("goal", 920, 250, "#dc2626"), Object("tire", 670, 250, "#111827"), Object("player", 450, 320, "#2563eb")],
                [new DiagramPath(Guid.NewGuid().ToString(), "puckHandling", [new(450, 320), new(600, 330), new(710, 190)], "#2563eb"), new DiagramPath(Guid.NewGuid().ToString(), "passing", [new(710, 190), new(920, 250)], "#111827")])), default);
        await service.SaveTrainingAsync(null, new TrainingRequest("U12 · Skills & confidence", "A focused 45-minute practice. Gather the group between blocks for one clear coaching point.",
            [new(skating.Id, 15, "Warm up with two easy laps before the circuit."), new(passing.Id, 15, "Work in pairs; switch sides halfway."), new(shooting.Id, 15, "Finish with a friendly accuracy challenge.")]), default);
    }

    private static DiagramObject Object(string type, double x, double y, string color, string label = "") => new(Guid.NewGuid().ToString(), type, x, y, 0, color, label);
}

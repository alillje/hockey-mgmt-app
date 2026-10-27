using System.Net;
using System.Net.Http.Json;
using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Data;
using HockeyTrainer.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed class MultipleAgeGroupsTests
{
    [Fact]
    public async Task SqliteMetadataUpgradeBackfillsLegacyAgesOnceWithoutOverwritingLaterSelections()
    {
        await using var db = new HockeyDbContext(new DbContextOptionsBuilder<HockeyDbContext>().UseSqlite("Data Source=:memory:").Options);
        await db.Database.OpenConnectionAsync();
        await db.Database.EnsureCreatedAsync();
        var drill = new Drill
        {
            Id = Guid.NewGuid(),
            Title = "Preserved metadata",
            AgeGroup = "Mixed juniors",
            DiagramJson = "{}"
        };
        db.Drills.Add(drill);
        await db.SaveChangesAsync();
        await AccountAndAgeUpgrade.ApplySqliteAsync(db, default);
        db.ChangeTracker.Clear();
        var saved = await db.Drills.SingleAsync();
        Assert.Equal("[\"Mixed juniors\"]", saved.AgeGroupsJson);
        Assert.Equal(drill.Id, saved.Id);
        saved.AgeGroupsJson = "[\"U8\",\"U12\"]";
        saved.AgeGroup = "U8";
        await db.SaveChangesAsync();
        await AccountAndAgeUpgrade.ApplySqliteAsync(db, default);
        db.ChangeTracker.Clear();
        Assert.Equal("[\"U8\",\"U12\"]", (await db.Drills.SingleAsync()).AgeGroupsJson);
    }

    [Fact]
    public async Task ContentSupportsSeveralCanonicalAgesExplicitEmptyAllAndIndependentCopies()
    {
        var path = Path.Combine(Path.GetTempPath(), "hockey-multiple-ages-" + Guid.NewGuid().ToString("N") + ".db");
        using var app = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("DatabasePath", path);
            b.UseSetting("Database:Provider", "Sqlite");
            b.UseSetting("Auth:Mode", "Disabled");
        });
        using var client = app.CreateClient();
        var request = new DrillRequest("Multi-age drill", "battling", Tags: ["Battling"], Diagram: new Diagram(1, [], []), AgeGroups: [" u12 ", "U8", "u12"]);
        var created = await client.PostAsJsonAsync("/api/drills", request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var drill = (await created.Content.ReadFromJsonAsync<DrillResponse>())!;
        Assert.Equal(new[] { "U8", "U12" }, drill.AgeGroups);
        Assert.Equal("battling", drill.CategoryId);
        Assert.Contains("Battling", drill.Tags);
        var plan = (await (await client.PostAsJsonAsync("/api/trainings", new TrainingRequest("Multi-age plan", Items: [new(drill.Id, 12)], AgeGroups: ["U10", "U12"]))).Content.ReadFromJsonAsync<TrainingResponse>())!;
        Assert.Equal(new[] { "U10", "U12" }, plan.AgeGroups);
        var copied = (await (await client.PostAsync($"/api/trainings/{plan.Id}/copy-to-library", null)).Content.ReadFromJsonAsync<TrainingResponse>())!;
        Assert.Equal(plan.AgeGroups, copied.AgeGroups);
        Assert.Equal(drill.AgeGroups, (await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{copied.Items[0].DrillId}"))!.AgeGroups);
        var catalog = (await client.GetFromJsonAsync<CatalogResponse>("/api/catalog"))!;
        var all = catalog.AgeGroups.Select(g => g.Id).ToList();
        var updated = await client.PutAsJsonAsync($"/api/drills/{drill.Id}", request with { AgeGroups = all });
        Assert.Equal(all, (await updated.Content.ReadFromJsonAsync<DrillResponse>())!.AgeGroups);
        updated = await client.PutAsJsonAsync($"/api/drills/{drill.Id}", request with { AgeGroups = [] });
        Assert.Empty((await updated.Content.ReadFromJsonAsync<DrillResponse>())!.AgeGroups!);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/drills/{drill.Id}", request with { AgeGroups = ["U17"] })).StatusCode);
        Assert.Equal(new[] { "U8", "U12" }, (await client.GetFromJsonAsync<DrillResponse>($"/api/drills/{copied.Items[0].DrillId}"))!.AgeGroups);
    }
}

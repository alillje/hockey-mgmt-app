using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using HockeyTrainer.Application.Contracts;
using HockeyTrainer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed partial class ApiTests
{
    [Fact]
    public async Task SearchPagesSummariesFiltersAndCountsBeforePagingWithoutDrawings()
    {
        using var app = new TestApplication(TemporaryDatabase());
        using var client = app.CreateClient();
        for (var index = 0; index < 25; index++)
        {
            var response = await client.PostAsJsonAsync("/api/drills", Drill($"Page drill {index:D2}") with
            {
                Tags = index % 2 == 0 ? ["Skating"] : ["Passing"],
                AgeGroups = index % 2 == 0 ? ["U10"] : ["U12"],
                Notes = "Searchable coaching notes"
            });
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        }
        var first = (await client.GetFromJsonAsync<ContentPageResponse>("/api/drills/search?pageSize=10"))!;
        var second = (await client.GetFromJsonAsync<ContentPageResponse>("/api/drills/search?page=2&pageSize=10"))!;
        Assert.Equal(25, first.TotalCount);
        Assert.Equal(25, first.SourceCount);
        Assert.Equal(10, second.Items.Count);
        Assert.Empty(first.Items.Select(item => item.Id).Intersect(second.Items.Select(item => item.Id)));
        Assert.Equal("Page drill 10", second.Items[0].Title);
        Assert.Equal(13, first.Categories.Single(category => category.Label == "Skating").Count);
        var filteredResponse = await client.GetAsync("/api/drills/search?tag=Skating&age=U10&search=coaching&pageSize=5");
        Assert.Equal(HttpStatusCode.OK, filteredResponse.StatusCode);
        Assert.DoesNotContain("diagram", await filteredResponse.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("notes", await filteredResponse.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
        var filtered = (await filteredResponse.Content.ReadFromJsonAsync<ContentPageResponse>())!;
        Assert.Equal(13, filtered.TotalCount);
        Assert.Equal(5, filtered.Items.Count);
        Assert.All(filtered.Items, item => Assert.Equal(new[] { "U10" }, item.AgeGroups));
        var last = (await client.GetFromJsonAsync<ContentPageResponse>("/api/drills/search?page=999&pageSize=10"))!;
        Assert.Equal(3, last.Page);
        Assert.Equal(5, last.Items.Count);
        Assert.Empty((await client.GetFromJsonAsync<ContentPageResponse>("/api/drills/search?scope=custom"))!.Items);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/drills/search?source={Guid.NewGuid()}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/drills/search?pageSize=101")).StatusCode);
        using var scope = app.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<HockeyDbContext>();
        var legacy = await database.Drills.Take(2).ToListAsync();
        legacy[0].AgeGroupsJson = JsonSerializer.Serialize(new[] { "Åkare" });
        legacy[1].AgeGroupsJson = "[\"Åkare\"]";
        await database.SaveChangesAsync();
        var legacyPage = (await client.GetFromJsonAsync<ContentPageResponse>($"/api/drills/search?age={Uri.EscapeDataString("Åkare")}"))!;
        Assert.Equal(2, legacyPage.TotalCount);
    }

    [Fact]
    public async Task PracticeDetailsLoadReferencedDrillsOnceAndPracticeSearchOmitsEntries()
    {
        using var app = new TestApplication(TemporaryDatabase());
        using var client = app.CreateClient();
        var drill = (await (await client.PostAsJsonAsync("/api/drills", Drill("Referenced"))).Content.ReadFromJsonAsync<DrillResponse>())!;
        var practice = (await (await client.PostAsJsonAsync("/api/trainings", new TrainingRequest("Plan", Items:
            [new(drill.Id, 10, "First"), new(drill.Id, 15, "Repeat")], Tags: ["Passing"], AgeGroups: ["U10"])))
            .Content.ReadFromJsonAsync<TrainingResponse>())!;
        var details = (await client.GetFromJsonAsync<PracticeDetailResponse>($"/api/trainings/{practice.Id}/details"))!;
        Assert.Equal(drill.Id, Assert.Single(details.Drills).Id);
        Assert.Equal(new[] { "First", "Repeat" }, details.Training.Items.Select(item => item.Notes));
        var response = await client.GetAsync("/api/trainings/search?age=U10&tag=Passing");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var page = (await response.Content.ReadFromJsonAsync<ContentPageResponse>())!;
        Assert.Equal(practice.Id, Assert.Single(page.Items).Id);
        Assert.Equal(1, page.TotalCount);
        Assert.DoesNotContain("drillId", await response.Content.ReadAsStringAsync());
    }
}

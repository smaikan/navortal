using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Collections;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

public sealed class NamedResourceTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Theory]
    [InlineData("projects")] [InlineData("pools")] [InlineData("categories")] [InlineData("tags")]
    public async Task EachResourceSupportsOwnedBoundedCrudArchiveAndLiteralSearch(string route)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var a = await TaskScenario.User(app); var b = await TaskScenario.User(app);
        var create = await a.Client.PostAsJsonAsync($"/api/{route}", new { name = "  Alpha  ", userId = b.UserId });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode); Assert.Contains($"/api/{route}/", create.Headers.Location!.ToString());
        var alpha = await TaskScenario.Read<NamedResourceView>(create); Assert.Equal("Alpha", alpha.Name); Assert.Equal(1, alpha.Version);
        var beta = await TaskScenario.Read<NamedResourceView>(await a.Client.PostAsJsonAsync($"/api/{route}", new { name = "Beta" }));
        var needle = await TaskScenario.Read<NamedResourceView>(await a.Client.PostAsJsonAsync($"/api/{route}", new { name = "100%_Needle" }));
        var firstResponse = await a.Client.GetAsync($"/api/{route}?limit=2"); Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);
        var first = await TaskScenario.Read<NamedResourcePage>(firstResponse); var last = await TaskScenario.Read<NamedResourcePage>(await a.Client.GetAsync($"/api/{route}?limit=2&offset=2"));
        Assert.Equal(3, first.Total); Assert.Equal(2, first.Items.Length); Assert.Single(last.Items); Assert.Empty(first.Items.Select(x => x.Id).Intersect(last.Items.Select(x => x.Id)));
        Assert.Empty((await TaskScenario.Read<NamedResourcePage>(await b.Client.GetAsync($"/api/{route}"))).Items);
        Assert.Equal(needle.Id, Assert.Single((await TaskScenario.Read<NamedResourcePage>(await a.Client.GetAsync($"/api/{route}?search=100%25_nee"))).Items).Id);
        var updated = await a.Client.PutAsJsonAsync($"/api/{route}/{beta.Id}", new { version = beta.Version, name = "Updated Beta", description = "Context" });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode); Assert.Equal(2, (await TaskScenario.Read<NamedResourceView>(updated)).Version);
        Assert.Equal(HttpStatusCode.Conflict, (await a.Client.PutAsJsonAsync($"/api/{route}/{beta.Id}", new { version = beta.Version, name = "Stale" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.Client.GetAsync($"/api/{route}/{alpha.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.Client.PutAsJsonAsync($"/api/{route}/{alpha.Id}", new { version = alpha.Version, name = "Foreign" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.Client.PostAsJsonAsync($"/api/{route}/{alpha.Id}/archive", new { version = alpha.Version })).StatusCode);
        var archived = await a.Client.PostAsJsonAsync($"/api/{route}/{alpha.Id}/archive", new { version = alpha.Version });
        Assert.Equal(HttpStatusCode.OK, archived.StatusCode); Assert.NotNull((await TaskScenario.Read<NamedResourceView>(archived)).ArchivedAt);
        Assert.Equal(2, (await TaskScenario.Read<NamedResourcePage>(await a.Client.GetAsync($"/api/{route}"))).Total);
        Assert.Equal(3, (await TaskScenario.Read<NamedResourcePage>(await a.Client.GetAsync($"/api/{route}?includeArchived=true"))).Total);
        Assert.Equal(HttpStatusCode.OK, (await a.Client.GetAsync($"/api/{route}/{alpha.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await a.Client.PostAsJsonAsync($"/api/{route}", new { name = "   " })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await a.Client.GetAsync($"/api/{route}?limit=101")).StatusCode);
        var turkish = await TaskScenario.Read<NamedResourceView>(await a.Client.PostAsJsonAsync($"/api/{route}", new { name = "Üst İş IŞIK" }));
        var unicodeSearch = await TaskScenario.Read<NamedResourcePage>(await a.Client.GetAsync($"/api/{route}?search={Uri.EscapeDataString("üst iş ışık")}"));
        Assert.Equal(turkish.Id, Assert.Single(unicodeSearch.Items).Id);
    }
    [Fact]
    public async Task ConcurrentResourceUpdatesHaveOneWinnerAndPlanningVersionIsAtomic()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var project = await TaskScenario.Read<NamedResourceView>(await s.Client.PostAsJsonAsync("/api/projects", new { name = "Project" }));
        var results = await Task.WhenAll(Enumerable.Range(0, 4).Select(i => s.Client.PutAsJsonAsync($"/api/projects/{project.Id}", new { version = 1, name = $"Edit {i}" })));
        Assert.Single(results, x => x.StatusCode == HttpStatusCode.OK); Assert.Equal(3, results.Count(x => x.StatusCode == HttpStatusCode.Conflict));
        await using var db = fixture.CreateContext();
        Assert.Equal(2, (await db.Projects.SingleAsync(x => x.Id == project.Id)).Version);
        Assert.Equal(2, (await db.PlanningStates.SingleAsync(x => x.UserId == s.UserId)).PlanningVersion);
    }
}

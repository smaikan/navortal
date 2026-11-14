using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Collections;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

public sealed class CollectionHierarchyTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static async Task<T> Get<T>(TaskScenario s, string path)
    {
        var response = await s.Client.GetAsync(path); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await TaskScenario.Read<T>(response);
    }
    private static void Assign(TaskItem task, string kind, Guid id)
    {
        if (kind == "projects") task.ProjectId = id;
        else if (kind == "pools") task.PoolId = id;
        else task.CategoryId = id;
    }
    [Theory]
    [InlineData("projects")] [InlineData("pools")] [InlineData("categories")]
    public async Task HierarchyCountsLeavesAndRemovesInheritedBranchWithoutChangingOtherLinks(string kind)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var resource = await TaskScenario.Read<NamedResourceView>(await s.Client.PostAsJsonAsync($"/api/{kind}", new { name = kind }));
        var ancestor = await s.Root("Üst bağlam"); var branch = await s.Child(ancestor.Id, "Bağlı ana görev");
        var first = await s.Child(branch.Id, "İlk alt"); var second = await s.Child(branch.Id, "İkinci alt");
        var unrelated = await s.Child(ancestor.Id, "Bölüm dışında kardeş");
        var links = new Dictionary<string, Guid>();
        foreach (var other in new[] { "projects", "pools", "categories", "tags" }.Where(x => x != kind))
            links[other] = (await TaskScenario.Read<NamedResourceView>(await s.Client.PostAsJsonAsync($"/api/{other}", new { name = other }))).Id;
        await using (var db = fixture.CreateContext())
        {
            Assign(await db.Tasks.SingleAsync(x => x.Id == branch.Id), kind, resource.Id);
            var child = await db.Tasks.SingleAsync(x => x.Id == first.Id);
            foreach (var link in links.Where(x => x.Key != "tags")) Assign(child, link.Key, link.Value);
            db.TaskTagLinks.Add(new() { UserId = s.UserId, TaskId = first.Id, TagId = links["tags"] });
            await db.SaveChangesAsync();
        }
        async Task Check(int count)
        {
            var summary = Assert.Single((await Get<NamedResourcePage>(s, $"/api/{kind}?includeSummary=true")).Summaries!);
            var workload = await Get<NamedResourceWorkload>(s, $"/api/{kind}/{resource.Id}/workload");
            Assert.Equal(count, summary.TaskCount); Assert.Equal(count, workload.Values.TaskCount);
            Assert.Equal(count, (await Get<ResourceTaskTreePage>(s, $"/api/{kind}/{resource.Id}/task-tree")).TaskCount);
        }
        await Check(2);
        var tree = await Get<ResourceTaskTreePage>(s, $"/api/{kind}/{resource.Id}/task-tree");
        Assert.Equal(ancestor.Id, Assert.Single(tree.Roots).Id); Assert.Equal(new[] { ancestor.Id }, tree.ContextTaskIds);
        Assert.Equal(4, tree.Nodes.Length); Assert.DoesNotContain(tree.Nodes, x => x.Id == unrelated.Id);
        await s.State(second.Id, TaskAction.Complete);
        Assert.Equal(1, Assert.Single((await Get<NamedResourcePage>(s, $"/api/{kind}?includeSummary=true")).Summaries!).CompletedCount);
        var before = await Get<ClassificationView>(s, $"/api/tasks/{first.Id}/classification");
        var body = new { version = before.Version, expectedPlanningVersion = before.PlanningVersion, detachKind = kind, detachResourceId = resource.Id };
        var removed = await s.Client.PutAsJsonAsync($"/api/tasks/{first.Id}/classification", body);
        Assert.Equal(HttpStatusCode.OK, removed.StatusCode);
        var after = await TaskScenario.Read<ClassificationView>(removed);
        Assert.Equal(System.Text.Json.JsonSerializer.Serialize(before.Values), System.Text.Json.JsonSerializer.Serialize(after.Values)); // Seçili bağ zaten null: kalıcı ayrılma işareti gerekir.
        Assert.True(after.Version > before.Version); await Check(1);
        tree = await Get<ResourceTaskTreePage>(s, $"/api/{kind}/{resource.Id}/task-tree");
        Assert.DoesNotContain(tree.Nodes, x => x.Id == first.Id);
        Assert.Contains(tree.Nodes, x => x.Id == branch.Id); Assert.Contains(tree.Nodes, x => x.Id == second.Id);
        Assert.Equal(HttpStatusCode.Conflict, (await s.Client.PutAsJsonAsync($"/api/tasks/{first.Id}/classification", body)).StatusCode);
        var stranger = await TaskScenario.User(app);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.Client.PutAsJsonAsync($"/api/tasks/{branch.Id}/classification", body)).StatusCode);
        // Ana görevi çıkarmak dalı temizler; görevleri silmez ve diğer bağları korur.
        var parent = await Get<ClassificationView>(s, $"/api/tasks/{branch.Id}/classification");
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync($"/api/tasks/{branch.Id}/classification", new {
            version = parent.Version, expectedPlanningVersion = parent.PlanningVersion, detachKind = kind, detachResourceId = resource.Id
        })).StatusCode);
        Assert.Empty((await Get<ResourceTaskTreePage>(s, $"/api/{kind}/{resource.Id}/task-tree")).Nodes);
        // Ana görevi yeniden eklemek dalı geri getirir; tek başına çıkarılmış çocuk çıkmış kalır.
        var current = await Get<ClassificationView>(s, $"/api/tasks/{branch.Id}/classification");
        var values = new Dictionary<string, object?> { ["version"] = current.Version, ["projectId"] = current.Values.ProjectId,
            ["poolId"] = current.Values.PoolId, ["categoryId"] = current.Values.CategoryId, ["tagIds"] = current.Values.TagIds };
        values[kind == "projects" ? "projectId" : kind == "pools" ? "poolId" : "categoryId"] = resource.Id;
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync($"/api/tasks/{branch.Id}/classification", values)).StatusCode);
        await Check(1);
        var restored = await Get<ResourceTaskTreePage>(s, $"/api/{kind}/{resource.Id}/task-tree");
        Assert.Contains(restored.Nodes, x => x.Id == second.Id); Assert.DoesNotContain(restored.Nodes, x => x.Id == first.Id);
        await using var verify = fixture.CreateContext();
        Assert.Equal(5, await verify.Tasks.CountAsync(x => x.UserId == s.UserId));
        var persisted = await Get<ClassificationView>(s, $"/api/tasks/{first.Id}/classification");
        Assert.Equal(System.Text.Json.JsonSerializer.Serialize(after.Values), System.Text.Json.JsonSerializer.Serialize(persisted.Values));
    }
}

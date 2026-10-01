using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Collections;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;

namespace Adhd.IntegrationTests;

public sealed class TaskFoundationMilestoneTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Fact]
    public async Task ThreeChildrenOneWithTwoLeavesCombinePoolProjectEstimatesProgressAndDependency()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var project = await TaskScenario.Read<NamedResourceView>(await s.Client.PostAsJsonAsync("/api/projects", new { name = "Small project" }));
        var pool = await TaskScenario.Read<NamedResourceView>(await s.Client.PostAsJsonAsync("/api/pools", new { name = "This week" }));
        var root = await s.Root("Three steps"); var context = await TaskScenario.Read<ClassificationView>(await s.Client.GetAsync($"/api/tasks/{root.Id}/classification"));
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync($"/api/tasks/{root.Id}/classification", new { version = context.Version, projectId = project.Id, poolId = pool.Id })).StatusCode);
        var a = await s.Child(root.Id, "A"); var branch = await s.Child(root.Id, "B"); var c = await s.Child(root.Id, "C");
        var b1 = await s.Child(branch.Id, "B1"); var b2 = await s.Child(branch.Id, "B2");
        foreach (var (id, minutes) in new[] { (a.Id, 20), (b1.Id, 15), (b2.Id, 20), (c.Id, 30) }) await s.Define(id, true, minutes * 60);
        var summary = await TaskScenario.Read<WorkloadSummary>(await s.Client.GetAsync($"/api/tasks/{root.Id}/workload"));
        Assert.Equal(85 * 60, summary.CalculatedTotalSeconds);
        Assert.Equal(85 * 60, (await TaskScenario.Read<NamedResourceWorkload>(await s.Client.GetAsync($"/api/projects/{project.Id}/workload"))).Values.CalculatedTotalSeconds);
        c = await s.Get(c.Id);
        Assert.Equal(HttpStatusCode.Created, (await s.Client.PostAsJsonAsync($"/api/tasks/{c.Id}/dependencies", new { version = c.Version, predecessorTaskId = a.Id })).StatusCode);
        Assert.False((await TaskScenario.Read<TaskStartDecision>(await s.Client.GetAsync($"/api/tasks/{c.Id}/start-eligibility"))).CanStart);
        await s.State(b1.Id, TaskAction.Complete); await s.State(b2.Id, TaskAction.Complete);
        Assert.Equal(CompletionOrigin.Automatic, (await s.Get(branch.Id)).CompletionOrigin);
        var progress = await TaskScenario.Read<TaskProgress>(await s.Client.GetAsync($"/api/tasks/{root.Id}/progress"));
        Assert.Equal(.5, progress.CountProgress); Assert.Equal(35d / 85d, progress.DurationProgress!.Value, 8);
        await s.State(a.Id, TaskAction.Complete);
        Assert.True((await TaskScenario.Read<TaskStartDecision>(await s.Client.GetAsync($"/api/tasks/{c.Id}/start-eligibility"))).CanStart);
        await s.State(c.Id, TaskAction.Complete); root = await s.Get(root.Id);
        Assert.Equal(CompletionOrigin.Automatic, root.CompletionOrigin); Assert.Equal(TaskState.Completed, root.State);
        var page = await TaskScenario.Read<TaskPage>(await s.Client.GetAsync($"/api/tasks?poolId={pool.Id}"));
        Assert.Equal(6, page.Total); Assert.Equal(6, page.Items.Select(x => x.Id).Distinct().Count());
        Assert.All(page.Items, task => Assert.Equal(project.Id, task.ProjectId));
    }
}

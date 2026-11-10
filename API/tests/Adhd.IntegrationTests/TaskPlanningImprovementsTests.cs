using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Analytics;
using Adhd.Application.Collections;
using Adhd.Application.Planning;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using static Adhd.IntegrationTests.ManualPlanningTests;
namespace Adhd.IntegrationTests;
public sealed class TaskPlanningImprovementsTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateOnly Date = new(2026,10,15);
    private static async Task<PlanEntryResult> Add(TaskScenario s, Guid task, string scope="Subtree", string? key=null)
    {
        var day=await Day(s,Date);
        var response=await Send(s,HttpMethod.Post,$"/api/daily-plans/{Date:yyyy-MM-dd}/entries",new {taskId=task,scope,expectedPlanningVersion=day.PlanningVersion},key);
        Assert.True(response.IsSuccessStatusCode,await response.Content.ReadAsStringAsync()); return await TaskScenario.Read<PlanEntryResult>(response);
    }
    private static Task<DayItemPage> Items(TaskScenario s)=>Read<DayItemPage>(s,$"/api/daily-plans/{Date:yyyy-MM-dd}/items?limit=100");
    private static async Task<T> Read<T>(TaskScenario s,string path) {var response=await s.Client.GetAsync(path); Assert.True(response.IsSuccessStatusCode,await response.Content.ReadAsStringAsync());return await TaskScenario.Read<T>(response);}
    [Fact] public async Task AddingRootRetainsExistingChildIdentityTimeAndUndoRestoresSingleMembership()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);var s=await TaskScenario.User(app);
        var root=await s.Root("Parent");var a=await s.Child(root.Id,"Child A");var b=await s.Child(root.Id,"Child B");
        var single=await Add(s,a.Id,"Single");var day=await Day(s,Date);
        var start=new DateTimeOffset(2026,10,15,9,0,0,TimeSpan.Zero);
        var timed=await TaskScenario.Read<DayItemView>(await s.Client.PutAsJsonAsync($"/api/day-items/{single.Item.Id}/time",new {version=single.Item.Version,expectedPlanningVersion=day.PlanningVersion,startsAt=start}));
        var group=await Add(s,root.Id);var items=await Items(s);Assert.Equal(3,items.Total);Assert.Single(items.Groups!);
        var retained=Assert.Single(items.Items,x=>x.TaskId==a.Id);Assert.Equal(single.Item.Id,retained.Id);Assert.Equal(start,retained.StartsAt);Assert.Equal(root.Id,retained.GroupTaskId);
        Assert.Single(items.Items,x=>x.TaskId==b.Id);
        var undo=await s.Client.PostAsJsonAsync("/api/day-items/undo",new {changeSetId=group.Item.ChangeSetId,expectedPlanningVersion=group.Item.PlanningVersion});Assert.True(undo.IsSuccessStatusCode,await undo.Content.ReadAsStringAsync());
        var restored=await Items(s);Assert.Single(restored.Items);Assert.Empty(restored.Groups!);Assert.Equal(single.Item.Id,restored.Items[0].Id);Assert.Equal(start,restored.Items[0].StartsAt);
    }
    [Fact] public async Task GroupRepeatedSelectionIsIdempotentAndNewChildrenAreAddedOnlyOnce()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);var s=await TaskScenario.User(app);var root=await s.Root();await s.Child(root.Id);
        await Add(s,root.Id);await Add(s,root.Id);Assert.Equal(2,(await Items(s)).Total);
        await s.Child(root.Id,"New child");await Add(s,root.Id);Assert.Equal(3,(await Items(s)).Total);
        var outsider=await TaskScenario.User(app);var day=await Day(outsider,Date);var response=await Send(outsider,HttpMethod.Post,$"/api/daily-plans/{Date:yyyy-MM-dd}/entries",new {taskId=root.Id,scope="Subtree",expectedPlanningVersion=day.PlanningVersion});Assert.Equal(HttpStatusCode.NotFound,response.StatusCode);
    }
    [Fact] public async Task SingleIntermediateSelectionDoesNotAddItsDescendantsAndPickerPagesWholeRoots()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);var s=await TaskScenario.User(app);var root=await s.Root("Root");var child=await s.Child(root.Id,"Child");await s.Child(child.Id,"Grandchild");
        await Add(s,child.Id,"Single");Assert.Single((await Items(s)).Items);
        var picker=await Read<TaskPickerView>(s,"/api/tasks/picker?hierarchy=true&limit=1");var row=Assert.Single(picker.Other.Items);Assert.Equal(root.Id,row.Id);Assert.Single(row.Children!);Assert.Single(row.Children![0].Children!);
    }
    [Fact] public async Task ParentTimerWorksAndCompletingPlanRootCompletesDescendantsAndClosesTimer()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);var s=await TaskScenario.User(app);var root=await s.Root();var child=await s.Child(root.Id);Assert.False((await s.Get(root.Id)).HasDirectWork);
        var group=await Add(s,root.Id);var work=await WorkSessionTests.Started(s,root.Id);app.Clock.Now=app.Clock.Now.AddMinutes(3);
        var response=await s.Client.PostAsJsonAsync($"/api/day-items/{group.Item.Id}/complete",new {version=group.Item.Version,completeTask=true});Assert.True(response.IsSuccessStatusCode,await response.Content.ReadAsStringAsync());
        Assert.Equal(TaskState.Completed,(await s.Get(root.Id)).State);Assert.Equal(TaskState.Completed,(await s.Get(child.Id)).State);Assert.All((await Items(s)).Items,i=>Assert.NotNull(i.CompletedAt));
        var ended=await Read<Adhd.Application.Work.WorkView>(s,$"/api/work-sessions/{work.Id}");Assert.NotEqual(Adhd.Domain.Work.WorkState.Running,ended.State);
    }
    [Fact] public async Task CollectionPagesRootsAndShowsChildrenWithoutReclassifyingThem()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);var s=await TaskScenario.User(app);var root=await s.Root();var child=await s.Child(root.Id);
        var project=await TaskScenario.Read<NamedResourceView>(await s.Client.PostAsJsonAsync("/api/projects",new {name="Project"}));
        var classification=await Read<ClassificationView>(s,$"/api/tasks/{root.Id}/classification");Assert.True((await s.Client.PutAsJsonAsync($"/api/tasks/{root.Id}/classification",new {version=classification.Version,expectedPlanningVersion=classification.PlanningVersion,projectId=project.Id,tagIds=Array.Empty<Guid>(),applyToSubtree=false})).IsSuccessStatusCode);
        var tree=await Read<ResourceTaskTreePage>(s,$"/api/projects/{project.Id}/task-tree?limit=1");Assert.Equal(root.Id,Assert.Single(tree.Roots).Id);Assert.Equal(2,tree.Nodes.Length);Assert.Null((await s.Get(child.Id)).ProjectId);
    }
    [Fact] public async Task UntimedCompletedEstimateUsesCompletionSnapshotAndDoesNotInventWork()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=new(2026,10,15,9,0,0,TimeSpan.Zero);var s=await TaskScenario.User(app);var task=await s.Root("Completed estimate");await s.Define(task.Id,true,1800);await s.State(task.Id,TaskAction.Complete);
        await s.Define(task.Id,true,3600);
        var report=await Read<ActualAnalyticsView>(s,"/api/analytics/actual?fromDate=2026-10-15&toDate=2026-10-15");Assert.Equal(0,report.Totals.WorkSeconds);Assert.Equal(1800,report.Totals.EstimatedCompletedSeconds);Assert.Equal(0,report.Totals.SessionCount);
        var breakdown=await Read<ActualBreakdownPage>(s,"/api/analytics/actual/breakdown?fromDate=2026-10-15&toDate=2026-10-15&dimension=Task");Assert.Equal(1800,Assert.Single(breakdown.Items).EstimatedCompletedSeconds);
        await s.State(task.Id,TaskAction.Reopen);report=await Read<ActualAnalyticsView>(s,"/api/analytics/actual?fromDate=2026-10-15&toDate=2026-10-15");Assert.Equal(0,report.Totals.EstimatedCompletedSeconds);
    }

    [Fact] public async Task ScheduledChildrenKeepAllBlocksAndDoNotAcquireUntimedDuplicates()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);var s=await TaskScenario.User(app);var root=await s.Root();var child=await s.Child(root.Id);await s.Define(child.Id,true,1800);
        var start=new DateTimeOffset(2026,10,15,6,0,0,TimeSpan.Zero);
        var first=await Create(s,child.Id,start,start.AddMinutes(10));var second=await Create(s,child.Id,start.AddMinutes(20),start.AddMinutes(30));
        await Add(s,root.Id);var page=await Items(s);Assert.Single(page.Items);Assert.Equal(root.Id,page.Items[0].TaskId);Assert.Equal(2,Assert.Single(page.Groups!).Members.Length);
        var blocks=await Read<SchedulePage>(s,"/api/schedules?from=2026-10-15T00:00:00Z&to=2026-10-16T00:00:00Z");Assert.Equal(2,blocks.Total);Assert.All(blocks.Items,b=>Assert.Equal(child.Id,b.TaskId));
    }
    [Fact] public async Task MeasuredWorkExcludesTheEstimatedFallbackInsteadOfCountingBoth()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=new(2026,10,15,9,0,0,TimeSpan.Zero);var s=await TaskScenario.User(app);var task=await s.Root();await s.Define(task.Id,true,1800);
        var work=await WorkSessionTests.Started(s,task.Id);app.Clock.Now=app.Clock.Now.AddSeconds(90);await WorkSessionTests.Change(s,work,"finish");await s.State(task.Id,TaskAction.Complete);
        var report=await Read<ActualAnalyticsView>(s,"/api/analytics/actual?fromDate=2026-10-15&toDate=2026-10-15");Assert.Equal(90,report.Totals.WorkSeconds);Assert.Equal(0,report.Totals.EstimatedCompletedSeconds);
    }
    [Fact] public async Task CompletionClassificationNamesStayHistoricalAfterRenaming()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=new(2026,10,15,9,0,0,TimeSpan.Zero);var s=await TaskScenario.User(app);var task=await s.Root();await s.Define(task.Id,true,600);
        var project=await TaskScenario.Read<NamedResourceView>(await s.Client.PostAsJsonAsync("/api/projects",new{name="Original project"}));var c=await Read<ClassificationView>(s,$"/api/tasks/{task.Id}/classification");
        Assert.True((await s.Client.PutAsJsonAsync($"/api/tasks/{task.Id}/classification",new {version=c.Version,expectedPlanningVersion=c.PlanningVersion,projectId=project.Id,tagIds=Array.Empty<Guid>()})).IsSuccessStatusCode);
        await s.State(task.Id,TaskAction.Complete);Assert.True((await s.Client.PutAsJsonAsync($"/api/projects/{project.Id}",new{version=project.Version,name="Renamed project"})).IsSuccessStatusCode);
        var report=await Read<ActualBreakdownPage>(s,"/api/analytics/actual/breakdown?fromDate=2026-10-15&toDate=2026-10-15&dimension=Project");var item=Assert.Single(report.Items);Assert.Equal("Original project",item.Label);Assert.Equal(600,item.EstimatedCompletedSeconds);
    }

    [Fact] public async Task CompletingTimedContainerRootKeepsItsBlockVisibleAndCompletesUntimedChildren()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=new(2026,10,15,6,0,0,TimeSpan.Zero);var s=await TaskScenario.User(app);var root=await s.Root();await s.Child(root.Id);await Add(s,root.Id);
        var result=await Create(s,root.Id,app.Clock.Now.AddHours(1),app.Clock.Now.AddHours(2));var block=Assert.Single(result.Schedules);var before=await Day(s,Date);
        var response=await s.Client.PostAsJsonAsync($"/api/schedules/{block.Id}/complete",new{version=block.Version,completeTask=true});Assert.True(response.IsSuccessStatusCode,await response.Content.ReadAsStringAsync());
        var blocks=await Read<SchedulePage>(s,"/api/schedules?from=2026-10-15T00:00:00Z&to=2026-10-16T00:00:00Z");Assert.NotNull(Assert.Single(blocks.Items).CompletedAt);Assert.All((await Items(s)).Items,x=>Assert.NotNull(x.CompletedAt));Assert.True((await Day(s,Date)).PlanningVersion>before.PlanningVersion);
    }
}

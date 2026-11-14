using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Planning;
using Adhd.Application.Work;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;

public sealed class PlanGroupRemovalTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateOnly Date = new(2026, 10, 15);
    private static readonly DateTimeOffset Start = new(2026, 10, 15, 7, 0, 0, TimeSpan.Zero);

    private static async Task<T> Read<T>(TaskScenario s, string path)
    {
        var response = await s.Client.GetAsync(path);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return await TaskScenario.Read<T>(response);
    }

    private static Task<DayItemPage> Items(TaskScenario s, DateOnly? date = null) =>
        Read<DayItemPage>(s, $"/api/daily-plans/{date ?? Date:yyyy-MM-dd}/items?limit=100");

    private static async Task<DayItemView> Add(TaskScenario s, Guid taskId, string scope = "Subtree", DateOnly? date = null)
    {
        var day = await Day(s, date ?? Date);
        var response = await Send(s, HttpMethod.Post, $"/api/daily-plans/{day.LocalDate:yyyy-MM-dd}/entries",
            new { taskId, scope, expectedPlanningVersion = day.PlanningVersion });
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await TaskScenario.Read<PlanEntryResult>(response)).Item;
    }

    private static async Task<DayItemView> Remove(TaskScenario s, DayItemView item)
    {
        // Also cover old clients that sent this irrelevant flag on removal.
        var response = await s.Client.PostAsJsonAsync($"/api/day-items/{item.Id}/remove",
            new { version = item.Version, completeTask = true });
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return await TaskScenario.Read<DayItemView>(response);
    }

    private static async Task<DayItemBatchResult> Undo(TaskScenario s, Guid changeSetId)
    {
        var day = await Day(s, Date);
        var response = await s.Client.PostAsJsonAsync("/api/day-items/undo",
            new { changeSetId, expectedPlanningVersion = day.PlanningVersion });
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return await TaskScenario.Read<DayItemBatchResult>(response);
    }

    private static async Task<ScheduleView> Timed(TaskScenario s, DayItemView item, int hour, bool isFixed = false)
    {
        var day = await Day(s, Date);
        var response = await Send(s, HttpMethod.Post, "/api/schedules", new
        {
            localDate = Date, taskId = item.TaskId, kind = "Work", startsAt = Start.AddHours(hour),
            endsAt = Start.AddHours(hour).AddMinutes(20), dayItemId = item.Id, dayItemVersion = item.Version,
            expectedPlanningVersion = day.PlanningVersion, isFixed
        });
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return Assert.Single((await TaskScenario.Read<PlanMutation>(response)).Schedules);
    }

    [Fact]
    public async Task RemovingRootRemovesSavedDescendantsOnlyAndUndoRestoresIdentities()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var s = await TaskScenario.User(app);
        var root = await s.Root(); var child = await s.Child(root.Id); var grandchild = await s.Child(child.Id);
        await Add(s, child.Id, "Single"); var group = await Add(s, root.Id);
        var original = await Items(s);
        var other = await s.Root("Unrelated"); await Add(s, other.Id, "Single");
        var late = await s.Child(root.Id, "Outside the saved group"); await Add(s, late.Id, "Single");
        var tomorrow = Date.AddDays(1); await Add(s, root.Id, date: tomorrow);

        var removed = await Remove(s, group);
        var remaining = await Items(s);
        Assert.Equal(new[] { other.Id, late.Id }.Order(), remaining.Items.Select(x => x.TaskId).Order());
        Assert.Empty(remaining.Groups!);
        Assert.Equal(4, (await Items(s, tomorrow)).Total);
        foreach (var task in new[] { root, child, grandchild, late }) Assert.Equal(TaskState.Pending, (await s.Get(task.Id)).State);

        await Undo(s, removed.ChangeSetId!.Value);
        var restored = await Items(s);
        foreach (var item in original.Items)
        {
            var back = Assert.Single(restored.Items, x => x.Id == item.Id);
            Assert.Equal(item.SortOrder, back.SortOrder); Assert.Equal(item.GroupTaskId, back.GroupTaskId);
            Assert.Equal(item.GroupParentTaskId, back.GroupParentTaskId);
        }
        Assert.Single(restored.Groups!);
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(false, true)]
    [InlineData(true, false)]
    [InlineData(true, true)]
    public async Task GroupRemovalAndUndoIncludeTimedMembersAndPreserveRunningWork(bool timedRoot, bool timedChild)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        app.Clock.Now = Start;
        var s = await TaskScenario.User(app);
        var root = await s.Root(); var child = await s.Child(root.Id); await s.Child(root.Id, "Other child");
        var group = await Add(s, root.Id); var original = await Items(s);
        var blocks = new List<ScheduleView>();
        ScheduleView? rootBlock = null;
        if (timedRoot) { rootBlock = await Timed(s, group, 1); blocks.Add(rootBlock); }
        if (timedChild)
        {
            blocks.Add(await Timed(s, Assert.Single(original.Items, x => x.TaskId == child.Id), 2));
            blocks.Add(Assert.Single((await Create(s, child.Id, Start.AddHours(3), Start.AddHours(3).AddMinutes(20))).Schedules));
        }
        var work = await WorkSessionTests.Started(s, child.Id);
        Guid changeSet;
        if (rootBlock is not null)
        {
            var response = await Change(s, rootBlock, remove: true);
            Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
            changeSet = (await TaskScenario.Read<PlanMutation>(response)).ChangeSetId;
        }
        else changeSet = (await Remove(s, group)).ChangeSetId!.Value;

        Assert.Empty((await Items(s)).Items); Assert.Empty((await Items(s)).Groups!);
        foreach (var block in blocks) Assert.Equal(ScheduleState.Removed, (await Read<ScheduleView>(s, $"/api/schedules/{block.Id}")).State);
        var revision = await Read<RevisionView>(s, $"/api/plan-revisions/{(await Day(s, Date)).CurrentRevisionId}");
        Assert.Equal("DayGroup", revision.Trigger);
        Assert.Equal(WorkState.Running, (await Read<WorkView>(s, $"/api/work-sessions/{work.Id}")).State);

        await Undo(s, changeSet);
        foreach (var block in blocks)
        {
            var back = await Read<ScheduleView>(s, $"/api/schedules/{block.Id}");
            Assert.Equal(ScheduleState.Planned, back.State); Assert.Equal(block.StartsAt, back.StartsAt); Assert.Equal(block.EndsAt, back.EndsAt);
        }
        var restored = await Items(s);
        Assert.Equal(3, Assert.Single(restored.Groups!).Members.Length);
        Assert.Equal(WorkState.Running, (await Read<WorkView>(s, $"/api/work-sessions/{work.Id}")).State);
        var repeated = await s.Client.PostAsJsonAsync("/api/day-items/undo", new { changeSetId = changeSet, expectedPlanningVersion = (await Day(s, Date)).PlanningVersion });
        Assert.Equal(HttpStatusCode.Conflict, repeated.StatusCode);
    }

    [Fact]
    public async Task RemovingNestedParentKeepsItsParentAndSibling()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var s = await TaskScenario.User(app); var root = await s.Root(); var branch = await s.Child(root.Id);
        var leaf = await s.Child(branch.Id); var sibling = await s.Child(root.Id, "Sibling");
        await Add(s, root.Id); var branchItem = Assert.Single((await Items(s)).Items, x => x.TaskId == branch.Id);
        var removed = await Remove(s, branchItem);
        Assert.Equal(new[] { root.Id, sibling.Id }.Order(), (await Items(s)).Items.Select(x => x.TaskId).Order());
        Assert.Equal(TaskState.Pending, (await s.Get(leaf.Id)).State);
        await Undo(s, removed.ChangeSetId!.Value); Assert.Equal(4, (await Items(s)).Total);
    }

    [Fact]
    public async Task RemovingOneLeafBlockDoesNotRemoveAnotherBlockOrItsParent()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var s = await TaskScenario.User(app); var root = await s.Root(); var leaf = await s.Child(root.Id);
        await Add(s, root.Id); var leafItem = Assert.Single((await Items(s)).Items, x => x.TaskId == leaf.Id);
        var first = await Timed(s, leafItem, 1);
        var second = Assert.Single((await Create(s, leaf.Id, Start.AddHours(2), Start.AddHours(2).AddMinutes(20))).Schedules);
        Assert.Equal(HttpStatusCode.OK, (await Change(s, first, remove: true)).StatusCode);
        Assert.Equal(ScheduleState.Planned, (await Read<ScheduleView>(s, $"/api/schedules/{second.Id}")).State);
        Assert.Single((await Items(s)).Items, x => x.TaskId == root.Id);
    }

    [Fact]
    public async Task ProtectedMemberRejectsWholeRemovalWithoutPartialChanges()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var s = await TaskScenario.User(app); var root = await s.Root(); var child = await s.Child(root.Id);
        var group = await Add(s, root.Id); var childItem = Assert.Single((await Items(s)).Items, x => x.TaskId == child.Id);
        var block = await Timed(s, childItem, 1, isFixed: true); var day = await Day(s, Date);
        var response = await s.Client.PostAsJsonAsync($"/api/day-items/{group.Id}/remove", new { version = group.Version });
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(day.PlanningVersion, (await Day(s, Date)).PlanningVersion);
        Assert.Single((await Items(s)).Items, x => x.TaskId == root.Id);
        Assert.Equal(ScheduleState.Planned, (await Read<ScheduleView>(s, $"/api/schedules/{block.Id}")).State);
    }

    [Fact]
    public async Task ForeignAndStaleRemovalLeaveWholeGroupIntact()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var s = await TaskScenario.User(app); var root = await s.Root(); await s.Child(root.Id);
        var group = await Add(s, root.Id); var foreign = await TaskScenario.User(app);
        var denied = await foreign.Client.PostAsJsonAsync($"/api/day-items/{group.Id}/remove", new { version = group.Version });
        Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
        var stale = await s.Client.PostAsJsonAsync($"/api/day-items/{group.Id}/remove", new { version = group.Version + 1 });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal(2, (await Items(s)).Total);
    }
}

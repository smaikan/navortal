using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Tasks;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

// Yumuşak sil/geri al, görev bazlı otomatik bitirme ve bitmişleri sıralama kontrolleri.
public sealed class UiR2TaskTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);

    private static Task<HttpResponseMessage> Post(TaskScenario s, string path, object body) => s.Client.PostAsJsonAsync(path, body);
    private static async Task<TaskView> Delete(TaskScenario s, Guid id)
    {
        var task = await s.Get(id); var response = await Post(s, $"/api/tasks/{id}/delete", new { version = task.Version });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); return await TaskScenario.Read<TaskView>(response);
    }
    private static async Task<HttpResponseMessage> Restore(TaskScenario s, Guid id) => await Post(s, $"/api/tasks/{id}/restore", new { version = (await s.Get(id)).Version });
    private static async Task<HttpResponseMessage> Auto(TaskScenario s, Guid id, bool enabled) =>
        await s.Client.PutAsJsonAsync($"/api/tasks/{id}/auto-complete", new { version = (await s.Get(id)).Version, autoCompleteFromChildren = enabled });

    [Fact]
    public async Task AutoCompleteSwitchGatesAutomaticCompletionAndTurningItOnReconcilesAtOnce()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var root = await s.Root(); var a = await s.Child(root.Id); var b = await s.Child(root.Id);
        Assert.True((await s.Get(root.Id)).AutoCompleteFromChildren);
        Assert.Equal(HttpStatusCode.OK, (await Auto(s, root.Id, false)).StatusCode);
        await s.State(a.Id, TaskAction.Complete); await s.State(b.Id, TaskAction.Complete);
        root = await s.Get(root.Id); Assert.Equal(TaskState.Pending, root.State); Assert.False(root.AutoCompleteFromChildren);
        var on = await TaskScenario.Read<TaskView>(await Auto(s, root.Id, true));
        Assert.Equal(TaskState.Completed, on.State); Assert.Equal(CompletionOrigin.Automatic, on.CompletionOrigin);
        // Ayar sonradan kapansa da daha önce biten üst görevi açma.
        var off = await TaskScenario.Read<TaskView>(await Auto(s, root.Id, false));
        Assert.Equal(TaskState.Completed, off.State);
        // Yeni üst görevde ayar açık gelir. Çocukları bitince o da biter
        var other = await s.Root(); var c = await s.Child(other.Id); await s.State(c.Id, TaskAction.Complete);
        Assert.Equal(TaskState.Completed, (await s.Get(other.Id)).State);
    }

    [Fact]
    public async Task AutoCompleteSwitchIsOwnerScopedVersionCheckedAndValidated()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var a = await TaskScenario.User(app); var b = await TaskScenario.User(app);
        var task = await a.Root();
        Assert.Equal(HttpStatusCode.NotFound, (await b.Client.PutAsJsonAsync($"/api/tasks/{task.Id}/auto-complete", new { version = task.Version, autoCompleteFromChildren = false })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await a.Client.PutAsJsonAsync($"/api/tasks/{task.Id}/auto-complete", new { version = task.Version })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await a.Client.PutAsJsonAsync($"/api/tasks/{task.Id}/auto-complete", new { version = task.Version, autoCompleteFromChildren = false })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await a.Client.PutAsJsonAsync($"/api/tasks/{task.Id}/auto-complete", new { version = task.Version, autoCompleteFromChildren = true })).StatusCode);
    }

    [Fact]
    public async Task DeleteRemovesTheSubtreeEverywhereClosesWorkAndFuturePlanAndRestoreBringsTheSameBatchBack()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var root = await s.Root("Root"); var child = await s.Child(root.Id, "Child"); var grand = await s.Child(child.Id, "Grand");
        await s.Define(grand.Id, true, 1800);
        var planned = await ManualPlanningTests.Create(s, grand.Id, Morning.AddHours(2), Morning.AddHours(3));
        var started = await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/work-sessions/start", new { taskId = grand.Id });
        Assert.True(started.IsSuccessStatusCode, await started.Content.ReadAsStringAsync());
        app.Clock.Now = Morning.AddMinutes(10);

        var deleted = await Delete(s, child.Id);
        Assert.NotNull(deleted.ArchivedAt);
        var list = await TaskScenario.Read<TaskPage>(await s.Client.GetAsync("/api/tasks?limit=100&includeArchived=true"));
        Assert.Equal([root.Id], list.Items.Select(x => x.Id).ToArray());
        var children = await (await s.Client.GetAsync($"/api/tasks/children?parentId={root.Id}&includeArchived=true")).Content.ReadAsStringAsync();
        Assert.DoesNotContain(child.Id.ToString(), children);
        await using (var db = fixture.CreateContext())
        {
            var rows = await db.Tasks.AsNoTracking().Where(x => x.UserId == s.UserId && x.DeletedAt != null).ToArrayAsync();
            Assert.Equal(2, rows.Length); Assert.Single(rows.Select(x => x.DeletedAt).Distinct());
            Assert.All(rows, x => Assert.Equal(x.DeletedAt, x.ArchivedAt));
            Assert.Equal(WorkState.Finished, (await db.WorkSessions.AsNoTracking().SingleAsync(x => x.UserId == s.UserId)).State);
            var block = await db.TaskSchedules.AsNoTracking().SingleAsync(x => x.Id == planned.Schedules[0].Id);
            Assert.Equal(ScheduleState.Removed, block.State);
            Assert.Contains(await db.TaskEvents.AsNoTracking().Where(x => x.TaskId == grand.Id).Select(x => x.Type).ToArrayAsync(), x => x == "Deleted");
        }
        // Aynı silme tekrarlanabilir. Eski sürümle yeni yazı kabul edilmez.
        Assert.Equal(HttpStatusCode.OK, (await Post(s, $"/api/tasks/{child.Id}/delete", new { version = deleted.Version })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Post(s, $"/api/tasks/{child.Id}/delete", new { version = child.Version })).StatusCode);

        var restored = await Restore(s, child.Id);
        Assert.Equal(HttpStatusCode.OK, restored.StatusCode);
        list = await TaskScenario.Read<TaskPage>(await s.Client.GetAsync("/api/tasks?limit=100"));
        Assert.Equal(3, list.Total);
        Assert.Null((await s.Get(grand.Id)).ArchivedAt);
        Assert.Equal(HttpStatusCode.Conflict, (await Restore(s, child.Id)).StatusCode);
    }

    [Fact]
    public async Task DeletingTheLastOpenChildReconcilesTheParentAndRestoringItReopensAnAutomaticParent()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var root = await s.Root(); var done = await s.Child(root.Id); var open = await s.Child(root.Id);
        await s.State(done.Id, TaskAction.Complete);
        Assert.Equal(TaskState.Pending, (await s.Get(root.Id)).State);
        await Delete(s, open.Id);
        root = await s.Get(root.Id); Assert.Equal(TaskState.Completed, root.State); Assert.Equal(CompletionOrigin.Automatic, root.CompletionOrigin);
        Assert.Equal(HttpStatusCode.OK, (await Restore(s, open.Id)).StatusCode);
        Assert.Equal(TaskState.Pending, (await s.Get(root.Id)).State);
    }

    [Fact]
    public async Task RestoreNeedsTheParentBackFirstAndOnlyTouchesItsOwnBatch()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var root = await s.Root(); var a = await s.Child(root.Id); var b = await s.Child(root.Id);
        app.Clock.Now = Morning; await Delete(s, a.Id);
        app.Clock.Now = Morning.AddMinutes(1); await Delete(s, root.Id);
        var blocked = await Restore(s, a.Id);
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode); Assert.Contains("parent_deleted", await blocked.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, (await Restore(s, root.Id)).StatusCode);
        Assert.Null((await s.Get(b.Id)).ArchivedAt);
        Assert.NotNull((await s.Get(a.Id)).ArchivedAt);
        Assert.Equal(HttpStatusCode.OK, (await Restore(s, a.Id)).StatusCode);
        Assert.Equal(3, (await TaskScenario.Read<TaskPage>(await s.Client.GetAsync("/api/tasks?limit=100"))).Total);
    }

    [Fact]
    public async Task DeleteAndRestoreAreOwnerScopedAndArchivedTasksCannotBeDeleted()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var a = await TaskScenario.User(app); var b = await TaskScenario.User(app);
        var task = await a.Root();
        Assert.Equal(HttpStatusCode.NotFound, (await Post(b, $"/api/tasks/{task.Id}/delete", new { version = task.Version })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Post(b, $"/api/tasks/{task.Id}/restore", new { version = task.Version })).StatusCode);
        var archived = await TaskScenario.Read<TaskView>(await Post(a, $"/api/tasks/{task.Id}/archive", new { version = task.Version }));
        var refused = await Post(a, $"/api/tasks/{task.Id}/delete", new { version = archived.Version });
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode); Assert.Contains("task_archived", await refused.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Conflict, (await Post(a, $"/api/tasks/{task.Id}/restore", new { version = archived.Version })).StatusCode);
    }

    [Fact]
    public async Task ChildrenPageCarriesRowSummariesWithoutPerRowRequests()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var root = await s.Root("Root"); var a = await s.Child(root.Id); var b = await s.Child(root.Id); var leaf = await s.Root("Leaf");
        await s.Define(a.Id, true, 600); await s.Define(b.Id, true, null); await s.Define(leaf.Id, true, 900);
        await s.State(a.Id, TaskAction.Complete);
        var page = await TaskScenario.Read<TreePage>(await s.Client.GetAsync("/api/tasks/children?limit=25"));
        var rows = page.Summaries!.ToDictionary(x => x.TaskId);
        Assert.Equal(2, rows.Count);
        Assert.Equal((2, 1, 600L, 1), (rows[root.Id].ChildCount, rows[root.Id].CompletedChildCount, rows[root.Id].KnownEstimatedSeconds!.Value, rows[root.Id].UnknownEstimateCount));
        Assert.Equal((0, 0, 900L, 0), (rows[leaf.Id].ChildCount, rows[leaf.Id].CompletedChildCount, rows[leaf.Id].KnownEstimatedSeconds!.Value, rows[leaf.Id].UnknownEstimateCount));
        await Delete(s, b.Id);
        page = await TaskScenario.Read<TreePage>(await s.Client.GetAsync("/api/tasks/children?limit=25"));
        var after = page.Summaries!.Single(x => x.TaskId == root.Id);
        Assert.Equal((1, 1, 0), (after.ChildCount, after.CompletedChildCount, after.UnknownEstimateCount));
        // Başka hesabın ağacını bu sayılara katma
        var other = await TaskScenario.User(app);
        Assert.Empty((await TaskScenario.Read<TreePage>(await other.Client.GetAsync("/api/tasks/children?limit=25"))).Summaries!);
    }

    [Fact]
    public async Task ChildrenCompletedFilterSplitsOpenRootsFromTheCompletedSection()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var open = await s.Root("Open"); var first = await s.Root("First"); var second = await s.Root("Second");
        app.Clock.Now = Morning; await s.State(first.Id, TaskAction.Complete);
        app.Clock.Now = Morning.AddHours(1); await s.State(second.Id, TaskAction.Complete);
        var openPage = await TaskScenario.Read<TreePage>(await s.Client.GetAsync("/api/tasks/children?completed=false"));
        Assert.Equal([open.Id], openPage.Items.Select(x => x.Id).ToArray());
        var donePage = await TaskScenario.Read<TreePage>(await s.Client.GetAsync("/api/tasks/children?completed=true&limit=1"));
        Assert.Equal([second.Id], donePage.Items.Select(x => x.Id).ToArray()); Assert.True(donePage.HasMore);
        Assert.Equal(3, (await TaskScenario.Read<TreePage>(await s.Client.GetAsync("/api/tasks/children"))).Items.Length);
    }

    private static async Task<HttpResponseMessage> Range(TaskScenario s, Guid id, string? from, string? to) =>
        await s.Client.PutAsJsonAsync($"/api/tasks/{id}/planned-range", new { version = (await s.Get(id)).Version, plannedFrom = from, plannedTo = to });

    [Fact]
    public async Task PlannedRangesDeriveTheParentAndDriveAssignedOnSuggestions()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var root = await s.Root("Root"); var a = await s.Child(root.Id, "A"); var b = await s.Child(root.Id, "B"); var loose = await s.Root("Loose");
        Assert.Equal(HttpStatusCode.OK, (await Range(s, root.Id, "2026-10-01", "2026-12-31")).StatusCode);
        var summary = await TaskScenario.Read<TreeRowSummary>(await s.Client.GetAsync($"/api/tasks/{root.Id}/summary"));
        Assert.Equal((new DateOnly(2026, 10, 1), new DateOnly(2026, 12, 31), false), (summary.EffectiveFrom!.Value, summary.EffectiveTo!.Value, summary.RangeFromChildren));
        Assert.Equal(HttpStatusCode.OK, (await Range(s, a.Id, "2026-10-24", "2026-10-26")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Range(s, b.Id, "2026-10-27", "2026-10-29")).StatusCode);
        summary = await TaskScenario.Read<TreeRowSummary>(await s.Client.GetAsync($"/api/tasks/{root.Id}/summary"));
        Assert.Equal((new DateOnly(2026, 10, 24), new DateOnly(2026, 10, 29), true), (summary.EffectiveFrom!.Value, summary.EffectiveTo!.Value, summary.RangeFromChildren));
        var own = await s.Get(a.Id); Assert.Equal((new DateOnly(2026, 10, 24), new DateOnly(2026, 10, 26)), (own.PlannedFrom!.Value, own.PlannedTo!.Value));
        var page = await TaskScenario.Read<TreePage>(await s.Client.GetAsync("/api/tasks/children"));
        Assert.Equal(new DateOnly(2026, 10, 29), page.Summaries!.Single(x => x.TaskId == root.Id).EffectiveTo);
        var assigned = await TaskScenario.Read<TaskPage>(await s.Client.GetAsync("/api/tasks?assignedOn=2026-10-25"));
        Assert.Equal([a.Id, root.Id], assigned.Items.Select(x => x.Id).OrderBy(x => x == root.Id).ToArray());
        Assert.DoesNotContain(loose.Id, assigned.Items.Select(x => x.Id));
        Assert.Equal(HttpStatusCode.OK, (await Range(s, a.Id, null, null)).StatusCode);
        Assert.Null((await s.Get(a.Id)).PlannedFrom);
        summary = await TaskScenario.Read<TreeRowSummary>(await s.Client.GetAsync($"/api/tasks/{root.Id}/summary"));
        // Aralığı silinen alt görev üst görevinin aralığını kalıtır; üst görev yine kendi aralığını gösterir.
        Assert.Equal((new DateOnly(2026, 10, 1), new DateOnly(2026, 12, 31)), (summary.EffectiveFrom!.Value, summary.EffectiveTo!.Value));
        var inherited = await TaskScenario.Read<TaskPage>(await s.Client.GetAsync("/api/tasks?assignedOn=2026-11-15"));
        Assert.Contains(a.Id, inherited.Items.Select(x => x.Id));
    }

    [Theory]
    [InlineData("2026-10-24", null)]
    [InlineData(null, "2026-10-24")]
    [InlineData("2026-10-25", "2026-10-24")]
    [InlineData("2026-01-01", "2027-01-04")]
    public async Task PlannedRangeRejectsHalfReversedOrOverlongRanges(string? from, string? to)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app); var task = await s.Root();
        var response = await Range(s, task.Id, from, to);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode); Assert.Contains("planned_range_invalid", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task PlannedRangeAndSummaryAreOwnerScopedAndVersionChecked()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var a = await TaskScenario.User(app); var b = await TaskScenario.User(app);
        var task = await a.Root();
        Assert.Equal(HttpStatusCode.NotFound, (await b.Client.PutAsJsonAsync($"/api/tasks/{task.Id}/planned-range", new { version = task.Version, plannedFrom = "2026-10-24", plannedTo = "2026-10-24" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.Client.GetAsync($"/api/tasks/{task.Id}/summary")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await a.Client.PutAsJsonAsync($"/api/tasks/{task.Id}/planned-range", new { version = task.Version, plannedFrom = "2026-10-24", plannedTo = "2026-10-24" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await a.Client.PutAsJsonAsync($"/api/tasks/{task.Id}/planned-range", new { version = task.Version, plannedFrom = "2026-10-25", plannedTo = "2026-10-25" })).StatusCode);
        await Delete(a, task.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await a.Client.GetAsync($"/api/tasks/{task.Id}/summary")).StatusCode);
    }

    [Fact]
    public async Task CompletedDescOrdersFinishedTasksNewestFirst()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var first = await s.Root("First"); var second = await s.Root("Second"); await s.Root("Open");
        app.Clock.Now = Morning; await s.State(first.Id, TaskAction.Complete);
        app.Clock.Now = Morning.AddHours(1); await s.State(second.Id, TaskAction.Complete);
        var page = await TaskScenario.Read<TaskPage>(await s.Client.GetAsync("/api/tasks?state=Completed&orderBy=CompletedDesc"));
        Assert.Equal([second.Id, first.Id], page.Items.Select(x => x.Id).ToArray());
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync("/api/tasks?orderBy=Nope")).StatusCode);
    }
}

using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Planning;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

// Saatsiz öğeler kapasite, motor ve revizyon dışında. Öğeyi bitirmek göreve dokunmaz.
public sealed class UiR2DayItemTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 10, 15);

    private static Task<HttpResponseMessage> Add(TaskScenario s, Guid taskId, DateOnly? date = null) => s.Client.PostAsJsonAsync($"/api/daily-plans/{date ?? Today:yyyy-MM-dd}/items", new { taskId });
    private static async Task<DayItemView> Added(TaskScenario s, Guid taskId, DateOnly? date = null)
    {
        var response = await Add(s, taskId, date); Assert.Equal(HttpStatusCode.Created, response.StatusCode); return await TaskScenario.Read<DayItemView>(response);
    }
    private static async Task<DayItemPage> List(TaskScenario s, DateOnly? date = null) => await TaskScenario.Read<DayItemPage>(await s.Client.GetAsync($"/api/daily-plans/{date ?? Today:yyyy-MM-dd}/items"));
    private static Task<HttpResponseMessage> Act(TaskScenario s, DayItemView item, string action, object? extra = null) =>
        s.Client.PostAsJsonAsync($"/api/day-items/{item.Id}/{action}", extra ?? new { version = item.Version });
    private static async Task<string> Code(HttpResponseMessage response) => (await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("code").GetString()!;

    [Fact]
    public async Task UntimedItemsListWithTaskFactsFinishOnlyTheDayItemAndNeverTouchPlanningVersionOrRevisions()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var parent = await s.Root("Ana görev"); var step = await s.Child(parent.Id, "Alt adım"); await s.Define(step.Id, true, 1500); var lone = await s.Root("Tek görev");
        var before = await ManualPlanningTests.Day(s);
        var first = await Added(s, step.Id); var second = await Added(s, lone.Id);
        Assert.Equal(("Alt adım", parent.Id, "Ana görev", 1500L), (first.TaskTitle, first.ParentTaskId, first.ParentTitle, first.DirectEstimatedSeconds));
        Assert.True(second.SortOrder > first.SortOrder); Assert.Null(second.ParentTitle);
        var page = await List(s); Assert.Equal(2, page.Total); Assert.Equal(new[] { step.Id, lone.Id }, page.Items.Select(x => x.TaskId).ToArray());
        // Aynı görev bir güne bir kez eklenebilir
        var duplicate = await Add(s, step.Id); Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode); Assert.Equal("day_item_exists", await Code(duplicate));
        var done = await TaskScenario.Read<DayItemView>(await Act(s, first, "complete"));
        Assert.Equal(Morning, done.CompletedAt); Assert.Equal(first.Version + 1, done.Version); Assert.Equal(TaskState.Pending, (await s.Get(step.Id)).State);
        var stale = await Act(s, first, "reopen"); Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode); Assert.Equal("version_conflict", await Code(stale));
        var open = await TaskScenario.Read<DayItemView>(await Act(s, done, "reopen")); Assert.Null(open.CompletedAt);
        var removed = await Act(s, open, "remove"); Assert.Equal(HttpStatusCode.OK, removed.StatusCode);
        Assert.Equal(new[] { lone.Id }, (await List(s)).Items.Select(x => x.TaskId).ToArray());
        Assert.Equal(HttpStatusCode.Conflict, (await Act(s, await TaskScenario.Read<DayItemView>(removed), "complete")).StatusCode);
        // Öğe kaldırılınca yeri boşalır ve aynı görev yeniden eklenebilir.
        await Added(s, step.Id);
        var after = await ManualPlanningTests.Day(s);
        Assert.Equal(before.PlanningVersion, after.PlanningVersion); Assert.Equal(before.Version, after.Version); Assert.Null(after.Id);
        await using var db = fixture.CreateContext();
        Assert.False(await db.TaskSchedules.AnyAsync(x => x.UserId == s.UserId)); Assert.False(await db.PlanRevisions.AnyAsync(x => x.UserId == s.UserId));
        Assert.True(await db.Outbox.AnyAsync(x => x.UserId == s.UserId && x.Kind == "DayItemChanged" && x.SourceId == first.Id));
    }

    [Fact]
    public async Task OnlyOpenDirectWorkCanBeAddedAndDeletedOrArchivedTasksLeaveTheList()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var other = await TaskScenario.User(app);
        var container = await s.Root("Kapsayıcı"); await s.Define(container.Id, false);
        var finished = await s.Root("Biten"); await s.State(finished.Id, TaskAction.Complete);
        foreach (var id in new[] { container.Id, finished.Id })
        {
            var refused = await Add(s, id); Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode); Assert.Equal("task_not_plannable", await Code(refused));
        }
        var foreign = await other.Root("Yabancı");
        Assert.Equal(HttpStatusCode.NotFound, (await Add(s, foreign.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.PostAsJsonAsync($"/api/daily-plans/{Today:yyyy-MM-dd}/items", new { })).StatusCode);
        var deleted = await s.Root("Silinecek"); var item = await Added(s, deleted.Id);
        var archived = await s.Root("Arşivlenecek"); await Added(s, archived.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await other.Client.PostAsJsonAsync($"/api/day-items/{item.Id}/complete", new { version = item.Version })).StatusCode);
        Assert.Empty((await List(other)).Items);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/tasks/{deleted.Id}/delete", new { version = (await s.Get(deleted.Id)).Version })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/tasks/{archived.Id}/archive", new { version = (await s.Get(archived.Id)).Version })).StatusCode);
        Assert.Empty((await List(s)).Items);
        Assert.Equal(HttpStatusCode.NotFound, (await Act(s, item, "complete")).StatusCode);
    }

    [Fact]
    public async Task MovingAnItemChangesOnlyItsDayAndRefusesTheSameDayOrADuplicate()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var task = await s.Root(); var item = await Added(s, task.Id); item = await TaskScenario.Read<DayItemView>(await Act(s, item, "complete"));
        var tomorrow = Today.AddDays(1);
        var same = await Act(s, item, "move", new { version = item.Version, targetDate = Today }); Assert.Equal(HttpStatusCode.BadRequest, same.StatusCode);
        var moved = await TaskScenario.Read<DayItemView>(await Act(s, item, "move", new { version = item.Version, targetDate = tomorrow }));
        Assert.Equal(tomorrow, moved.LocalDate); Assert.Null(moved.CompletedAt); Assert.Empty((await List(s)).Items); Assert.Single((await List(s, tomorrow)).Items);
        var again = await Added(s, task.Id);
        var duplicate = await Act(s, again, "move", new { version = again.Version, targetDate = tomorrow });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode); Assert.Equal("day_item_exists", await Code(duplicate));
        Assert.Equal(HttpStatusCode.BadRequest, (await Act(s, again, "move", new { version = again.Version })).StatusCode);
    }

    [Fact]
    public async Task GivingAnItemATimeCreatesTheBlockAndRetiresTheItemInOneTransaction()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var task = await s.Root(); var otherTask = await s.Root("Başka"); var item = await Added(s, task.Id);
        async Task<HttpResponseMessage> Time(object extra)
        {
            var day = await ManualPlanningTests.Day(s);
            var body = new Dictionary<string, object?> { ["localDate"] = Today, ["taskId"] = task.Id, ["kind"] = "Work", ["startsAt"] = Morning.AddHours(1), ["endsAt"] = Morning.AddHours(2), ["expectedPlanningVersion"] = day.PlanningVersion };
            foreach (var property in extra.GetType().GetProperties()) body[property.Name] = property.GetValue(extra);
            return await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/schedules", body);
        }
        var stale = await Time(new { dayItemId = item.Id, dayItemVersion = item.Version + 1 }); Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        var missing = await Time(new { dayItemId = item.Id }); Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode); Assert.Equal("day_item_version_required", await Code(missing));
        var wrongTask = await Time(new { dayItemId = item.Id, dayItemVersion = item.Version, taskId = otherTask.Id }); Assert.Equal("day_item_task_mismatch", await Code(wrongTask));
        await using (var db = fixture.CreateContext()) Assert.False(await db.TaskSchedules.AnyAsync(x => x.UserId == s.UserId));
        Assert.Single((await List(s)).Items);
        var timed = await Time(new { dayItemId = item.Id, dayItemVersion = item.Version }); Assert.Equal(HttpStatusCode.Created, timed.StatusCode);
        var block = Assert.Single((await TaskScenario.Read<PlanMutation>(timed)).Schedules); Assert.Equal(task.Id, block.TaskId);
        Assert.Empty((await List(s)).Items);
        await using (var db = fixture.CreateContext()) Assert.Equal(DayItemState.Scheduled, (await db.DayItems.SingleAsync(x => x.Id == item.Id)).State);
        // Kapanmış saatsiz öğeyi ikinci kez saatliye çevirme
        Assert.Equal(HttpStatusCode.Conflict, (await Time(new { dayItemId = item.Id, dayItemVersion = item.Version + 1, startsAt = Morning.AddHours(3), endsAt = Morning.AddHours(4) })).StatusCode);
    }

    [Fact]
    public async Task CompletingATimedItemFinishesTheWholeMidnightGroupKeepsTheTaskOpenAndIsOwnerAndVersionChecked()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var other = await TaskScenario.User(app);
        var task = await s.Root();
        // İstanbul'da 23:30–00:30 gece yarısını geçiyor. İki bağlı parça halinde sakla.
        var created = await ManualPlanningTests.Create(s, task.Id, Morning.AddHours(14).AddMinutes(30), Morning.AddHours(15).AddMinutes(30));
        Assert.Equal(2, created.Schedules.Length); var first = created.Schedules[0]; var planning = (await ManualPlanningTests.Day(s)).PlanningVersion;
        Assert.Equal(HttpStatusCode.NotFound, (await other.Client.PostAsJsonAsync($"/api/schedules/{first.Id}/complete", new { version = first.Version })).StatusCode);
        var done = await TaskScenario.Read<ScheduleCompletion>(await s.Client.PostAsJsonAsync($"/api/schedules/{first.Id}/complete", new { version = first.Version }));
        Assert.Equal(2, done.Schedules.Length); Assert.All(done.Schedules, x => Assert.Equal(Morning, x.CompletedAt));
        Assert.Equal(TaskState.Pending, (await s.Get(task.Id)).State); Assert.Equal(planning, (await ManualPlanningTests.Day(s)).PlanningVersion);
        var stale = await s.Client.PostAsJsonAsync($"/api/schedules/{first.Id}/reopen", new { version = first.Version }); Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        var listed = await TaskScenario.Read<SchedulePage>(await s.Client.GetAsync($"/api/schedules?{ManualPlanningTests.Range(Morning, Morning.AddDays(1))}"));
        Assert.All(listed.Items, x => Assert.NotNull(x.CompletedAt));
        var reopened = await TaskScenario.Read<ScheduleCompletion>(await s.Client.PostAsJsonAsync($"/api/schedules/{first.Id}/reopen", new { version = done.Schedules[0].Version }));
        Assert.All(reopened.Schedules, x => Assert.Null(x.CompletedAt));
        var current = reopened.Schedules[0]; Assert.Equal(HttpStatusCode.OK, (await ManualPlanningTests.Change(s, current, remove: true)).StatusCode);
        var removed = await s.Client.PostAsJsonAsync($"/api/schedules/{first.Id}/complete", new { version = current.Version + 1 });
        Assert.Equal(HttpStatusCode.Conflict, removed.StatusCode); Assert.Equal("schedule_removed", await Code(removed));
        await using var db = fixture.CreateContext(); Assert.True(await db.Outbox.AnyAsync(x => x.UserId == s.UserId && x.Kind == "DayItemChanged" && x.SourceId == first.Id));
    }
}

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Adhd.Application.Planning;
using Adhd.Domain.Planning;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Adhd.IntegrationTests;

// Saatsiz öğe geri alınabilir geçmişe girer, plan sürümünü ilerletir ve günün başına gelebilir.
public sealed class UiR3DayItemHistoryTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 10, 15);
    private static readonly DateOnly Tomorrow = Today.AddDays(1);

    private static async Task<DayItemView> Add(TaskScenario s, Guid taskId, DateOnly? date = null, string? placement = null)
    {
        var response = await s.Client.PostAsJsonAsync($"/api/daily-plans/{date ?? Today:yyyy-MM-dd}/items", placement is null ? new { taskId } : (object)new { taskId, placement });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode); return await TaskScenario.Read<DayItemView>(response);
    }
    private static async Task<DayItemView> Act(TaskScenario s, DayItemView item, string action) =>
        await TaskScenario.Read<DayItemView>(await s.Client.PostAsJsonAsync($"/api/day-items/{item.Id}/{action}", new { version = item.Version }));
    private static Task<HttpResponseMessage> Undo(TaskScenario s, Guid changeSet, long version) =>
        s.Client.PostAsJsonAsync("/api/day-items/undo", new { changeSetId = changeSet, expectedPlanningVersion = version });
    private static async Task<DayItemPage> List(TaskScenario s, DateOnly? date = null) => await TaskScenario.Read<DayItemPage>(await s.Client.GetAsync($"/api/daily-plans/{date ?? Today:yyyy-MM-dd}/items"));
    private static async Task<string> Code(HttpResponseMessage response) => (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString()!;
    private static async Task<RevisionChangeView[]> Changes(TaskScenario s, DateOnly date)
    {
        var revisions = await TaskScenario.Read<RevisionPage>(await s.Client.GetAsync($"/api/daily-plans/{date:yyyy-MM-dd}/revisions?limit=100"));
        var latest = revisions.Items.OrderByDescending(x => x.Number).First();
        return (await TaskScenario.Read<RevisionChangePage>(await s.Client.GetAsync($"/api/plan-revisions/{latest.Id}/changes"))).Items;
    }

    [Fact]
    public async Task EveryDayItemChangeIsARevisionThatAdvancesThePlanningVersion()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var task = await s.Root("Kitap oku");
        var v0 = (await ManualPlanningTests.Day(s)).PlanningVersion;
        var added = await Add(s, task.Id);
        Assert.NotNull(added.ChangeSetId); Assert.Equal(v0 + 1, added.PlanningVersion);
        var change = Assert.Single(await Changes(s, Today));
        Assert.Equal(("DayItemAdded", added.Id, (Guid?)null), (change.Type, change.DayItemId!.Value, change.ScheduleId));
        Assert.Null(change.DayItemBefore); Assert.Equal(DayItemState.Planned, change.DayItemAfter!.State);
        var done = await Act(s, added, "complete");
        Assert.Equal(v0 + 2, done.PlanningVersion);
        var completed = Assert.Single(await Changes(s, Today));
        Assert.Equal("DayItemCompleted", completed.Type); Assert.Null(completed.DayItemBefore!.CompletedAt); Assert.NotNull(completed.DayItemAfter!.CompletedAt);
        var day = await ManualPlanningTests.Day(s);
        Assert.Equal(v0 + 2, day.PlanningVersion); Assert.NotNull(day.CurrentRevisionId); Assert.Null(day.BaselineRevisionId);
        // Gün öğesi grubu saatli geri alma için kaynak olamaz
        var scheduleUndo = await s.Client.PostAsJsonAsync("/api/scheduling/undo-preview", new { changeSetId = done.ChangeSetId, expectedPlanningVersion = day.PlanningVersion });
        Assert.Equal(HttpStatusCode.Conflict, scheduleUndo.StatusCode); Assert.Equal("undo_use_day_items", await Code(scheduleUndo));
        await using var db = fixture.CreateContext();
        Assert.Equal(2, await db.PlanRevisions.CountAsync(x => x.UserId == s.UserId && x.Trigger == "DayItem"));
        Assert.Equal(2, await db.PlanRevisionDayItems.CountAsync(x => x.UserId == s.UserId && x.DayItemId == added.Id));
    }

    [Fact]
    public async Task UndoRestoresExactlyOnceOnlyForTheLatestChangeAndOnlyForTheOwner()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var other = await TaskScenario.User(app);
        var a = await s.Root("A"); var b = await s.Root("B");
        var first = await Add(s, a.Id); var second = await Add(s, b.Id);
        var removed = await Act(s, second, "remove");
        Assert.Equal(new[] { a.Id }, (await List(s)).Items.Select(x => x.TaskId));
        // Bu değişiklik günün en yenisi değil.
        var stale = await Undo(s, first.ChangeSetId!.Value, removed.PlanningVersion!.Value);
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode); Assert.Equal("undo_not_latest", await Code(stale));
        // Plan sürümü artık güncel değil.
        var oldVersion = await Undo(s, removed.ChangeSetId!.Value, removed.PlanningVersion.Value - 1);
        Assert.Equal(HttpStatusCode.Conflict, oldVersion.StatusCode); Assert.Equal("planning_version_conflict", await Code(oldVersion));
        // Başka hesap bu değişiklik grubunu okuyamaz
        var foreign = await Undo(other, removed.ChangeSetId.Value, (await ManualPlanningTests.Day(other)).PlanningVersion);
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
        var undone = await TaskScenario.Read<DayItemBatchResult>(await Undo(s, removed.ChangeSetId.Value, removed.PlanningVersion.Value));
        var restored = Assert.Single(undone.Items);
        Assert.Equal((second.Id, second.SortOrder), (restored.Id, restored.SortOrder));
        Assert.Equal(new[] { a.Id, b.Id }, (await List(s)).Items.Select(x => x.TaskId));
        var again = await Undo(s, removed.ChangeSetId.Value, undone.PlanningVersion);
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode); Assert.Equal("undo_already_applied", await Code(again));
        // Geri alma da son değişiklik olur. Onu geri alınca öğe yeniden kalkar.
        var redo = await TaskScenario.Read<DayItemBatchResult>(await Undo(s, undone.ChangeSetId, undone.PlanningVersion));
        Assert.Equal(new[] { a.Id }, (await List(s)).Items.Select(x => x.TaskId));
        Assert.Equal(undone.PlanningVersion + 1, redo.PlanningVersion);
        await using var db = fixture.CreateContext();
        Assert.True(await db.PlanRevisions.AnyAsync(x => x.UserId == s.UserId && x.ReversesChangeSetId == removed.ChangeSetId));
    }

    [Fact]
    public async Task BatchMoveIsOneChangeSetAcrossBothDaysAndUndoReturnsEveryItem()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var tasks = new[] { await s.Root("Bir"), await s.Root("İki"), await s.Root("Üç") };
        var items = new List<DayItemView>(); foreach (var t in tasks) items.Add(await Add(s, t.Id));
        var keep = await Add(s, (await s.Root("Kalsın")).Id);
        var done = await Act(s, items[1], "complete");
        var waiting = await Add(s, (await s.Root("Yarın zaten var")).Id, Tomorrow);
        var moved = await TaskScenario.Read<DayItemBatchResult>(await s.Client.PostAsJsonAsync($"/api/daily-plans/{Today:yyyy-MM-dd}/items/move",
            new { targetDate = Tomorrow, items = new[] { new { id = items[0].Id, version = items[0].Version }, new { id = done.Id, version = done.Version }, new { id = items[2].Id, version = items[2].Version } } }));
        Assert.Equal(3, moved.Items.Length); Assert.All(moved.Items, x => Assert.Equal(Tomorrow, x.LocalDate)); Assert.All(moved.Items, x => Assert.Null(x.CompletedAt));
        Assert.Equal(new[] { waiting.TaskId, tasks[0].Id, tasks[1].Id, tasks[2].Id }, (await List(s, Tomorrow)).Items.Select(x => x.TaskId));
        Assert.Equal(new[] { keep.TaskId }, (await List(s)).Items.Select(x => x.TaskId));
        await using (var db = fixture.CreateContext())
            Assert.Equal(2, await db.PlanRevisions.CountAsync(x => x.UserId == s.UserId && x.ChangeSetId == moved.ChangeSetId));
        var undone = await TaskScenario.Read<DayItemBatchResult>(await Undo(s, moved.ChangeSetId, moved.PlanningVersion));
        Assert.Equal(3, undone.Items.Length);
        var today = (await List(s)).Items;
        Assert.Equal(new[] { tasks[0].Id, tasks[1].Id, tasks[2].Id, keep.TaskId }, today.Select(x => x.TaskId));
        Assert.NotNull(today.Single(x => x.Id == done.Id).CompletedAt);
        Assert.Equal(new[] { waiting.TaskId }, (await List(s, Tomorrow)).Items.Select(x => x.TaskId));
        // Taşımadan sonra öğe değiştiyse eski taşımayı geri alma
        var single = await TaskScenario.Read<DayItemView>(await s.Client.PostAsJsonAsync($"/api/day-items/{keep.Id}/move", new { version = keep.Version, targetDate = Tomorrow }));
        var reopened = await TaskScenario.Read<DayItemView>(await s.Client.PostAsJsonAsync($"/api/day-items/{single.Id}/complete", new { version = single.Version }));
        var changed = await Undo(s, single.ChangeSetId!.Value, reopened.PlanningVersion!.Value);
        Assert.Equal(HttpStatusCode.Conflict, changed.StatusCode);
        var invalid = await s.Client.PostAsJsonAsync($"/api/daily-plans/{Today:yyyy-MM-dd}/items/move", new { targetDate = Tomorrow, items = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
    }

    [Fact]
    public async Task BatchMoveToADayWithoutAPlanCreatesThatPlanOnceAndUndoes()
    {
        // Planı olmayan güne iki öğe taşınınca aynı plan iki kez eklenip unique indeks hatası veriyordu.
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var later = Today.AddDays(9);
        var items = new List<DayItemView>(); foreach (var name in new[] { "Bir", "İki", "Üç" }) items.Add(await Add(s, (await s.Root(name)).Id));
        var response = await s.Client.PostAsJsonAsync($"/api/daily-plans/{Today:yyyy-MM-dd}/items/move",
            new { targetDate = later, items = items.Take(2).Select(x => new { id = x.Id, version = x.Version }).ToArray() });
        var moved = await TaskScenario.Read<DayItemBatchResult>(response);
        Assert.Equal(new[] { items[0].TaskId, items[1].TaskId }, (await List(s, later)).Items.Select(x => x.TaskId));
        await using (var db = fixture.CreateContext())
            Assert.Equal(1, await db.DailyPlans.CountAsync(x => x.UserId == s.UserId && x.LocalDate == later));
        var undone = await TaskScenario.Read<DayItemBatchResult>(await Undo(s, moved.ChangeSetId, moved.PlanningVersion));
        Assert.Equal(2, undone.Items.Length);
        Assert.Equal(3, (await List(s)).Items.Length);
        Assert.Empty((await List(s, later)).Items);
    }

    [Fact]
    public async Task FirstPlacementLeadsTheDayAndKeepsTheOtherOrder()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var a = await Add(s, (await s.Root("A")).Id, Tomorrow); var b = await Add(s, (await s.Root("B")).Id, Tomorrow);
        var lead = await Add(s, (await s.Root("Yarının ilk işi")).Id, Tomorrow, "First");
        Assert.Equal(0, lead.SortOrder);
        Assert.Equal(new[] { lead.Id, a.Id, b.Id }, (await List(s, Tomorrow)).Items.Select(x => x.Id));
        var last = await Add(s, (await s.Root("Son")).Id, Tomorrow, "Last");
        Assert.Equal(last.Id, (await List(s, Tomorrow)).Items.Last().Id);
        var change = Assert.Single(await Changes(s, Tomorrow));
        Assert.Equal("DayItemAdded", change.Type);
    }

    [Fact]
    public async Task AnItemGivenATimeKeepsItsIdentityInHistoryAndTheDatabaseRejectsAmbiguousChanges()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var task = await s.Root(); var item = await Add(s, task.Id);
        var day = await ManualPlanningTests.Day(s);
        var timed = await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/schedules", new { localDate = Today, taskId = task.Id, kind = "Work", startsAt = Morning.AddHours(1), endsAt = Morning.AddHours(2),
            expectedPlanningVersion = day.PlanningVersion, dayItemId = item.Id, dayItemVersion = item.Version });
        Assert.Equal(HttpStatusCode.Created, timed.StatusCode);
        var block = (await TaskScenario.Read<PlanMutation>(timed)).Schedules.Single();
        await using var db = fixture.CreateContext();
        var stored = await db.DayItems.SingleAsync(x => x.Id == item.Id);
        Assert.Equal((DayItemState.Scheduled, (Guid?)block.Id), (stored.State, stored.ScheduleId));
        var latest = await db.PlanRevisions.Where(x => x.UserId == s.UserId).OrderByDescending(x => x.Number).FirstAsync();
        var snapshot = JsonSerializer.Deserialize<DayItemSnapshot>((await db.PlanRevisionDayItems.SingleAsync(x => x.RevisionId == latest.Id && x.DayItemId == item.Id)).Snapshot, new JsonSerializerOptions(JsonSerializerDefaults.Web) { Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() } })!;
        Assert.Equal((DayItemState.Scheduled, (Guid?)block.Id), (snapshot.State, snapshot.TimedScheduleId));
        // Önceki saatli revizyonlar aynı değişiklik ucundan okunur
        var timedChanges = await Changes(s, Today);
        Assert.All(timedChanges, x => Assert.NotNull(x.ScheduleId));
        // CHECK kuralı tam bir hedef istiyor.
        var revision = latest.Id;
        var bad = new PlanRevisionChange { Id = Guid.CreateVersion7(), UserId = s.UserId, RevisionId = revision, Type = "Broken", After = "{}" };
        db.PlanRevisionChanges.Add(bad);
        var error = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Equal("CK_revision_change_target", ((PostgresException)error.InnerException!).ConstraintName);
    }
}

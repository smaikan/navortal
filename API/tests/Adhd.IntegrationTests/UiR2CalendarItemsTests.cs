using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Calendar;
using Adhd.Application.Planning;
using Adhd.Domain.Tasks;

namespace Adhd.IntegrationTests;

// Her günün planını üst ve kök görevle, hesaba göre filtreli ve sayfalı oku.
public sealed class UiR2CalendarItemsTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 10, 15);
    private static async Task<CalendarItemPage> Items(TaskScenario s, DateOnly from, DateOnly to, string extra = "") =>
        await TaskScenario.Read<CalendarItemPage>(await s.Client.GetAsync($"/api/calendar/items?fromDate={from:yyyy-MM-dd}&toDate={to:yyyy-MM-dd}{extra}"));
    private static async Task<DayItemView> Untimed(TaskScenario s, Guid taskId, DateOnly date)
    {
        var response = await s.Client.PostAsJsonAsync($"/api/daily-plans/{date:yyyy-MM-dd}/items", new { taskId }); Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await TaskScenario.Read<DayItemView>(response);
    }

    [Fact]
    public async Task ItemsCarryParentAndRootAndAreOrderedTimedThenUntimedPerDay()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var root = await s.Root("Tez"); var chapter = await s.Child(root.Id, "Bölüm 3"); var step = await s.Child(chapter.Id, "Kaynak notları"); await s.Define(step.Id, true, 1800);
        var mail = await s.Root("E-postalar"); var walk = await s.Root("Yürüyüş");
        var late = await ManualPlanningTests.Create(s, mail.Id, Morning.AddHours(5), Morning.AddHours(6));
        var early = await ManualPlanningTests.Create(s, step.Id, Morning.AddHours(1), Morning.AddHours(2));
        await ManualPlanningTests.Create(s, null, Morning.AddHours(3), Morning.AddHours(3).AddMinutes(15), "Break");
        await Untimed(s, walk.Id, Today); await Untimed(s, mail.Id, Today.AddDays(1));
        var page = await Items(s, Today, Today.AddDays(1));
        Assert.Equal(4, page.Total);
        Assert.Equal(new[] { step.Id, mail.Id, walk.Id, mail.Id }, page.Items.Select(x => x.TaskId).ToArray());
        var first = page.Items[0];
        Assert.Equal((CalendarItemKind.Timed, chapter.Id, "Bölüm 3", root.Id, "Tez"), (first.Kind, first.ParentTaskId, first.ParentTitle, first.RootTaskId, first.RootTitle));
        Assert.Equal(early.Schedules[0].Id, first.Id); Assert.Equal(late.Schedules[0].Id, page.Items[1].Id);
        var loose = page.Items[2];
        Assert.Equal((CalendarItemKind.Untimed, (Guid?)null, walk.Id, "Yürüyüş"), (loose.Kind, loose.ParentTaskId, loose.RootTaskId, loose.RootTitle));
        Assert.Null(loose.StartsAt); Assert.Equal(Today.AddDays(1), page.Items[3].LocalDate);
        // Plan öğesinin bitmiş hali taşınır. Görev açık kalır.
        var block = early.Schedules[0];
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/schedules/{block.Id}/complete", new { version = block.Version })).StatusCode);
        var after = await Items(s, Today, Today);
        Assert.Equal(Morning, after.Items.Single(x => x.Id == block.Id).CompletedAt); Assert.Equal(TaskState.Pending, after.Items.Single(x => x.Id == block.Id).TaskState);
    }

    [Fact]
    public async Task RemovedDeletedForeignAndOutOfRangeItemsStayOutAndTheRangeIsBoundedAndPaged()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var other = await TaskScenario.User(app);
        var kept = await s.Root("Kalan"); var removed = await s.Root("Kaldırılan"); var deleted = await s.Root("Silinen"); var later = await s.Root("Sonra");
        await ManualPlanningTests.Create(s, kept.Id, Morning.AddHours(1), Morning.AddHours(2));
        var gone = (await ManualPlanningTests.Create(s, removed.Id, Morning.AddHours(3), Morning.AddHours(4))).Schedules[0];
        Assert.Equal(HttpStatusCode.OK, (await ManualPlanningTests.Change(s, gone, remove: true)).StatusCode);
        await Untimed(s, deleted.Id, Today);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/tasks/{deleted.Id}/delete", new { version = (await s.Get(deleted.Id)).Version })).StatusCode);
        await Untimed(s, later.Id, Today.AddDays(5));
        var page = await Items(s, Today, Today.AddDays(1));
        Assert.Equal(new[] { kept.Id }, page.Items.Select(x => x.TaskId).ToArray());
        Assert.Empty((await Items(other, Today, Today.AddDays(6))).Items);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync($"/api/calendar/items?fromDate={Today:yyyy-MM-dd}&toDate={Today.AddDays(42):yyyy-MM-dd}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync($"/api/calendar/items?fromDate={Today:yyyy-MM-dd}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync($"/api/calendar/items?fromDate={Today:yyyy-MM-dd}&toDate={Today:yyyy-MM-dd}&limit=501")).StatusCode);
        var paged = await Items(s, Today, Today.AddDays(6), "&offset=1&limit=1");
        Assert.Equal((2, 1, 1), (paged.Total, paged.Offset, paged.Limit)); Assert.Equal(later.Id, Assert.Single(paged.Items).TaskId);
    }
}

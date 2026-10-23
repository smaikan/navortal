using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Adhd.Application.Planning;
using Adhd.Application.Recurrence;
using Adhd.Application.Tasks;
using Adhd.Domain.Planning;
using Adhd.Domain.Recurrence;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace Adhd.IntegrationTests;

// Rutin bitiş tarihi, kayan pencere, önizleme ve seri değişikliğinin plan öğelerine etkisi.
public sealed class RoutineHorizonTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateOnly Today = new(2026, 11, 2);
    private static readonly DateTimeOffset Morning = new(2026, 11, 2, 6, 0, 0, TimeSpan.Zero);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
    private static Task<HttpResponseMessage> Send(TaskScenario s, HttpMethod method, string path, object body, string? key = null) => ManualPlanningTests.Send(s, method, path, JsonSerializer.SerializeToElement(body, Json), key);
    private static async Task<T> Ok<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return await TaskScenario.Read<T>(response);
    }
    private static async Task<RecurrenceTemplateView> Routine(TaskScenario s, RecurrenceRule rule, string title = "Yürüyüş", long? seconds = null) =>
        (await Ok<RecurrenceEffect>(await Send(s, HttpMethod.Post, "/api/recurrence-templates", new RecurrenceCreate(rule, new(title, EstimatedSeconds: seconds))))).Template;
    private static Task<RecurrenceEffect> Fill(TaskScenario s, RecurrenceTemplateView t, DateOnly from, DateOnly to, string? key = null) =>
        Send(s, HttpMethod.Post, $"/api/recurrence-templates/{t.Id}/materialize", new MaterializeRecurrence(t.Version, from, to), key).ContinueWith(x => Ok<RecurrenceEffect>(x.Result)).Unwrap();
    private static Task<RecurrenceEffect> Edit(TaskScenario s, RecurrenceTemplateView t, RecurrenceRule rule, string title = "Yürüyüş", long? seconds = null, DateOnly? from = null) =>
        Send(s, HttpMethod.Put, $"/api/recurrence-templates/{t.Id}", new RecurrenceUpdate(t.Version, from ?? Today, rule, new(title, EstimatedSeconds: seconds), true, (from ?? Today).AddDays(92))).ContinueWith(x => Ok<RecurrenceEffect>(x.Result)).Unwrap();
    private static Task<RecurrenceEffect> Enabled(TaskScenario s, RecurrenceTemplateView t, bool enabled) =>
        Send(s, HttpMethod.Put, $"/api/recurrence-templates/{t.Id}/enabled", new { version = t.Version, enabled }).ContinueWith(x => Ok<RecurrenceEffect>(x.Result)).Unwrap();
    private static async Task<DayItemView[]> Items(TaskScenario s, DateOnly date) => (await Ok<DayItemPage>(await s.Client.GetAsync($"/api/daily-plans/{date:yyyy-MM-dd}/items"))).Items;
    private static async Task<RecurrenceProjectionView> Projection(TaskScenario s, DateOnly from, DateOnly to) =>
        await Ok<RecurrenceProjectionView>(await s.Client.GetAsync($"/api/recurrence-templates/projection?fromDate={from:yyyy-MM-dd}&toDate={to:yyyy-MM-dd}"));
    private async Task<(PlannerFactory App, TaskScenario User)> Start() { var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; return (app, await TaskScenario.User(app)); }

    [Fact]
    public async Task UntilDateIsInclusiveForPlansAndProjection()
    {
        var (app, s) = await Start(); await using var _ = app;
        var t = await Routine(s, new(Today, UntilDate: Today.AddDays(2), AutoAddToPlan: true));
        await Fill(s, t, Today, Today.AddDays(5));
        Assert.Single(await Items(s, Today.AddDays(2))); Assert.Empty(await Items(s, Today.AddDays(3)));
        var far = await Routine(s, new(Today, UntilDate: Today.AddDays(40), AutoAddToPlan: true), "Uzak");
        var days = (await Projection(s, Today.AddDays(38), Today.AddDays(42))).Items.Where(x => x.TemplateId == far.Id).Select(x => x.LocalDate).ToArray();
        Assert.Equal([Today.AddDays(38), Today.AddDays(39), Today.AddDays(40)], days);
    }
    [Fact]
    public async Task ProjectionShowsOnlyActiveAutomaticDaysWithoutRecordsAndWritesNothing()
    {
        var (app, s) = await Start(); await using var _ = app; var other = await TaskScenario.User(app);
        var weekly = await Routine(s, new(Today, Frequency: RecurrenceFrequency.Weekly, WeekDays: [1, 3], StartTime: new(9, 30), AutoAddToPlan: true), "Haftalık", 1800);
        await Routine(s, new(Today), "Otomatik değil"); var paused = await Routine(s, new(Today, AutoAddToPlan: true), "Duraklayan"); await Enabled(s, paused, false);
        await Fill(s, weekly, Today, Today);
        await using var db = fixture.CreateContext(); var tasks = await db.Tasks.CountAsync(x => x.UserId == s.UserId); var plans = await db.DailyPlans.CountAsync(x => x.UserId == s.UserId);
        var view = await Projection(s, Today.AddDays(-3), Today.AddDays(9));
        Assert.All(view.Items, x => Assert.Equal(weekly.Id, x.TemplateId));
        Assert.Equal([Today.AddDays(2), Today.AddDays(7), Today.AddDays(9)], view.Items.Select(x => x.LocalDate).ToArray());
        Assert.Equal(new TimeOnly(9, 30), view.Items[0].StartTime); Assert.Equal(1800, view.Items[0].EstimatedSeconds); Assert.Equal(weekly.Version, view.Items[0].TemplateVersion);
        Assert.Equal(tasks, await db.Tasks.CountAsync(x => x.UserId == s.UserId)); Assert.Equal(plans, await db.DailyPlans.CountAsync(x => x.UserId == s.UserId));
        Assert.Empty((await Projection(other, Today, Today.AddDays(9))).Items);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync($"/api/recurrence-templates/projection?fromDate={Today:yyyy-MM-dd}&toDate={Today.AddDays(42):yyyy-MM-dd}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateClient().GetAsync($"/api/recurrence-templates/projection?fromDate={Today:yyyy-MM-dd}&toDate={Today:yyyy-MM-dd}")).StatusCode);
    }
    [Fact]
    public async Task ProjectedDayCanBeSkippedForeverOrMadeReal()
    {
        var (app, s) = await Start(); await using var _ = app; var t = await Routine(s, new(Today, AutoAddToPlan: true)); var skip = Today.AddDays(35); var real = Today.AddDays(36);
        await Ok<RecurrenceEffect>(await Send(s, HttpMethod.Post, $"/api/recurrence-templates/{t.Id}/occurrences/{skip:yyyy-MM-dd}/skip", new ChangeOccurrence(t.Version)));
        await Fill(s, t, real, real);
        Assert.Equal([Today.AddDays(37)], (await Projection(s, skip, Today.AddDays(37))).Items.Select(x => x.LocalDate).ToArray());
        Assert.Single(await Items(s, real)); Assert.Empty(await Items(s, skip));
        await Fill(s, t, skip, skip); Assert.Empty(await Items(s, skip));
    }
    [Fact]
    public async Task SkippingOccurrenceRemovesItsUntimedPlanItem()
    {
        var (app, s) = await Start(); await using var _ = app; var t = await Routine(s, new(Today, AutoAddToPlan: true)); var day = Today.AddDays(1);
        var made = await Fill(s, t, day, day); var taskId = made.Occurrences[0].TaskId!.Value;
        await Ok<RecurrenceEffect>(await Send(s, HttpMethod.Post, $"/api/recurrence-templates/{t.Id}/occurrences/{day:yyyy-MM-dd}/skip", new ChangeOccurrence(t.Version, (await s.Get(taskId)).Version)));
        Assert.Empty(await Items(s, day));
    }
    [Fact]
    public async Task PauseRetractsOnlyUntouchedFutureAndResumeBringsTheSameTasksBack()
    {
        var (app, s) = await Start(); await using var _ = app; var t = await Routine(s, new(Today, StartTime: new(10, 0), AutoAddToPlan: true), seconds: 1800);
        var made = await Fill(s, t, Today, Today.AddDays(3)); var ids = made.Occurrences.Select(x => x.TaskId!.Value).ToArray();
        var paused = await Enabled(s, made.Template, false); Assert.Equal(3, paused.RetractedDayItemCount);
        await using var db = fixture.CreateContext();
        Assert.Equal(1, await db.TaskSchedules.CountAsync(x => x.UserId == s.UserId && x.State == ScheduleState.Planned));
        Assert.Equal(TaskState.Pending, (await s.Get(ids[0])).State); Assert.Equal(TaskState.Skipped, (await s.Get(ids[1])).State);
        Assert.Empty((await Projection(s, Today, Today.AddDays(5))).Items);
        var resumed = await Enabled(s, paused.Template, true); var back = await Fill(s, resumed.Template, Today, Today.AddDays(3));
        Assert.Equal(ids, back.Occurrences.Select(x => x.TaskId!.Value).ToArray()); Assert.Equal(TaskState.Pending, (await s.Get(ids[1])).State);
        Assert.Equal(4, await db.TaskSchedules.CountAsync(x => x.UserId == s.UserId && x.State == ScheduleState.Planned));
        Assert.Equal(4, await db.RecurrenceOccurrences.CountAsync(x => x.UserId == s.UserId));
    }
    [Fact]
    public async Task ShorteningRetractsTailAndExtendingRestoresIt()
    {
        var (app, s) = await Start(); await using var _ = app; var rule = new RecurrenceRule(Today, AutoAddToPlan: true); var t = await Routine(s, rule);
        var made = await Fill(s, t, Today, Today.AddDays(4));
        var short_ = await Edit(s, made.Template, rule with { UntilDate = Today.AddDays(1) }); Assert.Equal(3, short_.RetractedDayItemCount); Assert.Empty(short_.ProtectedTaskIds);
        Assert.Single(await Items(s, Today.AddDays(1))); Assert.Empty(await Items(s, Today.AddDays(2)));
        Assert.Equal(TaskState.Skipped, (await s.Get(made.Occurrences[4].TaskId!.Value)).State);
        var longer = await Edit(s, short_.Template, rule); await Fill(s, longer.Template, Today, Today.AddDays(4));
        Assert.Single(await Items(s, Today.AddDays(4))); Assert.Equal(TaskState.Pending, (await s.Get(made.Occurrences[4].TaskId!.Value)).State);
    }
    [Fact]
    public async Task UserRemovedItemNeverComesBackAfterEditOrPause()
    {
        var (app, s) = await Start(); await using var _ = app; var rule = new RecurrenceRule(Today, AutoAddToPlan: true); var t = await Routine(s, rule); var day = Today.AddDays(1);
        var made = await Fill(s, t, Today, Today.AddDays(2)); var item = Assert.Single(await Items(s, day));
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/day-items/{item.Id}/remove", new { version = item.Version })).StatusCode);
        var edited = await Edit(s, made.Template, rule with { StartTime = new(8, 0) }); await Fill(s, edited.Template, Today, Today.AddDays(2)); Assert.Empty(await Items(s, day));
        var paused = await Enabled(s, edited.Template, false); var resumed = await Enabled(s, paused.Template, true); await Fill(s, resumed.Template, Today, Today.AddDays(2));
        Assert.Empty(await Items(s, day)); Assert.Single(await Items(s, Today.AddDays(2)));
    }
    [Fact]
    public async Task TouchedItemsAndTodayStayWhenSeriesChanges()
    {
        var (app, s) = await Start(); await using var _ = app; var rule = new RecurrenceRule(Today, AutoAddToPlan: true); var t = await Routine(s, rule);
        var made = await Fill(s, t, Today, Today.AddDays(4)); var done = Assert.Single(await Items(s, Today.AddDays(1))); var moved = Assert.Single(await Items(s, Today.AddDays(2))); var reopened = Assert.Single(await Items(s, Today.AddDays(3)));
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/day-items/{reopened.Id}/complete", new { version = reopened.Version })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/day-items/{reopened.Id}/reopen", new { version = reopened.Version + 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/day-items/{done.Id}/complete", new { version = done.Version })).StatusCode);
        Assert.True((await s.Client.PostAsJsonAsync($"/api/day-items/{moved.Id}/move", new { version = moved.Version, targetDate = Today.AddDays(5) })).IsSuccessStatusCode);
        var paused = await Enabled(s, made.Template, false); Assert.Equal(1, paused.RetractedDayItemCount);
        Assert.Single(await Items(s, Today)); Assert.Single(await Items(s, Today.AddDays(1))); Assert.Single(await Items(s, Today.AddDays(5))); Assert.Single(await Items(s, Today.AddDays(3))); Assert.Empty(await Items(s, Today.AddDays(4)));
    }
    [Fact]
    public async Task TimeChangeRebuildsBlocksButTitleOnlyEditKeepsUntimedItemIdentity()
    {
        var (app, s) = await Start(); await using var _ = app; var day = Today.AddDays(1); var rule = new RecurrenceRule(Today, StartTime: new(10, 0), AutoAddToPlan: true);
        var t = await Routine(s, rule, seconds: 1800); var made = await Fill(s, t, day, day);
        await Edit(s, made.Template, rule with { StartTime = new(14, 0) }, seconds: 1800);
        await using var db = fixture.CreateContext(); var block = await db.TaskSchedules.SingleAsync(x => x.UserId == s.UserId && x.State == ScheduleState.Planned);
        Assert.Equal(new DateTimeOffset(2026, 11, 3, 11, 0, 0, TimeSpan.Zero), block.StartsAt); Assert.Equal(made.Occurrences[0].TaskId, block.TaskId);
        var (other, u) = await Start(); await using var __ = other; var plain = new RecurrenceRule(Today, AutoAddToPlan: true); var r = await Routine(u, plain); var filled = await Fill(u, r, day, day); var before = Assert.Single(await Items(u, day));
        await Edit(u, filled.Template, plain, "Sabah yürüyüşü"); var after = Assert.Single(await Items(u, day));
        Assert.Equal(before.Id, after.Id); Assert.Equal("Sabah yürüyüşü", (await u.Get(filled.Occurrences[0].TaskId!.Value)).Title);
    }
    [Fact]
    public async Task TurningAutomaticOffRetractsFutureButKeepsTasks()
    {
        var (app, s) = await Start(); await using var _ = app; var rule = new RecurrenceRule(Today, AutoAddToPlan: true); var t = await Routine(s, rule); var day = Today.AddDays(1);
        var made = await Fill(s, t, Today, day); var effect = await Edit(s, made.Template, rule with { AutoAddToPlan = false }); Assert.Equal(1, effect.RetractedDayItemCount);
        Assert.Empty(await Items(s, day)); Assert.Single(await Items(s, Today)); Assert.Equal(TaskState.Pending, (await s.Get(made.Occurrences[1].TaskId!.Value)).State);
    }
    [Fact]
    public async Task MigrationDownAndUpRestoresLinkForSystemItemsAndLeavesUserItemsUnlinked()
    {
        var (app, s) = await Start(); await using var _ = app; var day = Today.AddDays(1); var t = await Routine(s, new(Today, AutoAddToPlan: true));
        var made = await Fill(s, t, day, day); var manual = await s.Root("Elle eklenen");
        var added = await Ok<DayItemView>(await s.Client.PostAsJsonAsync($"/api/daily-plans/{day:yyyy-MM-dd}/items", new { taskId = manual.Id }));
        await using (var db = fixture.CreateContext())
        {
            var migrator = db.GetInfrastructure().GetRequiredService<Microsoft.EntityFrameworkCore.Migrations.IMigrator>();
            await migrator.MigrateAsync("20261030030420_AddProfileNameParts"); await migrator.MigrateAsync();
        }
        await using var after = fixture.CreateContext();
        Assert.Equal(made.Occurrences[0].Id, (await after.DayItems.SingleAsync(x => x.UserId == s.UserId && x.TaskId == made.Occurrences[0].TaskId)).RecurrenceOccurrenceId);
        Assert.Null((await after.DayItems.SingleAsync(x => x.Id == added.Id)).RecurrenceOccurrenceId);
    }
    [Fact]
    public async Task TaskPickerShowsOccurrenceOnlyOnItsOwnDay()
    {
        var (app, s) = await Start(); await using var _ = app; var t = await Routine(s, new(Today), "Rutin seçici"); await Fill(s, t, Today, Today.AddDays(4));
        var view = await Ok<TaskPickerView>(await s.Client.GetAsync($"/api/tasks/picker?date={Today:yyyy-MM-dd}&limit=20"));
        Assert.Equal(1, view.Assigned.Total + view.Other.Total);
        var undated = await Ok<TaskPickerView>(await s.Client.GetAsync("/api/tasks/picker?limit=20")); Assert.Equal(0, undated.Assigned.Total + undated.Other.Total);
    }
}

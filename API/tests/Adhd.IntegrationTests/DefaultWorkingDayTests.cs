using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Planning;
using Adhd.Application.Preferences;
using Adhd.Domain.Planning;
using Adhd.Domain.Preferences;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

public sealed class DefaultWorkingDayTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateOnly Today = new(2026, 10, 15);
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    private static async Task<DayGlanceView> Glance(TaskScenario user, DateOnly date) =>
        await TaskScenario.Read<DayGlanceView>(await user.Client.GetAsync($"/api/daily-plans/{date:yyyy-MM-dd}/glance"));
    private static async Task Set(TaskScenario user, Func<PlanningPreferences, PlanningPreferences> change)
    {
        var p = await TaskScenario.Read<PreferencesSnapshot>(await user.Client.GetAsync("/api/preferences"));
        Assert.Equal(HttpStatusCode.OK, (await user.Client.PutAsJsonAsync("/api/preferences", new { version = p.Version, values = change(p.Values) })).StatusCode);
    }

    [Fact]
    public async Task MissingHoursUseTheRemainderOfTheLocalDayWithoutWritingPreferencesOrPlans()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var user = await TaskScenario.User(app);
        var hours = await TaskScenario.Read<WorkingDay>(await user.Client.GetAsync($"/api/preferences/working-hours?date={Today:yyyy-MM-dd}"));
        Assert.Equal([new MinuteRange(0, 1440)], hours.LocalIntervals);
        Assert.Equal(TimeSpan.FromDays(1), Assert.Single(hours.UtcIntervals).EndsAt - hours.UtcIntervals[0].StartsAt);
        Assert.Equal(15 * 3600m, (await Glance(user, Today)).WorkingRemainingSeconds);
        Assert.Equal(86400m, (await Glance(user, Today.AddDays(1))).WorkingRemainingSeconds);
        Assert.Equal(0m, (await Glance(user, Today.AddDays(-1))).WorkingRemainingSeconds);
        app.Clock.Now = PlanTime.DayStart(Today.AddDays(1), "Europe/Istanbul").AddSeconds(-1);
        Assert.Equal(1m, (await Glance(user, Today)).WorkingRemainingSeconds);
        app.Clock.Now = app.Clock.Now.AddSeconds(1);
        Assert.Equal(0m, (await Glance(user, Today)).WorkingRemainingSeconds);
        Assert.Equal(86400m, (await Glance(user, Today.AddDays(1))).WorkingRemainingSeconds);
        var prefs = await TaskScenario.Read<PreferencesSnapshot>(await user.Client.GetAsync("/api/preferences"));
        Assert.Empty(prefs.Values.Weekly); Assert.Equal(0, prefs.Version);
        await using var db = fixture.CreateContext(); Assert.False(await db.DailyPlans.AnyAsync(x => x.UserId == user.UserId));
    }

    [Fact]
    public async Task ConfiguredHoursAndExplicitDateClosuresKeepTheirMeaning()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var user = await TaskScenario.User(app);
        await Set(user, p => p with { Exceptions = [new(Today, [])] });
        Assert.Equal(0m, (await Glance(user, Today)).WorkingRemainingSeconds);
        await Set(user, p => p with { Exceptions = [new(Today, [new(600, 660)])] });
        Assert.Equal(3600m, (await Glance(user, Today)).WorkingRemainingSeconds);
        await Set(user, p => p with { Weekly = [new(4, 540, 1020)], Exceptions = [] });
        Assert.Equal(8 * 3600m, (await Glance(user, Today)).WorkingRemainingSeconds);
        Assert.Equal(0m, (await Glance(user, Today.AddDays(1))).WorkingRemainingSeconds);
    }

    [Fact]
    public async Task NonWorkingSpecialDaysOverrideDefaultHoursButExplicitDateHoursStillWin()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var user = await TaskScenario.User(app); var other = await TaskScenario.User(app);
        var response = await ManualPlanningTests.Send(user, HttpMethod.Post, "/api/special-days", new {
            title = "Tatil", kind = "Holiday", month = 10, day = 15, year = 2026, recurrence = "Once", nonWorking = true, reminder = "None"
        }, Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(0m, (await Glance(user, Today)).WorkingRemainingSeconds);
        Assert.Equal(15 * 3600m, (await Glance(other, Today)).WorkingRemainingSeconds);
        await Set(user, p => p with { Exceptions = [new(Today, [new(600, 660)])] });
        Assert.Equal(3600m, (await Glance(user, Today)).WorkingRemainingSeconds);
    }

    [Theory]
    [InlineData("2026-03-29", 23)]
    [InlineData("2026-10-25", 25)]
    public async Task DefaultCapacityUsesTheFrozenPlanZoneAndActualDstDayLength(string value, int hours)
    {
        var date = DateOnly.Parse(value);
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = PlanTime.DayStart(date, "Europe/Berlin");
        var user = await TaskScenario.User(app); await Set(user, p => p with { TimeZoneId = "Europe/Berlin" });
        var task = await user.Root(); await user.Define(task.Id, true, 60);
        Assert.Equal(HttpStatusCode.Created, (await user.Client.PostAsJsonAsync($"/api/daily-plans/{date:yyyy-MM-dd}/items", new { taskId = task.Id })).StatusCode);
        await Set(user, p => p with { TimeZoneId = "Europe/Istanbul" });
        var overview = await TaskScenario.Read<DayOverviewView>(await user.Client.GetAsync($"/api/daily-plans/{date:yyyy-MM-dd}/overview"));
        Assert.Equal("Europe/Berlin", overview.Day.TimeZoneId);
        Assert.Equal(hours * 3600m, overview.Glance.WorkingRemainingSeconds);
        Assert.Equal(hours * 3600m, (await Glance(user, date)).WorkingRemainingSeconds);
    }

    [Fact]
    public async Task SchedulingPreviewUsesTheSameDefaultCapacity()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var user = await TaskScenario.User(app); var task = await user.Root(); await user.Define(task.Id, true, 1800);
        var preview = await SchedulingHttpTests.Preview(user, task.Id);
        var block = Assert.Single(preview.Blocks, x => x.TaskId == task.Id);
        Assert.True(block.StartsAt >= Morning);
        Assert.True(block.EndsAt <= PlanTime.DayStart(Today.AddDays(1), "Europe/Istanbul"));
        Assert.Empty(preview.Unplaced);
    }
}

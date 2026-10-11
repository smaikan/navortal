using System.Net;
using Adhd.Application.Planning;
using Adhd.Domain.Focus;
using Adhd.Domain.Jobs;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

public sealed class DaySignalsTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 25, 6, 0, 0, TimeSpan.Zero);
    private static async Task<DaySignalsView> Read(TaskScenario user, bool focus = false)
    {
        var r = await user.Client.GetAsync($"/api/daily-plans/2026-10-25/signals?observeFocus={focus.ToString().ToLowerInvariant()}");
        Assert.Equal(HttpStatusCode.OK, r.StatusCode); return await TaskScenario.Read<DaySignalsView>(r);
    }
    [Fact]
    public async Task EmptySignalsAreReadOnlyAndPassiveWhileExplicitObservationKeepsTheExistingFocusTransition()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var user = await TaskScenario.User(app);
        var empty = await Read(user);
        Assert.Empty(empty.Notifications); Assert.True(empty.Complete); Assert.Null(empty.LastWork);
        Assert.Equal(1800, empty.ReturnThresholdSeconds); Assert.False(empty.FocusIncluded);
        var focus = await FocusTests.Start(user, settings: new(300, 120, 600, 2, FocusTargetBehavior.AutoBreak));
        app.Clock.Now = Morning.AddMinutes(8);
        var passive = await Read(user); Assert.False(passive.FocusIncluded);
        await using (var db = fixture.CreateContext()) Assert.Equal(FocusState.Working, (await db.FocusSessions.SingleAsync(x => x.Id == focus.Id)).State);
        var observed = await Read(user, true);
        Assert.True(observed.FocusIncluded); Assert.Equal(FocusState.Break, observed.Focus!.State);
        Assert.Null(observed.RunningWorkSessionId); Assert.Equal(WorkState.Paused, observed.LastWork!.State);
        Assert.Equal(observed.ServerNow, observed.LastWork.ServerNow);
    }
    [Fact]
    public async Task SignalsContainOnlyActualReadyUnreadReceiptsForThisOwnerAndDay()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var user = await TaskScenario.User(app); var other = await TaskScenario.User(app);
        var task = await user.Root(); await user.Define(task.Id, true, 3600);
        var plan = await ManualPlanningTests.Create(user, task.Id, Morning.AddHours(1), Morning.AddHours(2));
        var block = Assert.Single(plan.Schedules);
        await using (var db = fixture.CreateContext())
        {
            foreach (var (owner, kind, state, read) in new[] {
                (user.UserId, "ScheduleStart", NotificationIntentState.Ready, false),
                (user.UserId, "ScheduleEnd", NotificationIntentState.Pending, false),
                (user.UserId, "ScheduleEnd", NotificationIntentState.Ready, true),
                (user.UserId, "Custom", NotificationIntentState.Ready, false),
                (other.UserId, "ScheduleStart", NotificationIntentState.Ready, false) })
                db.NotificationIntents.Add(new() { Id = Guid.CreateVersion7(), UserId = owner, Kind = kind,
                    SourceId = block.Id, SourceKey = Guid.NewGuid().ToString(), OccurredAt = Morning, CreatedAt = Morning,
                    State = state, ReadAt = read ? Morning : null, ReadyAt = state == NotificationIntentState.Ready ? Morning : null });
            await db.SaveChangesAsync();
        }
        var result = await Read(user);
        Assert.Equal("ScheduleStart", Assert.Single(result.Notifications).Kind);
        Assert.Empty((await Read(other)).Notifications);
        Assert.True(result.Complete);
        Assert.Equal(HttpStatusCode.BadRequest, (await user.Client.GetAsync("/api/daily-plans/2026-10-25/signals?observeFocus=wrong")).StatusCode);
    }
    [Fact]
    public async Task ReceiptLimitReportsIncompleteCoverageInsteadOfClaimingNotificationAbsence()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var user = await TaskScenario.User(app); var task = await user.Root(); await user.Define(task.Id, true, 3600);
        var plan = await ManualPlanningTests.Create(user, task.Id, Morning.AddHours(1), Morning.AddHours(2)); var block = Assert.Single(plan.Schedules);
        await using (var db = fixture.CreateContext())
        {
            for (var i = 0; i < 1001; i++) db.NotificationIntents.Add(new() { Id = Guid.CreateVersion7(), UserId = user.UserId,
                Kind = "ScheduleStart", SourceId = block.Id, SourceKey = Guid.NewGuid().ToString(), OccurredAt = Morning,
                CreatedAt = Morning, State = NotificationIntentState.Ready, ReadyAt = Morning });
            await db.SaveChangesAsync();
        }
        var result = await Read(user); Assert.False(result.Complete); Assert.Equal(1000, result.Notifications.Length);
    }
}

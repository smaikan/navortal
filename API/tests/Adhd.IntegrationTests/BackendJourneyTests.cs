using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Analytics;
using Adhd.Application.Calendar;
using Adhd.Application.Collections;
using Adhd.Application.Focus;
using Adhd.Application.Planning;
using Adhd.Application.Preferences;
using Adhd.Application.Scheduling;
using Adhd.Application.Support;
using Adhd.Application.Tasks;
using Adhd.Application.Work;
using Adhd.Domain.Jobs;
using Adhd.Domain.Planning;
using Adhd.Domain.Preferences;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;

public sealed class BackendJourneyTests
{
    private static async Task<FocusView> FocusChange(TaskScenario user, FocusView f, string operation)
    {
        var response = await Send(user, HttpMethod.Post, $"/api/focus-sessions/{f.Id}/{operation}", new { version = f.Version, workSessionVersion = f.WorkSessionVersion });
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync()); return await TaskScenario.Read<FocusView>(response);
    }
    private static async Task Classify(TaskScenario user, Guid task, Guid pool, Guid project)
    {
        var c = await TaskScenario.Read<ClassificationView>(await user.Client.GetAsync($"/api/tasks/{task}/classification"));
        var response = await user.Client.PutAsJsonAsync($"/api/tasks/{task}/classification", new { version = c.Version, expectedPlanningVersion = c.PlanningVersion, projectId = project, poolId = pool, tagIds = Array.Empty<Guid>() }); Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
    }
    [Fact]
    public async Task TreePlanFocusNotesRestartCompletionAndHistoricalRevisionShareOneConsistentWorkRecord()
    {
        await using var s = await JobScenario.Create(); var now = s.App.Clock.Now; await SchedulingHttpTests.Configure(s.User, end: 900);
        var pool = await TaskScenario.Read<NamedResourceView>(await s.User.Client.PostAsJsonAsync("/api/pools", new { name = "Uzun vade" })); var project = await TaskScenario.Read<NamedResourceView>(await s.User.Client.PostAsJsonAsync("/api/projects", new { name = "Ürün" }));
        var root = await s.User.Root("Ana iş"); await s.User.Define(root.Id, false, budget: 43200); await Classify(s.User, root.Id, pool.Id, project.Id);
        var a = await s.User.Child(root.Id, "Adım A"); await s.User.Define(a.Id, true, 3600); var b = await s.User.Child(root.Id, "Adım B"); await s.User.Define(b.Id, false);
        var b1 = await s.User.Child(b.Id, "B1"); await s.User.Define(b1.Id, true, 900); var b2 = await s.User.Child(b.Id, "B2"); await s.User.Define(b2.Id, true, 900); var c = await s.User.Child(root.Id, "Adım C"); await s.User.Define(c.Id, true, 1800);
        await Create(s.User, null, now.AddHours(2), now.AddHours(2.5), "Break", isFixed: true);
        var proposal = await SchedulingHttpTests.Preview(s.User, root.Id); Assert.True((await SchedulingHttpTests.Apply(s.User, proposal.ProposalId)).IsSuccessStatusCode); var originalDay = await Day(s.User);
        var items = await TaskScenario.Read<RevisionItemPage>(await s.User.Client.GetAsync($"/api/plan-revisions/{originalDay.CurrentRevisionId}/items")); var planned = Assert.Single(items.Items, x => x.Schedule.TaskId == a.Id);
        var started = await Send(s.User, HttpMethod.Post, "/api/work-sessions/start", new { taskId = a.Id, scheduleId = planned.Schedule.Id, scheduleVersion = planned.Schedule.Version }); Assert.True(started.IsSuccessStatusCode, await started.Content.ReadAsStringAsync()); var work = await TaskScenario.Read<WorkView>(started);
        var focusResponse = await Send(s.User, HttpMethod.Post, "/api/focus-sessions", new { workSessionId = work.Id, workSessionVersion = work.Version, settings = new { workSeconds = 2100, shortBreakSeconds = 420 } }); Assert.Equal(HttpStatusCode.Created, focusResponse.StatusCode); var f = await TaskScenario.Read<FocusView>(focusResponse);
        s.App.Clock.Now = now.AddMinutes(35); f = await TaskScenario.Read<FocusView>(await s.User.Client.GetAsync($"/api/focus-sessions/{f.Id}")); await s.Pump();
        await using (var db = s.Context()) { Assert.Equal(NotificationIntentState.Ready, (await db.NotificationIntents.SingleAsync(x => x.UserId == s.User.UserId && x.Kind == "FocusTarget")).State); }
        s.App.Clock.Now = now.AddMinutes(40); f = await TaskScenario.Read<FocusView>(await s.User.Client.GetAsync($"/api/focus-sessions/{f.Id}")); Assert.Equal(300m, f.OvertimeSeconds);
        f = await FocusChange(s.User, f, "break"); var note = await s.User.Client.PostAsJsonAsync("/api/notes", new { kind = "NextStep", text = "Kontrol listesinden devam", taskId = a.Id, workSessionId = work.Id }); Assert.True(note.IsSuccessStatusCode);
        s.App.Clock.Now = now.AddMinutes(47); f = await TaskScenario.Read<FocusView>(await s.User.Client.GetAsync($"/api/focus-sessions/{f.Id}")); f = await FocusChange(s.User, f, "next"); Assert.Equal(work.Id, f.WorkSessionId);
        await s.Restart(now.AddMinutes(52)); Assert.Equal(HttpStatusCode.OK, (await s.User.Client.GetAsync("/api/auth/me")).StatusCode);
        var recovered = await TaskScenario.Read<CurrentWork>(await s.User.Client.GetAsync("/api/work-sessions/current")); Assert.Equal(work.Id, recovered.ActiveSession!.Id); Assert.Equal(2700m, recovered.ActiveSession.ActiveSeconds); Assert.Equal(planned.Id, recovered.ActiveSession.StartedRevisionItemId);
        Assert.Equal(originalDay.CurrentRevisionId, (await Day(s.User)).CurrentRevisionId); var context = await TaskScenario.Read<ReturnContext>(await s.User.Client.GetAsync($"/api/tasks/{root.Id}/return-context")); Assert.Equal(a.Id, context.LastWork!.TaskId); Assert.Equal("Kontrol listesinden devam", context.NextStepNote!.Text);
        var actual = await TaskScenario.Read<ActualAnalyticsView>(await s.User.Client.GetAsync("/api/analytics/actual?fromDate=2026-10-15&toDate=2026-10-15&bucket=Week")); Assert.Equal(2700m, actual.Totals.WorkSeconds); Assert.Equal(2700m, actual.Totals.Focus.ActiveSeconds); Assert.Equal(300m, actual.Totals.Focus.OvertimeSeconds); Assert.Equal(1, actual.Totals.SessionCount);
        Assert.Equal(2700m, (await TaskScenario.Read<TaskTimeView>(await s.User.Client.GetAsync($"/api/tasks/{root.Id}/time"))).SubtreeActualSeconds);
        await s.User.State(a.Id, TaskAction.Complete); var closed = await TaskScenario.Read<WorkView>(await s.User.Client.GetAsync($"/api/work-sessions/{work.Id}")); Assert.Equal(WorkState.Finished, closed.State); Assert.Equal(2700m, closed.ActiveSeconds); Assert.Equal(work.StartedRevisionItemId, closed.StartedRevisionItemId);
        a = await s.User.Get(a.Id); await s.User.Client.PutAsJsonAsync($"/api/tasks/{a.Id}", new { version = a.Version, title = "Yeni ad" }); Assert.Equal("Adım A", (await TaskScenario.Read<WorkView>(await s.User.Client.GetAsync($"/api/work-sessions/{work.Id}"))).TaskAtStart!.Title);
        var after = await Day(s.User); Assert.Equal(originalDay.BaselineRevisionId, after.BaselineRevisionId); Assert.NotEqual(originalDay.CurrentRevisionId, after.CurrentRevisionId);
        var historical = await TaskScenario.Read<CalendarDayView>(await s.User.Client.GetAsync($"/api/calendar/days/2026-10-15?revisionId={originalDay.BaselineRevisionId}")); Assert.Equal(2700m, historical.Summary.ActualSeconds); Assert.Contains(historical.Plan.Items, x => x.Schedule.TaskId == a.Id && x.Schedule.TaskSnapshot!.Task.Title == "Adım A");
    }
    [Fact]
    public async Task PoolTwelveHourWorkUsesSameTaskAcrossFutureMonthAndEditingDoesNotEraseActualOrCopyTask()
    {
        await using var s = await JobScenario.Create(); var now = s.App.Clock.Now; var pool = await TaskScenario.Read<NamedResourceView>(await s.User.Client.PostAsJsonAsync("/api/pools", new { name = "Havuz" })); var project = await TaskScenario.Read<NamedResourceView>(await s.User.Client.PostAsJsonAsync("/api/projects", new { name = "12 saatlik proje" }));
        var task = await s.User.Root(); await s.User.Define(task.Id, true, 43200); await Classify(s.User, task.Id, pool.Id, project.Id);
        s.App.Clock.Now = now.AddHours(1); var manual = await Send(s.User, HttpMethod.Post, "/api/work-sessions/manual", new { taskId = task.Id, startedAt = now, endedAt = s.App.Clock.Now, reason = "Ön çalışma" }); Assert.True(manual.IsSuccessStatusCode);
        var prefs = await TaskScenario.Read<PreferencesSnapshot>(await s.User.Client.GetAsync("/api/preferences")); var dates = new[] { new DateOnly(2026, 11, 2), new(2026, 11, 3), new(2026, 11, 6) }; var minutes = new[] { 90, 60, 120 };
        Assert.True((await s.User.Client.PutAsJsonAsync("/api/preferences", new { version = prefs.Version, values = prefs.Values with { Weekly = [], Exceptions = dates.Select((d, i) => new DateOverride(d, [new(540, 540 + minutes[i])])).ToArray() } })).IsSuccessStatusCode);
        var response = await s.User.Client.PostAsJsonAsync("/api/scheduling/distribute-preview", new { fromDate = dates[0], toDate = dates[2], taskIds = new[] { task.Id } }); Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync()); var preview = await TaskScenario.Read<DistributionPreviewView>(response); Assert.True(preview.CanApply); Assert.Equal(23400m, Assert.Single(preview.Unplaced).RemainingSeconds);
        Assert.True((await Send(s.User, HttpMethod.Post, "/api/scheduling/distribute-apply", new { proposalId = preview.ProposalId })).IsSuccessStatusCode);
        var from = PlanTime.DayStart(dates[0], "Europe/Istanbul"); var to = PlanTime.DayStart(dates[2].AddDays(1), "Europe/Istanbul"); var schedules = await TaskScenario.Read<SchedulePage>(await s.User.Client.GetAsync("/api/schedules?" + Range(from, to))); Assert.Equal(3, schedules.Total); Assert.All(schedules.Items, x => Assert.Equal(task.Id, x.TaskId));
        var middle = schedules.Items.Single(x => PlanTime.Date(x.StartsAt, "Europe/Istanbul") == dates[1]); Assert.True((await Change(s.User, middle, end: middle.StartsAt.AddMinutes(30))).IsSuccessStatusCode); Assert.Equal(TimeSpan.FromMinutes(30), (await TaskScenario.Read<ScheduleView>(await s.User.Client.GetAsync($"/api/schedules/{middle.Id}"))).EndsAt - middle.StartsAt);
        var time = await TaskScenario.Read<TaskTimeView>(await s.User.Client.GetAsync($"/api/tasks/{task.Id}/time")); Assert.Equal(3600m, time.DirectActualSeconds); Assert.Equal(39600m, time.RemainingSeconds); Assert.Equal(TaskState.Pending, (await s.User.Get(task.Id)).State);
        await using var db = s.Context(); Assert.Equal(1, await db.Tasks.CountAsync(x => x.UserId == s.User.UserId)); Assert.Equal(project.Id, (await s.User.Get(task.Id)).ProjectId);
        var foreign = await TaskScenario.User(s.App); Assert.Equal(HttpStatusCode.NotFound, (await foreign.Client.GetAsync($"/api/schedules/{middle.Id}")).StatusCode);
    }
}

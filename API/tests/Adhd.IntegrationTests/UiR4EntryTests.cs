using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Planning;
using Adhd.Application.Work;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

public sealed class UiR4EntryTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private const string Day="2026-10-26";
    private static readonly DateTimeOffset Now=new(2026,10,26,9,17,30,TimeSpan.Zero);
    private static async Task<long> Version(TaskScenario s) => (await TaskScenario.Read<DailyPlanView>(await s.Client.GetAsync($"/api/daily-plans/{Day}"))).PlanningVersion;
    private static async Task<HttpResponseMessage> Add(TaskScenario s,object body,string key) {
        var r=new HttpRequestMessage(HttpMethod.Post,$"/api/daily-plans/{Day}/entries");r.Headers.Add("Idempotency-Key",key);r.Content=JsonContent.Create(body);return await s.Client.SendAsync(r);
    }
    [Fact]
    public async Task PriorityEnergyAndUrgentDateAreAvailableWithoutPerRowTaskRequests()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=Now;var s=await TaskScenario.User(app);
        var added=await TaskScenario.Read<PlanEntryResult>(await Add(s,new {title="Çipli iş",priority="High",energyDemand="Low",isUrgent=true,expectedPlanningVersion=await Version(s)},Guid.NewGuid().ToString()));
        Assert.Equal(Adhd.Domain.Tasks.TaskPriority.High,added.Item.Priority);Assert.Equal(Adhd.Domain.Support.EnergyLevel.Low,added.Item.EnergyDemand);
        var glance=await TaskScenario.Read<DayGlanceView>(await s.Client.GetAsync($"/api/daily-plans/{Day}/glance"));
        var hint=Assert.Single(glance.Hints);Assert.Equal(added.Item.Priority,hint.Priority);Assert.Equal(added.Item.EnergyDemand,hint.EnergyDemand);
        var summary=await TaskScenario.Read<Adhd.Application.Tasks.TreeRowSummary>(await s.Client.GetAsync($"/api/tasks/{added.Item.TaskId}/summary"));
        Assert.Equal(new DateOnly(2026,10,26),summary.UrgentPlanDate);
        var detail=await TaskScenario.Read<Adhd.Application.Tasks.TaskDetailView>(await s.Client.GetAsync($"/api/tasks/{added.Item.TaskId}/detail-view"));Assert.Equal(summary,detail.RowSummary);
    }
    [Fact]
    public async Task UrgentAddsAtomicallyWithNoWorkAndReplayAndUndoPreserveIdentity()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=Now;var s=await TaskScenario.User(app);
        var body=new {title="Beklenmeyen iş",isUrgent=true,expectedPlanningVersion=await Version(s)};var key=Guid.NewGuid().ToString();
        var response=await Add(s,body,key);Assert.Equal(HttpStatusCode.OK,response.StatusCode);
        var first=await TaskScenario.Read<PlanEntryResult>(response);Assert.True(first.Item.IsUrgent);Assert.Equal(Now.AddSeconds(-30),first.Item.StartsAt);Assert.Null(first.Item.EndsAt);
        var replay=await TaskScenario.Read<PlanEntryResult>(await Add(s,body,key));Assert.True(replay.Replayed);Assert.Equal(first.Item,replay.Item);
        await using var db=fixture.CreateContext();Assert.Equal(1,await db.Tasks.CountAsync(x=>x.UserId==s.UserId));Assert.Equal(1,await db.DayItems.CountAsync(x=>x.UserId==s.UserId));Assert.False(await db.WorkSessions.AnyAsync(x=>x.UserId==s.UserId));
        var glance=await TaskScenario.Read<DayGlanceView>(await s.Client.GetAsync($"/api/daily-plans/{Day}/glance"));Assert.Equal(1,glance.UnknownEstimateCount);Assert.Equal(0,glance.PlannedRemainingSeconds);
        Assert.Equal(HttpStatusCode.Conflict,(await Add(s,new {title="Başka niyet",isUrgent=true,expectedPlanningVersion=await Version(s)},key)).StatusCode);
        var undone=await s.Client.PostAsJsonAsync("/api/day-items/undo",new {changeSetId=first.Item.ChangeSetId,expectedPlanningVersion=await Version(s)});Assert.Equal(HttpStatusCode.OK,undone.StatusCode);
        Assert.True((await TaskScenario.Read<PlanEntryResult>(await Add(s,body,key))).Replayed);
        Assert.Equal(1,await db.Tasks.CountAsync(x=>x.UserId==s.UserId));
    }
    [Fact]
    public async Task UrgentTimeCanOverlapWhileOrdinaryConflictAndOwnerAndStaleChecksRemain()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=Now;var s=await TaskScenario.User(app);var other=await TaskScenario.User(app);
        var task=await s.Root("Normal plan");
        var schedule=new HttpRequestMessage(HttpMethod.Post,"/api/schedules");schedule.Headers.Add("Idempotency-Key",Guid.NewGuid().ToString());
        schedule.Content=JsonContent.Create(new {localDate=Day,taskId=task.Id,kind="Work",startsAt=Now.AddHours(1),endsAt=Now.AddHours(2),expectedPlanningVersion=await Version(s)});
        Assert.Equal(HttpStatusCode.Created,(await s.Client.SendAsync(schedule)).StatusCode);
        var urgent=await TaskScenario.Read<PlanEntryResult>(await Add(s,new {title="Acil plan",isUrgent=true,expectedPlanningVersion=await Version(s)},Guid.NewGuid().ToString()));
        var fields=new {version=urgent.Item.Version,expectedPlanningVersion=await Version(s),startsAt=Now.AddHours(1),endsAt=Now.AddHours(2)};
        var changed=await s.Client.PutAsJsonAsync($"/api/day-items/{urgent.Item.Id}/time",fields);Assert.Equal(HttpStatusCode.OK,changed.StatusCode);
        var item=await TaskScenario.Read<DayItemView>(changed);Assert.NotNull(item.EndsAt);Assert.True(item.IsUrgent);
        Assert.Equal(HttpStatusCode.BadRequest,(await s.Client.PutAsJsonAsync($"/api/day-items/{item.Id}/time",new{version=item.Version,expectedPlanningVersion=await Version(s)})).StatusCode);
        var calendar=await TaskScenario.Read<Adhd.Application.Calendar.CalendarRangeView>(await s.Client.GetAsync($"/api/calendar?fromDate={Day}&toDate={Day}"));
        Assert.Equal(7200,Assert.Single(calendar.Days).PlannedWorkSeconds);

        Assert.Equal(HttpStatusCode.Conflict,(await s.Client.PutAsJsonAsync($"/api/day-items/{item.Id}/time",fields)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await other.Client.PutAsJsonAsync($"/api/day-items/{item.Id}/time",new {version=item.Version,expectedPlanningVersion=await Version(other),startsAt=Now})).StatusCode);
        var normal=new HttpRequestMessage(HttpMethod.Post,"/api/schedules");normal.Headers.Add("Idempotency-Key",Guid.NewGuid().ToString());normal.Content=JsonContent.Create(new {localDate=Day,taskId=task.Id,kind="Work",startsAt=Now.AddHours(1),endsAt=Now.AddHours(2),allowConflicts=false,expectedPlanningVersion=await Version(s)});
        Assert.Equal(HttpStatusCode.Conflict,(await s.Client.SendAsync(normal)).StatusCode);
        var undo=await s.Client.PostAsJsonAsync("/api/day-items/undo",new {changeSetId=item.ChangeSetId,expectedPlanningVersion=await Version(s)});Assert.Equal(HttpStatusCode.OK,undo.StatusCode);
        var restored=Assert.Single((await TaskScenario.Read<DayItemBatchResult>(undo)).Items);Assert.Null(restored.EndsAt);Assert.Equal(urgent.Item.StartsAt,restored.StartsAt);
    }
    [Fact]
    public async Task AddingUrgentNeverInterruptsActiveWorkAndInvalidIntentRollsBack()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=Now;var s=await TaskScenario.User(app);
        var task=await s.Root("Çalışılan iş");var start=new HttpRequestMessage(HttpMethod.Post,"/api/work-sessions/start");start.Headers.Add("Idempotency-Key",Guid.NewGuid().ToString());start.Content=JsonContent.Create(new {taskId=task.Id});
        var running=await TaskScenario.Read<WorkView>(await s.Client.SendAsync(start));
        var result=await Add(s,new {title="Sonra bakılacak acil iş",isUrgent=true,expectedPlanningVersion=await Version(s)},Guid.NewGuid().ToString());Assert.Equal(HttpStatusCode.OK,result.StatusCode);
        var current=await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{running.Id}"));Assert.Equal(WorkState.Running,current.State);Assert.Equal(running.Version,current.Version);
        Assert.Equal(HttpStatusCode.BadRequest,(await Add(s,new {title="Geçersiz",taskId=task.Id,isUrgent=true,expectedPlanningVersion=await Version(s)},Guid.NewGuid().ToString())).StatusCode);
        await using var db=fixture.CreateContext();Assert.Equal(2,await db.Tasks.CountAsync(x=>x.UserId==s.UserId));Assert.Equal(1,await db.WorkSessions.CountAsync(x=>x.UserId==s.UserId));
    }
}

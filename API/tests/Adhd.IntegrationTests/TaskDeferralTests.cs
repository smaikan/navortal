using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Planning;
using Adhd.Domain.Planning;
using Adhd.Application.Recurrence;
using Adhd.Domain.Recurrence;
using Microsoft.EntityFrameworkCore;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;
public sealed class TaskDeferralTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Now = new(2026,10,15,6,0,0,TimeSpan.Zero);
    private const string Route = "/api/calendar/days/2026-10-15/defer-tasks";
    private static async Task<DayItemView> Item(TaskScenario s,Guid task,string date="2026-10-15") => await TaskScenario.Read<DayItemView>(await s.Client.PostAsJsonAsync($"/api/daily-plans/{date}/items",new{taskId=task}));
    private static object Body(long version,Guid a,Guid b,string target="2026-10-17")=>new{expectedPlanningVersion=version,tasks=new[]{new{taskId=a,targetDate="2026-10-16"},new{taskId=b,targetDate=target}}};
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task RoutineTasksArePageScopedAndNeitherDeferralRouteCanMoveThemOrPartiallyMoveNormalTasks(bool timed)
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=Now;var s=await TaskScenario.User(app);
        var normal=await s.Root("Normal görev");await s.Define(normal.Id,true,600);var normalItem=await Item(s,normal.Id);
        var jsonOptions=new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web);jsonOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
        var creation=await Send(s,HttpMethod.Post,"/api/recurrence-templates",System.Text.Json.JsonSerializer.SerializeToElement(new RecurrenceCreate(new(new(2026,10,15)),new("Rutin görev",EstimatedSeconds:600)),jsonOptions));Assert.True(creation.StatusCode==HttpStatusCode.Created,await creation.Content.ReadAsStringAsync());
        var created=await TaskScenario.Read<RecurrenceEffect>(creation);
        var materialized=await Send(s,HttpMethod.Post,$"/api/recurrence-templates/{created.Template.Id}/materialize",new MaterializeRecurrence(created.Template.Version,new(2026,10,15),new(2026,10,15)));Assert.True(materialized.StatusCode==HttpStatusCode.OK,await materialized.Content.ReadAsStringAsync());
        var generated=await TaskScenario.Read<RecurrenceEffect>(materialized);
        var routine=Assert.Single(generated.Occurrences).TaskId!.Value;
        ScheduleView? block=null;DayItemView? item=null;
        if(timed)block=Assert.Single((await Create(s,routine,Now.AddHours(1),Now.AddHours(2))).Schedules);else item=await Item(s,routine);
        var overview=await TaskScenario.Read<DayOverviewView>(await s.Client.GetAsync("/api/daily-plans/2026-10-15/overview"));
        Assert.Equal(new[]{routine},overview.RecurringTaskIds);Assert.DoesNotContain(normal.Id,overview.RecurringTaskIds);
        if(!timed){var first=await TaskScenario.Read<DayOverviewView>(await s.Client.GetAsync("/api/daily-plans/2026-10-15/overview?ItemLimit=1"));Assert.Empty(first.RecurringTaskIds);var next=await TaskScenario.Read<DayOverviewView>(await s.Client.GetAsync("/api/daily-plans/2026-10-15/overview?ItemLimit=1&ItemOffset=1"));Assert.Equal(new[]{routine},next.RecurringTaskIds);}
        var version=(await Day(s)).PlanningVersion;var key=Guid.NewGuid().ToString();
        var result=await Send(s,HttpMethod.Post,Route,Body(version,normal.Id,routine),key);Assert.Equal(HttpStatusCode.Conflict,result.StatusCode);Assert.Contains("defer_recurring_task",await result.Content.ReadAsStringAsync());
        var oldBody=new{targetDate="2026-10-16",expectedPlanningVersion=version,schedules=block is null?Array.Empty<object>():new object[]{new{id=block.Id,version=block.Version}},items=item is null?new object[]{new{id=normalItem.Id,version=normalItem.Version}}:new object[]{new{id=normalItem.Id,version=normalItem.Version},new{id=item.Id,version=item.Version}},allowProtectedChange=true};
        var preview=await TaskScenario.Read<DayDeferralPreview>(await s.Client.PostAsJsonAsync("/api/calendar/days/2026-10-15/defer-preview",oldBody));Assert.False(preview.CanApply);Assert.Contains(preview.Issues,x=>x.Code=="defer_recurring_task");
        Assert.Equal(HttpStatusCode.Conflict,(await Send(s,HttpMethod.Post,"/api/calendar/days/2026-10-15/defer",oldBody)).StatusCode);
        Assert.Equal(version,(await Day(s)).PlanningVersion);await using var db=fixture.CreateContext();Assert.False(await db.IdempotencyRecords.AnyAsync(x=>x.UserId==s.UserId&&x.Key==key));Assert.False(await db.DayItems.AnyAsync(x=>x.UserId==s.UserId&&x.LocalDate!=new DateOnly(2026,10,15)));Assert.Equal(new DateOnly(2026,10,15),(await db.RecurrenceOccurrences.SingleAsync(x=>x.TaskId==routine)).LocalDate);
        if(block is not null)Assert.Equal(ScheduleState.Planned,(await db.TaskSchedules.SingleAsync(x=>x.Id==block.Id)).State);
    }
    [Theory]
    [InlineData("{\"tasks\":[null],\"expectedPlanningVersion\":0}")]
    [InlineData("{\"tasks\":[],\"expectedPlanningVersion\":0}")]
    [InlineData("{\"tasks\":[{\"taskId\":\"00000000-0000-0000-0000-000000000000\",\"targetDate\":\"2026-10-16\"}],\"expectedPlanningVersion\":0}")]
    public async Task InvalidSelectionsReturnValidationWithoutWriting(string json)
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);var s=await TaskScenario.User(app);
        using var request=new HttpRequestMessage(HttpMethod.Post,Route){Content=new StringContent(json,System.Text.Encoding.UTF8,"application/json")};request.Headers.Add("Idempotency-Key",Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.BadRequest,(await s.Client.SendAsync(request)).StatusCode);
        await using var db=fixture.CreateContext();Assert.False(await db.PlanRevisions.AnyAsync(x=>x.UserId==s.UserId));Assert.False(await db.IdempotencyRecords.AnyAsync(x=>x.UserId==s.UserId));
    }
    [Fact]
    public async Task SeparateDatesExpandAllSourcePartsDeduplicateTargetsReplayAndUndoAsOneGroup()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=Now;var s=await TaskScenario.User(app);
        var a=await s.Root("Saatli" );var b=await s.Root("Saatsiz");await s.Define(a.Id,true,600);await s.Define(b.Id,true,600);
        var one=Assert.Single((await Create(s,a.Id,Now.AddHours(1),Now.AddHours(2))).Schedules);
        var two=Assert.Single((await Create(s,a.Id,Now.AddHours(3),Now.AddHours(4))).Schedules);
        var original=await Item(s,b.Id);var existing=await Item(s,b.Id,"2026-10-17");
        var taskA=await s.Get(a.Id);var taskB=await s.Get(b.Id);var version=(await Day(s)).PlanningVersion;var body=Body(version,a.Id,b.Id);var key=Guid.NewGuid().ToString();
        var result=await TaskScenario.Read<DayDeferralResult>(await Send(s,HttpMethod.Post,Route,body,key));
        Assert.Equal(version+1,result.PlanningVersion);Assert.Equal(2,result.Schedules.Length);Assert.Equal(2,result.Items.Length);Assert.Equal(2,result.RevisionIds.Length);
        Assert.All(result.Schedules,x=>Assert.Equal(ScheduleState.Removed,x.State));
        Assert.Equal(new DateOnly(2026,10,16),result.Items.Single(x=>x.TaskId==a.Id).LocalDate);
        Assert.Equal(existing.Id,result.Items.Single(x=>x.TaskId==b.Id).Id);Assert.Equal(existing.Version,result.Items.Single(x=>x.TaskId==b.Id).Version);
        Assert.Equal(taskA,await s.Get(a.Id));Assert.Equal(taskB,await s.Get(b.Id));
        var replay=await Send(s,HttpMethod.Post,Route,body,key);Assert.True(replay.Headers.Contains("Idempotent-Replay"));Assert.Equal(result.ChangeSetId,(await TaskScenario.Read<DayDeferralResult>(replay)).ChangeSetId);
        Assert.Equal(HttpStatusCode.OK,(await s.Client.PostAsJsonAsync("/api/day-items/undo",new{changeSetId=result.ChangeSetId,expectedPlanningVersion=result.PlanningVersion})).StatusCode);
        await using var db=fixture.CreateContext();
        Assert.Equal(ScheduleState.Planned,(await db.TaskSchedules.AsNoTracking().SingleAsync(x=>x.Id==one.Id)).State);
        Assert.Equal(ScheduleState.Planned,(await db.TaskSchedules.AsNoTracking().SingleAsync(x=>x.Id==two.Id)).State);
        Assert.Equal(DayItemState.Planned,(await db.DayItems.AsNoTracking().SingleAsync(x=>x.Id==original.Id)).State);
        Assert.Equal(existing.Version,(await db.DayItems.AsNoTracking().SingleAsync(x=>x.Id==existing.Id)).Version);
        Assert.False(await db.WorkSessions.AnyAsync(x=>x.UserId==s.UserId));
    }
    [Theory]
    [InlineData("protected",HttpStatusCode.Conflict)]
    [InlineData("running",HttpStatusCode.Conflict)]
    [InlineData("foreign",HttpStatusCode.NotFound)]
    [InlineData("completed",HttpStatusCode.NotFound)]
    [InlineData("stale",HttpStatusCode.Conflict)]
    [InlineData("target",HttpStatusCode.BadRequest)]
    public async Task InvalidSecondTaskNeverMovesTheFirst(string boundary,HttpStatusCode expected)
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=Now;var s=await TaskScenario.User(app);
        var a=await s.Root();var b=await s.Root();await s.Define(a.Id,true,600);await s.Define(b.Id,true,600);
        var source=await Item(s,a.Id);var block=Assert.Single((await Create(s,b.Id,Now.AddHours(1),Now.AddHours(2),isFixed:boundary=="protected")).Schedules);
        if(boundary=="running")Assert.Equal(HttpStatusCode.Created,(await Send(s,HttpMethod.Post,"/api/work-sessions/start",new{taskId=b.Id})).StatusCode);
        if(boundary=="completed")Assert.Equal(HttpStatusCode.OK,(await s.Client.PostAsJsonAsync($"/api/schedules/{block.Id}/complete",new{version=block.Version})).StatusCode);
        var selected=b.Id;if(boundary=="foreign"){var other=await TaskScenario.User(app);selected=(await other.Root()).Id;}
        var version=(await Day(s)).PlanningVersion;var key=Guid.NewGuid().ToString();
        Assert.Equal(expected,(await Send(s,HttpMethod.Post,Route,Body(boundary=="stale"?version-1:version,a.Id,selected,boundary=="target"?"2026-10-15":"2026-10-17"),key)).StatusCode);
        await using var db=fixture.CreateContext();Assert.Equal(DayItemState.Planned,(await db.DayItems.AsNoTracking().SingleAsync(x=>x.Id==source.Id)).State);
        Assert.Equal(version,(await Day(s)).PlanningVersion);Assert.False(await db.IdempotencyRecords.AnyAsync(x=>x.UserId==s.UserId&&x.Key==key));
        Assert.False(await db.DayItems.AnyAsync(x=>x.UserId==s.UserId&&x.LocalDate==new DateOnly(2026,10,16)));
    }
    [Fact]
    public async Task SecondTargetSqlFailureRollsBackFirstTargetAndReceiptAndOriginalKeyCanRetry()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=Now;var s=await TaskScenario.User(app);
        var a=await s.Root();var b=await s.Root();await s.Define(a.Id,true,600);await s.Define(b.Id,true,600);var one=await Item(s,a.Id);var two=await Item(s,b.Id);
        var version=(await Day(s)).PlanningVersion;var body=Body(version,a.Id,b.Id);var key=Guid.NewGuid().ToString();
        await using var db=fixture.CreateContext();
        await db.Database.ExecuteSqlRawAsync("CREATE FUNCTION reject_task_defer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.\"LocalDate\"='2026-10-17' THEN RAISE EXCEPTION 'owned second target failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_task_defer BEFORE INSERT OR UPDATE ON day_items FOR EACH ROW EXECUTE FUNCTION reject_task_defer();");
        try{Assert.Equal(HttpStatusCode.InternalServerError,(await Send(s,HttpMethod.Post,Route,body,key)).StatusCode);}
        finally{await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_task_defer ON day_items; DROP FUNCTION reject_task_defer();");}
        Assert.Equal(version,(await Day(s)).PlanningVersion);Assert.Equal(DayItemState.Planned,(await db.DayItems.AsNoTracking().SingleAsync(x=>x.Id==one.Id)).State);Assert.Equal(DayItemState.Planned,(await db.DayItems.AsNoTracking().SingleAsync(x=>x.Id==two.Id)).State);
        Assert.False(await db.DayItems.AnyAsync(x=>x.UserId==s.UserId&&x.LocalDate!=new DateOnly(2026,10,15)));Assert.False(await db.IdempotencyRecords.AnyAsync(x=>x.UserId==s.UserId&&x.Key==key));
        Assert.Equal(HttpStatusCode.OK,(await Send(s,HttpMethod.Post,Route,body,key)).StatusCode);
    }
}

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Adhd.Application.Planning;
using Adhd.Application.Recurrence;
using Adhd.Domain.Recurrence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

public sealed class UiR4RecurrenceTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateOnly Today=new(2026,10,26);
    private static readonly DateTimeOffset Morning=new(2026,10,26,6,0,0,TimeSpan.Zero);
    private static readonly JsonSerializerOptions Json=new(JsonSerializerDefaults.Web){Converters={new JsonStringEnumConverter()}};
    private static Task<HttpResponseMessage> Send(TaskScenario s,string path,object body,string? key=null)=>ManualPlanningTests.Send(s,HttpMethod.Post,path,JsonSerializer.SerializeToElement(body,Json),key);
    private static async Task<RecurrenceTemplateView> Template(TaskScenario s,RecurrenceRule rule,long? seconds=null) =>
        (await TaskScenario.Read<RecurrenceEffect>(await Send(s,"/api/recurrence-templates",new RecurrenceCreate(rule,new("Otomatik seri",EstimatedSeconds:seconds))))).Template;
    private static Task<HttpResponseMessage> Materialize(TaskScenario s,RecurrenceTemplateView t,DateOnly? day=null,string? key=null)=>Send(s,$"/api/recurrence-templates/{t.Id}/materialize",new MaterializeRecurrence(t.Version,day??Today,day??Today),key);
    [Fact]
    public async Task StartWithoutEstimateIsOpenEndedAndReplayNeverRecreatesRemovedItem()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=Morning;var s=await TaskScenario.User(app);
        var t=await Template(s,new(Today,StartTime:new(10,15),AutoAddToPlan:true));var key=Guid.NewGuid().ToString();
        var effect=await TaskScenario.Read<RecurrenceEffect>(await Materialize(s,t,key:key));var replay=await TaskScenario.Read<RecurrenceEffect>(await Materialize(s,t,key:key));Assert.True(replay.Replayed);Assert.Equal(effect.PlanningVersion,replay.PlanningVersion);
        var item=Assert.Single((await TaskScenario.Read<DayItemPage>(await s.Client.GetAsync($"/api/daily-plans/{Today:yyyy-MM-dd}/items"))).Items);
        Assert.Equal(new DateTimeOffset(2026,10,26,7,15,0,TimeSpan.Zero),item.StartsAt);Assert.Null(item.EndsAt);Assert.False(item.IsUrgent);Assert.Null(item.TimingIssue);
        Assert.Equal(HttpStatusCode.OK,(await s.Client.PostAsJsonAsync($"/api/day-items/{item.Id}/remove",new{version=item.Version})).StatusCode);
        await TaskScenario.Read<RecurrenceEffect>(await Materialize(s,t));
        await using var db=fixture.CreateContext();Assert.Equal(1,await db.DayItems.CountAsync(x=>x.UserId==s.UserId));Assert.False(await db.WorkSessions.AnyAsync(x=>x.UserId==s.UserId));Assert.False(await db.TaskSchedules.AnyAsync(x=>x.UserId==s.UserId));
    }
    [Fact]
    public async Task KnownEstimateCreatesRealScheduleAndOverlapKeepsVisibleOpenEndedItem()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=Morning;var s=await TaskScenario.User(app);
        var first=await Template(s,new(Today,StartTime:new(10,0),AutoAddToPlan:true),1800);
        await TaskScenario.Read<RecurrenceEffect>(await Materialize(s,first));
        var second=await Template(s,new(Today,StartTime:new(10,15),AutoAddToPlan:true),1800);
        await TaskScenario.Read<RecurrenceEffect>(await Materialize(s,second));
        await using var db=fixture.CreateContext();var block=Assert.Single(await db.TaskSchedules.Where(x=>x.UserId==s.UserId).ToArrayAsync());Assert.True(block.IsAutomatic);Assert.Equal(TimeSpan.FromMinutes(30),block.EndsAt-block.StartsAt);
        var item=Assert.Single((await TaskScenario.Read<DayItemPage>(await s.Client.GetAsync($"/api/daily-plans/{Today:yyyy-MM-dd}/items"))).Items);Assert.Equal("ScheduleOverlap",item.TimingIssue);Assert.NotNull(item.StartsAt);Assert.Null(item.EndsAt);
        Assert.Equal(2,await db.DayItems.CountAsync(x=>x.UserId==s.UserId));Assert.Equal(2,await db.PlanRevisions.CountAsync(x=>x.UserId==s.UserId));Assert.False(await db.WorkSessions.AnyAsync(x=>x.UserId==s.UserId));
    }
    [Fact]
    public async Task UntimedAutomaticAndDstGapAreExplicitAndLegacyDefaultRemainsOff()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=Morning;var s=await TaskScenario.User(app);
        var old=await Template(s,new(Today));await TaskScenario.Read<RecurrenceEffect>(await Materialize(s,old));
        var untimed=await Template(s,new(Today,AutoAddToPlan:true));await TaskScenario.Read<RecurrenceEffect>(await Materialize(s,untimed));
        var items=await TaskScenario.Read<DayItemPage>(await s.Client.GetAsync($"/api/daily-plans/{Today:yyyy-MM-dd}/items"));Assert.Null(Assert.Single(items.Items).StartsAt);
        var spring=new DateOnly(2027,3,28);var gap=await Template(s,new(spring,"Europe/Berlin",StartTime:new(2,30),AutoAddToPlan:true));await TaskScenario.Read<RecurrenceEffect>(await Materialize(s,gap,spring));
        var missing=Assert.Single((await TaskScenario.Read<DayItemPage>(await s.Client.GetAsync($"/api/daily-plans/{spring:yyyy-MM-dd}/items"))).Items);Assert.Null(missing.StartsAt);Assert.Equal("LocalTimeUnavailable",missing.TimingIssue);
    }
}

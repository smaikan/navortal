using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Calendar;
using Adhd.Application.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

public sealed class CalendarReadTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateOnly Date = new(2026,10,25);
    private static readonly DateTimeOffset Morning = new(2026,10,25,6,0,0,TimeSpan.Zero);
    private static async Task<CalendarOverviewView> Overview(TaskScenario s,DateOnly? to=null) {
        var r=await s.Client.GetAsync($"/api/calendar/overview?fromDate={Date:yyyy-MM-dd}&toDate={to??Date:yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.OK,r.StatusCode);return await TaskScenario.Read<CalendarOverviewView>(r);
    }
    [Fact]
    public async Task OverviewUsesWholeRootCountsAndOrderingWithoutReturningHiddenItems()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=Morning;
        var s=await TaskScenario.User(app);var foreign=await TaskScenario.User(app);
        var root=await s.Root("First root");var child=await s.Child(root.Id,"Child");
        await s.Define(child.Id,true,60);var a=(await ManualPlanningTests.Create(s,child.Id,Morning.AddHours(1),Morning.AddHours(2))).Schedules[0];
        Assert.Equal(HttpStatusCode.OK,(await s.Client.PostAsJsonAsync($"/api/schedules/{a.Id}/complete",new {version=a.Version})).StatusCode);
        // Aynı kökün ileride açık öğesi varsa kök de açık kalır
        await s.Define(root.Id,true,60);
        await s.Client.PostAsJsonAsync($"/api/daily-plans/{Date:yyyy-MM-dd}/items",new {taskId=root.Id});
        for(var i=0;i<4;i++) {var t=await s.Root($"Other {i}");await s.Client.PostAsJsonAsync($"/api/daily-plans/{Date:yyyy-MM-dd}/items",new {taskId=t.Id});}
        var view=await Overview(s,Date.AddDays(41));Assert.Equal(42,view.Days.Length);
        var day=view.Days[0];Assert.Equal(6,day.ItemCount);Assert.Equal(1,day.CompletedItemCount);Assert.Equal(5,day.RootGroupCount);
        Assert.Equal(3,day.Roots.Length);var first=day.Roots[0];Assert.Equal(root.Id,first.RootTaskId);
        Assert.Equal((2,1,false),(first.ItemCount,first.CompletedItemCount,first.Done));
        Assert.All(view.Days.Skip(1),d=> {Assert.Equal(0,d.ItemCount);Assert.Empty(d.Roots);});
        Assert.All((await Overview(foreign)).Days,d=>Assert.Empty(d.Roots));
        Assert.Equal(HttpStatusCode.BadRequest,(await s.Client.GetAsync($"/api/calendar/overview?fromDate={Date:yyyy-MM-dd}&toDate={Date.AddDays(42):yyyy-MM-dd}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await s.Client.GetAsync("/api/calendar/overview")).StatusCode);
    }
    [Fact]
    public async Task DenseRangePagesBeforeEnrichmentAndRetainsRealTotalsBeyondThreeThousand()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=Morning;var s=await TaskScenario.User(app);
        var seed=await s.Root("Dense root");
        var r=await s.Client.PostAsJsonAsync($"/api/daily-plans/{Date:yyyy-MM-dd}/items",new {taskId=seed.Id});
        Assert.Equal(HttpStatusCode.Created,r.StatusCode);var item=await TaskScenario.Read<DayItemView>(r);
        await using var db=fixture.CreateContext();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            WITH generated AS (SELECT n,gen_random_uuid() AS id FROM generate_series(1,3100) n), inserted AS (
                INSERT INTO tasks SELECT (jsonb_populate_record(NULL::tasks,to_jsonb(t)||jsonb_build_object('Id',g.id,'ParentTaskId',t."Id",'Title','Dense child '||g.n))).*
                FROM tasks t CROSS JOIN generated g WHERE t."UserId"={s.UserId} AND t."Id"={seed.Id}
                RETURNING "Id"
            )
            INSERT INTO day_items SELECT (jsonb_populate_record(NULL::day_items,to_jsonb(d)||
                jsonb_build_object('Id',gen_random_uuid(),'TaskId',g.id,'LocalDate',{Date}::date+(g.n%42),'SortOrder',(g.n+1)*1024))).*
            FROM day_items d CROSS JOIN generated g JOIN inserted ins ON ins."Id"=g.id WHERE d."UserId"={s.UserId} AND d."Id"={item.Id}
            """);
        var result=await Overview(s,Date.AddDays(41));Assert.Equal(3101,result.Days.Sum(x=>x.ItemCount));Assert.All(result.Days,d=>Assert.Single(d.Roots));
        var page=await TaskScenario.Read<CalendarItemPage>(await s.Client.GetAsync($"/api/calendar/items?fromDate={Date:yyyy-MM-dd}&toDate={Date.AddDays(41):yyyy-MM-dd}&offset=3000&limit=100"));
        Assert.Equal(3101,page.Total);Assert.Equal(100,page.Items.Length);
        var tail=await TaskScenario.Read<CalendarItemPage>(await s.Client.GetAsync($"/api/calendar/items?fromDate={Date:yyyy-MM-dd}&toDate={Date.AddDays(41):yyyy-MM-dd}&offset=3100&limit=100"));
        Assert.Single(tail.Items);Assert.DoesNotContain(tail.Items[0].Id,page.Items.Select(x=>x.Id));
        var empty=await TaskScenario.Read<CalendarItemPage>(await s.Client.GetAsync($"/api/calendar/items?fromDate={Date:yyyy-MM-dd}&toDate={Date:yyyy-MM-dd}&offset=100000&limit=100"));
        Assert.Empty(empty.Items);Assert.True(empty.Total>0);
    }
}


using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Tasks;
using Adhd.Application.Work;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

public sealed class TaskReadTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Now=new(2026,10,25,12,0,0,TimeSpan.Zero);
    private static async Task<TaskDetailView> Detail(TaskScenario s,Guid id) {
        var r=await s.Client.GetAsync($"/api/tasks/{id}/detail-view");Assert.Equal(HttpStatusCode.OK,r.StatusCode);return await TaskScenario.Read<TaskDetailView>(r);
    }
    private static async Task<TaskAncestorPage> Ancestors(TaskScenario s,Guid id,string? cursor=null) {
        var r=await s.Client.GetAsync($"/api/tasks/{id}/ancestors?limit=16"+(cursor is null?"":"&cursor="+Uri.EscapeDataString(cursor)));
        Assert.Equal(HttpStatusCode.OK,r.StatusCode);return await TaskScenario.Read<TaskAncestorPage>(r);
    }
    [Fact]
    public async Task DetailSharesAuthoritativeResultsAndKeepsUnknownBudgetActualAndOwnerBoundaries()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=Now;
        var s=await TaskScenario.User(app);var other=await TaskScenario.User(app);
        var root=await s.Root("Task detail root");var known=await s.Child(root.Id,"Known own work");var unknown=await s.Child(root.Id,"Unknown work");
        await s.Define(root.Id,true,120,5000);await s.Define(known.Id,true,600);await s.Define(unknown.Id,true,null);
        using var request=new HttpRequestMessage(HttpMethod.Post,"/api/work-sessions/manual");request.Headers.Add("Idempotency-Key",Guid.NewGuid().ToString());
        request.Content=JsonContent.Create(new {taskId=known.Id,startedAt=Now.AddMinutes(-2),endedAt=Now.AddMinutes(-1),reason="owned read-view fixture"});
        using var actual=await s.Client.SendAsync(request);Assert.Equal(HttpStatusCode.Created,actual.StatusCode);
        var view=await Detail(s,root.Id);Assert.Equal(720,view.Workload.KnownEstimatedSeconds);Assert.Equal(1,view.Workload.UnknownEstimateCount);
        Assert.Null(view.Workload.CalculatedTotalSeconds);Assert.Equal(5000,view.Workload.TargetBudgetSeconds);Assert.Null(view.Time.RemainingSeconds);
        Assert.Equal(60m,view.Time.SubtreeActualSeconds);Assert.Equal(0m,view.Time.DirectActualSeconds);Assert.Equal(3,view.Progress.TotalTaskCount);
        Assert.Equal(Now,view.ServerNow);Assert.Equal(view.ServerNow,view.Time.ServerNow);Assert.Equal(view.Task.Version,view.Classification.Version);
        Assert.Equal(view.PlanningVersion,view.Classification.PlanningVersion);Assert.Equal(2,view.RowSummary.ChildCount);
        Assert.Equal(await TaskScenario.Read<WorkloadSummary>(await s.Client.GetAsync($"/api/tasks/{root.Id}/workload")),view.Workload);
        Assert.Equal(await TaskScenario.Read<TaskTimeView>(await s.Client.GetAsync($"/api/tasks/{root.Id}/time")),view.Time);
        Assert.Equal(await TaskScenario.Read<TaskProgress>(await s.Client.GetAsync($"/api/tasks/{root.Id}/progress")),view.Progress);
        Assert.Equal(await TaskScenario.Read<TreeRowSummary>(await s.Client.GetAsync($"/api/tasks/{root.Id}/summary")),view.RowSummary);
        Assert.Equal(root.Id,(await Detail(s,known.Id)).Parent!.Id);
        Assert.Equal(HttpStatusCode.NotFound,(await other.Client.GetAsync($"/api/tasks/{root.Id}/detail-view")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await app.CreateClient().GetAsync($"/api/tasks/{root.Id}/detail-view")).StatusCode);
    }
    [Fact]
    public async Task DetailIncludesSelectedResourceLabelsButNotForeignResourcesOrClosedRelations()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=Now;var s=await TaskScenario.User(app);
        var task=await s.Root("Classified");var ids=new Dictionary<string,Guid>();
        foreach(var kind in new[]{"projects","pools","categories","tags"}) {
            var r=await s.Client.PostAsJsonAsync($"/api/{kind}",new {name=kind+" label"});Assert.Equal(HttpStatusCode.Created,r.StatusCode);
            ids[kind]=(await r.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetGuid();
        }
        var classified=await s.Client.PutAsJsonAsync($"/api/tasks/{task.Id}/classification",new {version=task.Version,projectId=ids["projects"],poolId=ids["pools"],categoryId=ids["categories"],tagIds=new[]{ids["tags"]},applyToSubtree=false});
        Assert.Equal(HttpStatusCode.OK,classified.StatusCode);
        var view=await Detail(s,task.Id);Assert.Equal(4,view.Labels.Length);
        Assert.All(view.Labels,l=> {Assert.Equal(ids[l.Kind],l.Id);Assert.Equal(l.Kind+" label",l.Name);Assert.True(l.Version>0);});
    }
    [Fact]
    public async Task AncestorsAreBoundedNearestFirstBeyond128AndCursorIsOwnerTaskVersionAndSignatureBound()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString);app.Clock.Now=Now;var s=await TaskScenario.User(app);var other=await TaskScenario.User(app);
        var root=await s.Root("Deep root");await using var db=fixture.CreateContext();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            WITH RECURSIVE chain(depth,id,parent) AS (
                SELECT 1,gen_random_uuid(),{root.Id} UNION ALL SELECT depth+1,gen_random_uuid(),id FROM chain WHERE depth<140
            ) INSERT INTO tasks SELECT (jsonb_populate_record(NULL::tasks,to_jsonb(t)||jsonb_build_object('Id',c.id,'ParentTaskId',c.parent,'Title','Read ancestor '||lpad(c.depth::text,3,'0')))).*
            FROM tasks t CROSS JOIN chain c WHERE t."UserId"={s.UserId} AND t."Id"={root.Id}
            """);
        var leaf=await db.Tasks.AsNoTracking().SingleAsync(x=>x.UserId==s.UserId && x.Title=="Read ancestor 140");
        var first=await Ancestors(s,leaf.Id);Assert.Equal(16,first.Items.Length);Assert.Equal(leaf.ParentTaskId,first.Items[0].Id);Assert.NotNull(first.NextCursor);
        var all=first.Items.ToList();var next=first.NextCursor;
        while(next is not null) {var page=await Ancestors(s,leaf.Id,next);Assert.InRange(page.Items.Length,1,16);all.AddRange(page.Items);next=page.NextCursor;}
        Assert.Equal(140,all.Count);Assert.Equal(140,all.Select(x=>x.Id).Distinct().Count());Assert.Equal(root.Id,all[^1].Id);Assert.Null(all[^1].ParentTaskId);
        Assert.Empty((await Ancestors(s,root.Id)).Items);
        Assert.Equal(HttpStatusCode.NotFound,(await other.Client.GetAsync($"/api/tasks/{leaf.Id}/ancestors")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await other.Client.GetAsync($"/api/tasks/{(await other.Root()).Id}/ancestors?cursor={Uri.EscapeDataString(first.NextCursor!)}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await s.Client.GetAsync($"/api/tasks/{root.Id}/ancestors?cursor={Uri.EscapeDataString(first.NextCursor!)}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await s.Client.GetAsync($"/api/tasks/{leaf.Id}/ancestors?cursor={Uri.EscapeDataString(first.NextCursor![..^1]+(first.NextCursor[^1]=='A'?'B':'A'))}")).StatusCode);
        var changed=await s.Client.PutAsJsonAsync($"/api/tasks/{root.Id}",new {version=root.Version,title="Renamed ancestor"});Assert.Equal(HttpStatusCode.OK,changed.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await s.Client.GetAsync($"/api/tasks/{leaf.Id}/ancestors?cursor={Uri.EscapeDataString(first.NextCursor!)}")).StatusCode);
        // Bozuk eski veya içe aktarılmış ağaç, sonsuza kadar dönmek yerine hata vermeli
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE tasks SET \"ParentTaskId\"={leaf.Id} WHERE \"UserId\"={s.UserId} AND \"Id\"={root.Id}");
        string? cycleCursor=null;var detected=false;
        for(var pageIndex=0;pageIndex<20;pageIndex++) {
            var response=await s.Client.GetAsync($"/api/tasks/{leaf.Id}/ancestors?limit=16"+(cycleCursor is null?"":"&cursor="+Uri.EscapeDataString(cycleCursor)));
            if(response.StatusCode==HttpStatusCode.Conflict) {detected=true;break;}
            Assert.Equal(HttpStatusCode.OK,response.StatusCode);cycleCursor=(await TaskScenario.Read<TaskAncestorPage>(response)).NextCursor;Assert.NotNull(cycleCursor);
        }
        Assert.True(detected);
    }
}

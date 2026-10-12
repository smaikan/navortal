using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
namespace Adhd.IntegrationTests;

public sealed class MatrixTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static async Task<MatrixView> Board(TaskScenario s, string query = "") => await TaskScenario.Read<MatrixView>(await s.Client.GetAsync("/api/matrix" + query));
    private static async Task<MatrixWriteResult> Write(TaskScenario s, Guid id, long version, string quadrant, Guid? before = null, bool add = false)
    {
        var body = new { version, quadrant, beforeTaskId = before };
        var r = add ? await s.Client.PostAsJsonAsync($"/api/matrix/items/{id}", body) : await s.Client.PutAsJsonAsync($"/api/matrix/items/{id}", body);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode); return await TaskScenario.Read<MatrixWriteResult>(r);
    }
    [Fact]
    public async Task MembershipMovesAndOrderArePersistentAndDoNotChangeTaskPlanOrWork()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        Assert.Equal(0, (await Board(s)).Version);
        await using var db = fixture.CreateContext(); Assert.False(await db.MatrixStates.AnyAsync(x => x.UserId == s.UserId));
        var a = await s.Root("A"); var b = await s.Root("B"); var c = await s.Root("C");
        var planning = (await db.PlanningStates.AsNoTracking().SingleAsync(x => x.UserId == s.UserId)).PlanningVersion;
        var events = await db.TaskEvents.CountAsync(x => x.UserId == s.UserId);
        await Write(s,a.Id,0,"Do",add:true); await Write(s,b.Id,1,"Do",add:true); await Write(s,c.Id,2,"Do",add:true);
        await Write(s,c.Id,3,"Do",a.Id);
        Assert.Equal(new[]{c.Id,a.Id,b.Id},(await Board(s)).Columns.Single(x=>x.Quadrant==MatrixQuadrant.Do).Items.Select(x=>x.Task.Id));
        await Write(s,a.Id,4,"Schedule"); await Write(s,b.Id,5,"Delegate"); await Write(s,c.Id,6,"Eliminate");
        await Write(s,a.Id,7,"Inbox");
        Assert.Equal(HttpStatusCode.OK,(await s.Client.DeleteAsync($"/api/matrix/items/{b.Id}?version=8")).StatusCode);
        var board=await Board(s); Assert.Equal(9,board.Version); Assert.Equal(2,board.Columns.Sum(x=>x.Total));
        Assert.Equal(a.Version,(await s.Get(a.Id)).Version); Assert.Equal(TaskState.Pending,(await s.Get(c.Id)).State);
        Assert.Equal(planning,(await db.PlanningStates.AsNoTracking().SingleAsync(x=>x.UserId==s.UserId)).PlanningVersion);
        Assert.Equal(events,await db.TaskEvents.CountAsync(x=>x.UserId==s.UserId));
        Assert.False(await db.DailyPlans.AnyAsync(x=>x.UserId==s.UserId)); Assert.False(await db.WorkSessions.AnyAsync(x=>x.UserId==s.UserId));
        Assert.True(await db.Outbox.AnyAsync(x=>x.UserId==s.UserId && x.Kind=="MatrixChanged" && x.SourceVersion==9));
    }
    [Fact]
    public async Task VersionDuplicateForeignAndDatabaseOwnerConstraintsRejectWithoutChangingTheBoard()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s=await TaskScenario.User(app); var other=await TaskScenario.User(app);
        var a=await s.Root(); var b=await other.Root(); await Write(s,a.Id,0,"Inbox",add:true);
        Assert.Equal(HttpStatusCode.Unauthorized,(await app.CreateClient().GetAsync("/api/matrix")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await s.Client.PostAsJsonAsync($"/api/matrix/items/{a.Id}",new{version=1,quadrant="Do"})).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,(await s.Client.PutAsJsonAsync($"/api/matrix/items/{a.Id}",new{version=0,quadrant="Do"})).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await s.Client.PostAsJsonAsync($"/api/matrix/items/{b.Id}",new{version=1,quadrant="Do"})).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await s.Client.PutAsJsonAsync($"/api/matrix/items/{a.Id}",new{version=1,quadrant="Do",beforeTaskId=b.Id})).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await s.Client.PutAsJsonAsync($"/api/matrix/items/{a.Id}",new{version=1,quadrant=999})).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await s.Client.DeleteAsync($"/api/matrix/items/{b.Id}?version=1")).StatusCode);
        Assert.Equal(1,(await Board(s)).Version); Assert.Equal(0,(await Board(other)).Columns.Sum(x=>x.Total));
        await using var db=fixture.CreateContext(); db.MatrixItems.Add(new(){UserId=s.UserId,TaskId=b.Id,Quadrant=MatrixQuadrant.Do,SortOrder=1});
        await Assert.ThrowsAsync<DbUpdateException>(()=>db.SaveChangesAsync());
    }
    [Fact]
    public async Task ConcurrentWritersWithTheSameVersionCannotOverwriteEachOther()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString); var s=await TaskScenario.User(app); var a=await s.Root(); var b=await s.Root();
        var replies=await Task.WhenAll(s.Client.PostAsJsonAsync($"/api/matrix/items/{a.Id}",new{version=0,quadrant="Do"}),s.Client.PostAsJsonAsync($"/api/matrix/items/{b.Id}",new{version=0,quadrant="Schedule"}));
        Assert.Single(replies,x=>x.StatusCode==HttpStatusCode.OK); Assert.Single(replies,x=>x.StatusCode==HttpStatusCode.Conflict);
        var board=await Board(s); Assert.Equal(1,board.Version); Assert.Equal(1,board.Columns.Sum(x=>x.Total));
    }
    [Fact]
    public async Task CandidatesIncludeContainersAndParentContextAndPagingDoesNotLoseHiddenPositions()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString); var s=await TaskScenario.User(app);
        var a=await s.Root("Ana iş"); var child=await s.Child(a.Id,"Alt iş"); var b=await s.Root("B"); var c=await s.Root("C");
        var foreign=await TaskScenario.User(app); var hidden=await foreign.Root("Ana iş yabancı");
        var candidates=await TaskScenario.Read<TaskPickerPage>(await s.Client.GetAsync("/api/matrix/candidates?search=Ana%20iş"));
        Assert.Contains(candidates.Items,x=>x.Id==a.Id); Assert.Equal("Ana iş",candidates.Items.Single(x=>x.Id==child.Id).ParentTitle);
        Assert.DoesNotContain(candidates.Items,x=>x.Id==hidden.Id);
        await Write(s,a.Id,0,"Do",add:true); await Write(s,b.Id,1,"Do",add:true); await Write(s,c.Id,2,"Do",add:true);
        var first=(await Board(s,"?limit=2")).Columns.Single(x=>x.Quadrant==MatrixQuadrant.Do);
        var next=(await Board(s,"?limit=2&doOffset=2")).Columns.Single(x=>x.Quadrant==MatrixQuadrant.Do);
        Assert.Equal(3,first.Total); Assert.Equal(new[]{a.Id,b.Id},first.Items.Select(x=>x.Task.Id)); Assert.Equal(c.Id,Assert.Single(next.Items).Task.Id);
        await Write(s,c.Id,3,"Do",a.Id); Assert.Equal(c.Id,(await Board(s,"?limit=1")).Columns.Single(x=>x.Quadrant==MatrixQuadrant.Do).Items[0].Task.Id);
        candidates=await TaskScenario.Read<TaskPickerPage>(await s.Client.GetAsync("/api/matrix/candidates")); Assert.DoesNotContain(candidates.Items,x=>x.Id==a.Id);
        Assert.Equal(HttpStatusCode.BadRequest,(await s.Client.GetAsync("/api/matrix?limit=0")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await s.Client.GetAsync("/api/matrix/candidates?search="+new string('x',201))).StatusCode);
    }
    [Fact]
    public async Task ExhaustedFractionalGapRebalancesWithoutChangingTaskOrder()
    {
        await using var app=new PlannerFactory(fixture.ConnectionString); var s=await TaskScenario.User(app); var a=await s.Root("A"); var b=await s.Root("B"); var c=await s.Root("C");
        await Write(s,a.Id,0,"Do",add:true); await Write(s,b.Id,1,"Do",add:true); await Write(s,c.Id,2,"Do",add:true);
        await using(var db=fixture.CreateContext()) { var rows=await db.MatrixItems.Where(x=>x.UserId==s.UserId).ToListAsync(); rows.Single(x=>x.TaskId==a.Id).SortOrder=1m; rows.Single(x=>x.TaskId==b.Id).SortOrder=1.0000000001m; await db.SaveChangesAsync(); }
        await Write(s,c.Id,3,"Do",b.Id);
        Assert.Equal(new[]{a.Id,c.Id,b.Id},(await Board(s)).Columns.Single(x=>x.Quadrant==MatrixQuadrant.Do).Items.Select(x=>x.Task.Id));
        Assert.Equal(a.SortOrder,(await s.Get(a.Id)).SortOrder);
    }
}

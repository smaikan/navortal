using System.Net;
using Adhd.Application.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

public sealed class UiR4PickerTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Fact]
    public async Task GroupsPagesAndExactMatchAreOwnerScopedAndParentsNeedNoExtraReads()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var s = await TaskScenario.User(app); var other = await TaskScenario.User(app);
        var parent = await s.Root("Ana iş"); var child = await s.Child(parent.Id, "İncele");
        await using var db = fixture.CreateContext();
        var row = await db.Tasks.SingleAsync(x => x.Id == child.Id);
        row.PlannedFrom = new(2026,10,26); row.PlannedTo = new(2026,10,26);
        await db.SaveChangesAsync();
        for (var i=0;i<4;i++) await s.Root("Diğer " + i);
        await other.Root("Yabancı gizli");
        var first = await TaskScenario.Read<TaskPickerView>(await s.Client.GetAsync("/api/tasks/picker?date=2026-10-26&limit=2"));
        Assert.NotNull(first.Coverage);
        Assert.Equal((await db.PlanningStates.AsNoTracking().SingleAsync(x=>x.UserId==s.UserId)).PlanningVersion,first.Coverage.Versions.Planning);
        Assert.Single(first.Assigned.Items); Assert.Equal("Ana iş", first.Assigned.Items[0].ParentTitle);
        Assert.Equal(child.Id, first.Assigned.Items[0].Id); Assert.Equal(4, first.Other.Total); Assert.Equal(2, first.Other.Items.Length);
        var next = await TaskScenario.Read<TaskPickerView>(await s.Client.GetAsync("/api/tasks/picker?date=2026-10-26&limit=2&offset=2"));
        Assert.Empty(first.Other.Items.Select(x=>x.Id).Intersect(next.Other.Items.Select(x=>x.Id)));
        var found = await TaskScenario.Read<TaskPickerView>(await s.Client.GetAsync("/api/tasks/picker?search="+Uri.EscapeDataString("incele")));
        Assert.True(found.HasExactMatch); Assert.Single(found.Other.Items);
        var byParent = await TaskScenario.Read<TaskPickerView>(await s.Client.GetAsync("/api/tasks/picker?search="+Uri.EscapeDataString("Ana iş")));
        Assert.Equal(child.Id, Assert.Single(byParent.Other.Items).Id);
        Assert.Equal(HttpStatusCode.BadRequest,(await s.Client.GetAsync("/api/tasks/picker?limit=101")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await app.CreateClient().GetAsync("/api/tasks/picker")).StatusCode);
    }
}

using System.Net;
using System.Net.Http.Json;
using Adhd.Domain.Jobs;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

public sealed class RangeReminderTests
{
    private static async Task<HttpResponseMessage> Range(TaskScenario s, Guid id, string? from, string? to) =>
        await s.Client.PutAsJsonAsync($"/api/tasks/{id}/planned-range", new { version = (await s.Get(id)).Version, plannedFrom = from, plannedTo = to });
    private static DateTimeOffset[] Pending(JobScenario s, Guid taskId)
    {
        using var db = s.Context();
        return db.ReminderWork.AsNoTracking().Where(x => x.TaskId == taskId && x.Kind == ReminderKind.TaskDeadline && x.State == ReminderState.Pending)
            .Select(x => x.DueAt).ToArray().OrderBy(x => x).ToArray();
    }

    [Fact]
    public async Task RangeEndSchedulesTheEveningBeforeAndTheMorningOfTheLastDayForTheTaskAndInheritingChildren()
    {
        await using var s = await JobScenario.Create(); var root = await s.User.Root(); var child = await s.User.Child(root.Id); var own = await s.User.Child(root.Id);
        Assert.Equal(HttpStatusCode.OK, (await Range(s.User, own.Id, "2026-10-17", "2026-10-18")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Range(s.User, root.Id, "2026-10-20", "2026-10-22")).StatusCode);
        await s.Pump();
        DateTimeOffset[] expected = [new(2026, 10, 21, 15, 0, 0, TimeSpan.Zero), new(2026, 10, 22, 6, 0, 0, TimeSpan.Zero)];
        // Alt görevi olan üst görev konteynerdir ve doğrudan işi olmadığı için hatırlatma üretmez.
        Assert.Empty(Pending(s, root.Id)); Assert.Equal(expected, Pending(s, child.Id));
        Assert.Equal([new DateTimeOffset(2026, 10, 17, 15, 0, 0, TimeSpan.Zero), new DateTimeOffset(2026, 10, 18, 6, 0, 0, TimeSpan.Zero)], Pending(s, own.Id));
        // Üst aralık değişince kalıtan alt görevin eski hatırlatmaları geçersiz olur, yenileri gelir.
        Assert.Equal(HttpStatusCode.OK, (await Range(s.User, root.Id, "2026-10-25", "2026-10-26")).StatusCode); await s.Pump();
        Assert.Equal([new DateTimeOffset(2026, 10, 25, 15, 0, 0, TimeSpan.Zero), new DateTimeOffset(2026, 10, 26, 6, 0, 0, TimeSpan.Zero)], Pending(s, child.Id));
        // Aralığı silinen alt görev kalıtımı da kaybeder; tamamlanan görevin hatırlatması kalmaz.
        Assert.Equal(HttpStatusCode.OK, (await Range(s.User, root.Id, null, null)).StatusCode); await s.Pump();
        Assert.Empty(Pending(s, child.Id)); Assert.Empty(Pending(s, root.Id));
    }
    [Fact]
    public async Task CompletedTaskKeepsNoPendingRangeReminder()
    {
        await using var s = await JobScenario.Create(); var task = await s.User.Root();
        Assert.Equal(HttpStatusCode.OK, (await Range(s.User, task.Id, "2026-10-20", "2026-10-22")).StatusCode); await s.Pump();
        Assert.Equal(2, Pending(s, task.Id).Length);
        await s.User.State(task.Id, Adhd.Domain.Tasks.TaskAction.Complete); await s.Pump();
        Assert.Empty(Pending(s, task.Id));
    }
}

using Adhd.Application.Sync;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Notifications;

public sealed class SyncStore(PlannerDbContext db, TimeProvider clock) : ISyncStore
{
    public async Task<SyncView> ReadAsync(Guid userId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var version = await db.PlanningStates.Where(x => x.UserId == userId).Select(x => x.PlanningVersion).SingleAsync(ct);
        var work = await db.WorkSessions.Where(x => x.UserId == userId && (x.State == Adhd.Domain.Work.WorkState.Running || x.State == Adhd.Domain.Work.WorkState.Paused)).OrderByDescending(x => x.State == Adhd.Domain.Work.WorkState.Running).ThenByDescending(x => x.StartedAt).ThenByDescending(x => x.Id).Select(x => (Guid?)x.Id).FirstOrDefaultAsync(ct);
        var focus = await db.FocusSessions.Where(x => x.UserId == userId && x.State != Adhd.Domain.Focus.FocusState.Finished && x.State != Adhd.Domain.Focus.FocusState.Interrupted).Select(x => (Guid?)x.Id).FirstOrDefaultAsync(ct);
        return new(clock.GetUtcNow(), version, work, focus);
    }
}

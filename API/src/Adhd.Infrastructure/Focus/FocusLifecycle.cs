using System.Text.Json;
using Adhd.Application.Common;
using Adhd.Domain.Focus;
using Adhd.Domain.Work;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Focus;

internal static class FocusLifecycle
{
    internal static FocusSettings Settings(FocusSession focus) => JsonSerializer.Deserialize<FocusSettings>(focus.Settings, RevisionWriter.Json)!;
    internal static bool MarkTarget(FocusSession focus, IEnumerable<WorkSessionSegment> segments, DateTimeOffset now)
    {
        FocusMeasurement measured;
        try { measured = FocusRules.Measure(focus, Settings(focus), segments, now); }
        catch (ArgumentOutOfRangeException) { throw new UseCaseException(ErrorKind.Conflict, "server_clock_conflict", "Sunucu zamanı çalışma kaydından geride."); }
        if (focus.TargetReachedAt.HasValue || measured.TargetInstant is null) return false;
        focus.TargetReachedAt = measured.TargetInstant; focus.TargetObservedAt = now; return true;
    }
    internal static async Task SyncWork(PlannerDbContext db, WorkSession work, IEnumerable<WorkSessionSegment> segments, DateTimeOffset now, CancellationToken ct)
    {
        var focus = await db.FocusSessions.SingleOrDefaultAsync(x => x.UserId == work.UserId && x.WorkSessionId == work.Id && x.State != FocusState.Finished && x.State != FocusState.Interrupted, ct);
        if (focus is null) return;
        var changed = MarkTarget(focus, segments, now); var before = focus.State;
        if (work.State is WorkState.Finished or WorkState.Canceled)
        {
            focus.State = work.State == WorkState.Canceled ? FocusState.Interrupted : FocusState.Finished;
            focus.WorkEndedAt ??= work.EndedAt > focus.StartedAt ? work.EndedAt : focus.StartedAt; focus.EndedAt = now;
            if (focus.BreakStartedAt.HasValue) focus.BreakEndedAt ??= now;
        }
        else if (work.State == WorkState.Running && focus.State is FocusState.Break or FocusState.AwaitingNext)
        {
            // Çalışmayı sürdürmek yeni bir Pomodoro turu başlatmaz
            focus.State = FocusState.Interrupted; focus.BreakEndedAt ??= now; focus.EndedAt = now;
        }
        else if (focus.State is FocusState.Working or FocusState.Paused) focus.State = work.State == WorkState.Running ? FocusState.Working : FocusState.Paused;
        if (changed || before != focus.State) focus.Version++;
    }
}

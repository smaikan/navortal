using Adhd.Application.Common;
using Adhd.Application.Planning;
using Adhd.Application.Scheduling;
using Adhd.Domain.Planning;
using Adhd.Domain.Scheduling;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Scheduling;

public sealed partial class SchedulingCoordinator
{
    public async Task<SchedulingPreviewView> PreviewUndoAsync(Guid userId, UndoRequest request, CancellationToken ct)
    {
        var revision = await UndoSource(userId, request.ChangeSetId, ct);
        var day = await db.DailyPlans.AsNoTracking().SingleAsync(x => x.UserId == userId && x.Id == revision.DailyPlanId, ct);
        var input = await new SchedulingSnapshotBuilder(db, preferences, clock).Build(userId, new(day.LocalDate, [], request.ExpectedPlanningVersion), ct, allowEmpty: true);
        _ = await UndoSource(userId, request.ChangeSetId, ct);
        var changes = await db.PlanRevisionChanges.AsNoTracking().Where(x => x.UserId == userId && x.RevisionId == revision.Id).OrderBy(x => x.ScheduleId).ToArrayAsync(ct);
        var ids = changes.Select(x => x.ScheduleId).ToArray();
        var removed = await db.TaskSchedules.AsNoTracking().Where(x => x.UserId == userId && x.State == ScheduleState.Removed && ids.Contains(x.Id)).ToArrayAsync(ct);
        var undo = changes.Select(x => new UndoDelta(x.Before is null ? null : UndoView(Deserialize<ScheduleView>(x.Before)), UndoView(Deserialize<ScheduleView>(x.After!)))).ToArray();
        input = input with { CurrentSchedules = input.CurrentSchedules.Concat(removed.Select(RevisionWriter.View)).OrderBy(x => x.Id).ToArray(), Undo = new(request.ChangeSetId, undo, request.AllowProtectedChange) };
        return await SaveProposal(userId, input, Generate(input), ct);
    }
    private async Task<PlanRevision> UndoSource(Guid userId, Guid changeSetId, CancellationToken ct)
    {
        var revisions = await db.PlanRevisions.AsNoTracking().Where(x => x.UserId == userId && x.ChangeSetId == changeSetId).ToArrayAsync(ct);
        if (revisions.Length == 0) throw new UseCaseException(ErrorKind.NotFound, "change_set_not_found", "Değişiklik grubu bulunamadı.");
        if (revisions.Length != 1) throw Conflict("undo_multiple_days", "Çok günlük geri alma için undo-multi-preview kullanın.");
        var source = revisions[0];
        var latest = await db.PlanRevisions.AsNoTracking().Where(x => x.UserId == userId && x.DailyPlanId == source.DailyPlanId && x.Trigger != "TaskState").OrderByDescending(x => x.Number).FirstOrDefaultAsync(ct);
        if (source.Trigger == "TaskState" || latest?.Id != source.Id) throw Conflict("undo_not_latest", "Yalnız günün son kullanıcı plan değişikliğini geri alabilirsiniz.");
        if (await db.SchedulingProposals.AsNoTracking().AnyAsync(x => x.UserId == userId && x.ReversesChangeSetId == changeSetId && x.Status == "Applied", ct)) throw Conflict("undo_already_applied", "Bu değişiklik için geri alma zaten kabul edildi.");
        return source;
    }
    private static UndoSchedule UndoView(ScheduleView view) => new(view.Id, view.TaskId, view.Kind, view.State, view.StartsAt, view.EndsAt, view.IsFixed, view.IsLocked, view.IsAutomatic, view.Version);
}

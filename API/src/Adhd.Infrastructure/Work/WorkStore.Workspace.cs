using System.Data;
using Adhd.Application.Focus;
using Adhd.Application.Sync;
using Adhd.Domain.Focus;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Work;

public sealed partial class WorkStore : IWorkspaceSnapshotStore
{
    public async Task<WorkspaceSnapshotView> ReadWorkspaceAsync(Guid userId, bool includeFocus, CancellationToken ct)
    {
        // Güncel odak okuması aşamayı ilerletebilir. Aynı işlemde mevcut hesap kilidi ve gözlemi kullan,
        // normal çalışma alanı okuması ise pasif kalsın ve tek tekrarlanabilir görüntü alsın.
        await using var tx = await db.Database.BeginTransactionAsync(
            includeFocus ? IsolationLevel.ReadCommitted : IsolationLevel.RepeatableRead, ct);
        var state = includeFocus ? await Lock(userId, ct)
            : await db.PlanningStates.AsNoTracking().SingleAsync(x => x.UserId == userId, ct);
        var now = clock.GetUtcNow();
        FocusCurrent? evaluated = includeFocus ? await ObserveCurrentFocus(userId, state, now, ct) : null;
        var prefs = await preferences.ReadAsync(userId, ct);
        // Sync gibi seç. Çalışan varsa o, yoksa en son başlayan duraklatılmış oturum
        var work = await db.WorkSessions.AsNoTracking()
            .Where(x => x.UserId == userId && (x.State == WorkState.Running || x.State == WorkState.Paused))
            .OrderByDescending(x => x.State == WorkState.Running).ThenByDescending(x => x.StartedAt)
            .ThenByDescending(x => x.Id).FirstOrDefaultAsync(ct);
        var focusId = await db.FocusSessions.AsNoTracking()
            .Where(x => x.UserId == userId && x.State != FocusState.Finished && x.State != FocusState.Interrupted)
            .Select(x => (Guid?)x.Id).SingleOrDefaultAsync(ct);
        var segments = work is null ? [] : await db.WorkSegments.AsNoTracking()
            .Where(x => x.UserId == userId && x.SessionId == work.Id).ToArrayAsync(ct);
        var p = prefs.Values;
        var result = new WorkspaceSnapshotView(now, state.PlanningVersion,
            new(prefs.Version, p.TimeZoneId, p.TimeFormat, p.WeekStartsOn, p.SupportEnabled, p.Weekly.Length > 0, p.UiSupports),
            work is null ? null : View(work, Measured(segments, now), now), focusId, includeFocus, evaluated?.Session,
            new(state.PlanningVersion, state.NotesVersion, state.SpecialDaysVersion));
        await tx.CommitAsync(ct);
        return result;
    }
}

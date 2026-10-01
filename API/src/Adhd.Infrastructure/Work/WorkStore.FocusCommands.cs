using Adhd.Application.Common;
using Adhd.Application.Focus;
using Adhd.Domain.Focus;
using Adhd.Domain.Work;
using Adhd.Infrastructure.Focus;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Work;

public sealed partial class WorkStore
{
    public async Task<FocusOutcome> ChangeFocusAsync(Guid userId, Guid id, string action, FocusCommand command, string key, CancellationToken ct)
    {
        ValidateKey(key); if (command.Version < 1 || command.WorkSessionVersion < 1 || action is not ("pause" or "resume" or "break" or "next" or "finish" or "cancel")) throw new UseCaseException(ErrorKind.Validation, "focus_command_invalid", "Geçerli odak eylemi ve sürümleri gerekli.");
        var payload = new { id, action, command }; await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var replay = await FocusReplay(userId, "focus-change", key, payload, ct); if (replay is not null) return new(replay, true);
        var focus = await FindFocus(userId, id, ct); var work = await Find(userId, focus.WorkSessionId, ct);
        if (focus.Version != command.Version || work.Version != command.WorkSessionVersion) throw Conflict("version_conflict", "Odak veya çalışma oturumu değişmiş; güncel kaydı alın.");
        var now = clock.GetUtcNow(); var segments = await FocusSegments(work.Id, userId, ct); await ObserveFocus(focus, work, segments, state, now, ct, allowAutomaticBreak: false);
        var output = focus;
        if (focus.State is FocusState.Finished or FocusState.Interrupted)
        {
            if (action is not ("finish" or "cancel")) throw Conflict("focus_finished", "Bu odak döngüsü bitmiş; yeni bir döngü başlatın.");
        }
        else
        {
            switch (action)
            {
                case "pause":
                    Require(focus.State == FocusState.Working); await FocusWorkState(work, segments, WorkState.Paused, now, ct); focus.State = FocusState.Paused; break;
                case "resume":
                    Require(focus.State == FocusState.Paused); await FocusWorkState(work, segments, WorkState.Running, now, ct); focus.State = FocusState.Working; break;
                case "break":
                    Require(focus.State is FocusState.Working or FocusState.Paused); await FocusWorkState(work, segments, WorkState.Paused, now, ct);
                    focus.WorkEndedAt = now; focus.BreakStartedAt = now; focus.State = FocusState.Break; break;
                case "next":
                    Require(focus.State is FocusState.Break or FocusState.AwaitingNext);
                    if (focus.State == FocusState.Break && !command.SkipBreak) throw Conflict("focus_break_pending", "Mola sürüyor; bitmesini bekleyin veya açıkça atlayın.");
                    focus.BreakEndedAt ??= now; focus.EndedAt = now; focus.State = FocusState.Finished; focus.Version++;
                    // Yeni odak turunu açmadan eskisini kapat. Aktif tur indeksi ikisini birden kabul etmez
                    await db.SaveChangesAsync(ct);
                    await FocusWorkState(work, segments, WorkState.Running, now, ct);
                    output = new() { Id = Guid.CreateVersion7(), UserId = userId, WorkSessionId = work.Id, PreviousFocusId = focus.Id, CycleNumber = checked(focus.CycleNumber + 1),
                        StartedAt = now, Settings = focus.Settings, PresetId = focus.PresetId, PresetName = focus.PresetName, PresetVersion = focus.PresetVersion };
                    db.FocusSessions.Add(output); break;
                case "finish": case "cancel":
                    await FocusWorkState(work, segments, WorkState.Finished, now, ct); focus.WorkEndedAt ??= now;
                    if (focus.BreakStartedAt.HasValue) focus.BreakEndedAt ??= now;
                    focus.EndedAt = now; focus.State = action == "finish" ? FocusState.Finished : FocusState.Interrupted; break;
            }
            if (action != "next") focus.Version++;
            state.PlanningVersion++; state.UpdatedAt = now;
        }
        var view = FocusViewOf(output, work, output == focus ? segments : [], now); FocusRemember(userId, "focus-change", key, payload, view, now);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return new(view, false);
    }
    private static void Require(bool valid) { if (!valid) throw Conflict("focus_transition_invalid", "Bu odak durumunda bu eylem uygulanamaz."); }
}

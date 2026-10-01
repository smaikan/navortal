using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Adhd.Application.Common;
using Adhd.Application.Focus;
using Adhd.Domain.Focus;
using Adhd.Domain.Tasks;
using Adhd.Domain.Users;
using Adhd.Domain.Work;
using Adhd.Infrastructure.Focus;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Work;

public sealed partial class WorkStore
{
    public Task<FocusOutcome> StartFocusAsync(Guid userId, FocusStart command, string key, CancellationToken ct) => StartFocusCore(userId, command, key, false, ct);
    public Task<FocusOutcome> QuickStartAsync(Guid userId, FocusStart command, string key, CancellationToken ct) => StartFocusCore(userId, command with { PresetId = null, Settings = new(300) }, key, true, ct);
    private async Task<FocusOutcome> StartFocusCore(Guid userId, FocusStart command, string key, bool quick, CancellationToken ct)
    {
        ValidateKey(key);
        if (command.WorkSessionId.HasValue != command.WorkSessionVersion.HasValue || command.WorkSessionVersion < 1 || (command.PresetId.HasValue && command.Settings is not null)) throw FocusInvalid();
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var scope = quick ? "focus-quick-start" : "focus-start";
        var replay = await FocusReplay(userId, scope, key, command, ct); if (replay is not null) return new(replay, true);
        if (quick && !(await preferences.ReadAsync(userId, ct)).Values.SupportEnabled) throw Conflict("support_disabled", "İsteğe bağlı destekler kapalı.");
        if (await db.FocusSessions.AnyAsync(x => x.UserId == userId && x.State != FocusState.Finished && x.State != FocusState.Interrupted, ct)) throw Conflict("focus_already_active", "Önce mevcut odak döngüsünü bitirin.");
        var preset = command.PresetId.HasValue ? await db.FocusPresets.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == command.PresetId, ct) ?? throw new UseCaseException(ErrorKind.NotFound, "focus_preset_not_found", "Odak ayarı bulunamadı.") : null;
        var settings = preset is null ? command.Settings ?? new() : JsonSerializer.Deserialize<FocusSettings>(preset.Settings, Json)!; if (!FocusRules.Valid(settings)) throw FocusInvalid();
        var now = clock.GetUtcNow(); await CheckClock(userId, now, ct); WorkSession session;
        if (command.WorkSessionId.HasValue)
        {
            session = await Find(userId, command.WorkSessionId.Value, ct);
            if (session.Version != command.WorkSessionVersion) throw Conflict("version_conflict", "Çalışma oturumu değişmiş.");
            if (command.TaskId.HasValue && session.TaskId != command.TaskId) throw Conflict("focus_task_mismatch", "Oturum farklı göreve ait.");
            if (session.State is not (WorkState.Running or WorkState.Paused)) throw Conflict("session_finished", "Bitmiş çalışma oturumuna yeni odak eklenemez.");
            await FocusWorkState(session, await FocusSegments(session.Id, userId, ct), WorkState.Running, now, ct);
        }
        else
        {
            await CheckNoRunning(userId, ct); TaskItem? task = command.TaskId.HasValue ? await Eligible(userId, command.TaskId.Value, ct) : null;
            if (task is not null && await db.WorkSessions.AnyAsync(x => x.UserId == userId && x.TaskId == task.Id && x.State == WorkState.Paused, ct)) throw Conflict("session_paused", "Duraklatılmış çalışma oturumunu kimliği ve sürümüyle seçin.");
            session = new() { Id = Guid.CreateVersion7(), UserId = userId, TaskId = task?.Id, StartedAt = now, RecordedAt = now, TimeZoneId = (await preferences.ReadAsync(userId, ct)).Values.TimeZoneId };
            if (task is not null) { TouchTask(task, TaskState.InProgress, now, "FocusWorkStarted", session.Id); session.TaskSnapshot = JsonSerializer.Serialize(await Snapshot(task, state.PlanningVersion, ct), Json); }
            db.WorkSessions.Add(session); db.WorkSegments.Add(Open(session, now));
        }
        var focus = new FocusSession { Id = Guid.CreateVersion7(), UserId = userId, WorkSessionId = session.Id, StartedAt = now, Settings = JsonSerializer.Serialize(settings, Json), PresetId = preset?.Id, PresetName = preset?.Name, PresetVersion = preset?.Version };
        db.FocusSessions.Add(focus); state.PlanningVersion++; state.UpdatedAt = now;
        var view = FocusViewOf(focus, session, [], now); FocusRemember(userId, scope, key, command, view, now);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return new(view, false);
    }

    private async Task FocusWorkState(WorkSession work, WorkSessionSegment[] segments, WorkState desired, DateTimeOffset now, CancellationToken ct)
    {
        if (now < work.StartedAt || segments.Any(x => (x.EndedAt ?? x.StartedAt) > now)) throw Conflict("server_clock_conflict", "Sunucu zamanı çalışma kaydından geride.");
        if (work.State == desired) return;
        if (work.State is WorkState.Finished or WorkState.Canceled) throw Conflict("session_finished", "Çalışma oturumu bitmiş.");
        if (desired == WorkState.Running)
        {
            if (work.TaskId is { } taskId) _ = await Eligible(work.UserId, taskId, ct);
            await CheckNoRunning(work.UserId, ct); await CheckClock(work.UserId, now, ct); db.WorkSegments.Add(Open(work, now));
        }
        else
        {
            foreach (var segment in segments.Where(x => !x.IsVoided && x.EndedAt is null)) { segment.EndedAt = now; segment.Version++; }
            if (desired == WorkState.Finished) work.EndedAt = now;
        }
        work.State = desired; work.Version++;
        if (work.TaskId is { } id) TouchTask(await db.Tasks.SingleAsync(x => x.UserId == work.UserId && x.Id == id, ct), desired == WorkState.Running ? TaskState.InProgress : TaskState.Paused, now, "FocusWork" + desired, work.Id);
    }
    private Task<WorkSessionSegment[]> FocusSegments(Guid workId, Guid userId, CancellationToken ct) => db.WorkSegments.Where(x => x.UserId == userId && x.SessionId == workId).ToArrayAsync(ct);
    private static UseCaseException FocusInvalid() => new(ErrorKind.Validation, "focus_settings_invalid", "Çalışma 1..86400sn, kısa mola1..14400sn, uzun mola1..43200sn ve sıklık1..20 olmalı; preset veya özel ayar seçin.");
    private static string FocusHash(object payload) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload, Json))));
    private async Task<FocusView?> FocusReplay(Guid userId, string scope, string key, object payload, CancellationToken ct)
    {
        var previous = await db.IdempotencyRecords.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Scope == scope && x.Key == key, ct);
        if (previous is null) return null;
        if (previous.RequestHash != FocusHash(payload)) throw Conflict("idempotency_conflict", "Bu anahtar başka bir odak komutunda kullanılmış.");
        return JsonSerializer.Deserialize<FocusView>(previous.Response, Json)!;
    }
    private void FocusRemember(Guid userId, string scope, string key, object payload, FocusView view, DateTimeOffset now) => db.IdempotencyRecords.Add(new() { UserId = userId, Scope = scope, Key = key, RequestHash = FocusHash(payload), CreatedAt = now, Response = JsonSerializer.Serialize(view, Json) });
    private async Task<FocusSession> FindFocus(Guid userId, Guid id, CancellationToken ct) => await db.FocusSessions.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id, ct) ?? throw new UseCaseException(ErrorKind.NotFound, "focus_not_found", "Odak oturumu bulunamadı.");
    private static FocusView FocusViewOf(FocusSession focus, WorkSession work, WorkSessionSegment[] segments, DateTimeOffset now)
    {
        var settings = FocusLifecycle.Settings(focus); FocusMeasurement time;
        try { time = FocusRules.Measure(focus, settings, segments, now); } catch (ArgumentOutOfRangeException) { throw Conflict("server_clock_conflict", "Sunucu zamanı çalışma kaydından geride."); }
        var breakSeconds = FocusRules.BreakSeconds(settings, focus.CycleNumber); var breakElapsed = focus.BreakStartedAt is { } started ? Math.Min(breakSeconds, Math.Max(0, WorkTime.Seconds(started, focus.BreakEndedAt ?? now))) : 0;
        return new(focus.Id, focus.WorkSessionId, work.TaskId, focus.PreviousFocusId, focus.CycleNumber, focus.State, settings, focus.PresetId, focus.PresetName, focus.PresetVersion,
            focus.StartedAt, focus.WorkEndedAt, focus.BreakStartedAt, focus.BreakEndedAt, focus.EndedAt, focus.TargetReachedAt, focus.TargetObservedAt, focus.TargetReachedAt.HasValue ? focus.Id : null,
            time.ActiveSeconds, time.RemainingSeconds, time.OvertimeSeconds, time.TargetInstant.HasValue, breakSeconds, breakElapsed, focus.BreakStartedAt.HasValue ? Math.Max(0, breakSeconds - breakElapsed) : breakSeconds,
            focus.Version, work.Version, now);
    }
    private async Task ObserveFocus(FocusSession focus, WorkSession work, WorkSessionSegment[] segments, UserPlanningState state, DateTimeOffset now, CancellationToken ct, bool allowAutomaticBreak = true)
    {
        if (focus.State is FocusState.Finished or FocusState.Interrupted) return;
        if (now < focus.StartedAt || focus.BreakStartedAt > now) throw Conflict("server_clock_conflict", "Sunucu zamanı odak kaydından geride.");
        await FocusLifecycle.SyncWork(db, work, segments, now, ct);
        if (allowAutomaticBreak && focus.State == FocusState.Working && FocusLifecycle.Settings(focus).TargetBehavior == FocusTargetBehavior.AutoBreak && FocusRules.Measure(focus, FocusLifecycle.Settings(focus), segments, now).TargetInstant.HasValue)
        {
            await FocusWorkState(work, segments, WorkState.Paused, now, ct); focus.WorkEndedAt = now; focus.BreakStartedAt = now; focus.State = FocusState.Break; focus.Version++; state.PlanningVersion++; state.UpdatedAt = now;
        }
        if (focus.State == FocusState.Break && focus.BreakStartedAt!.Value.AddSeconds(FocusRules.BreakSeconds(FocusLifecycle.Settings(focus), focus.CycleNumber)) <= now)
        {
            focus.BreakEndedAt = focus.BreakStartedAt.Value.AddSeconds(FocusRules.BreakSeconds(FocusLifecycle.Settings(focus), focus.CycleNumber)); focus.State = FocusState.AwaitingNext; focus.Version++;
        }
    }
}

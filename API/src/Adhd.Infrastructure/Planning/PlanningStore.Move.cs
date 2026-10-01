using Adhd.Application.Planning;
using Adhd.Domain.Planning;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Planning;

public sealed partial class PlanningStore
{
    public async Task<PlanMutationResult> MoveAsync(Guid userId, Guid id, MoveSchedule command, string key, CancellationToken ct)
    {
        command = command with { StartsAt = Utc(command.StartsAt), EndsAt = Utc(command.EndsAt), Reason = Reason(command.Reason) };
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var replay = await Replay(userId, "schedule-move", key, new { id, command }, ct); if (replay is not null) return new(replay, true);
        var block = await Find(userId, id, ct); CheckVersion(state, command.ExpectedPlanningVersion); ValidateDate(command.TargetDate);
        if (block.Version != command.Version || block.State != ScheduleState.Planned) throw Conflict("schedule_stale", "Plan bloğu değişmiş; güncel kaydı alın.");
        var source = await db.DailyPlans.SingleAsync(x => x.UserId == userId && x.Id == block.DailyPlanId, ct);
        if (source.LocalDate == command.TargetDate) throw Invalid("move_same_day", "Aynı gün saat değişimi için blok güncellemesini kullanın.");
        var now = clock.GetUtcNow();
        if (block.StartsAt < now || command.StartsAt < now) throw Conflict("move_history_protected", "Geçmiş veya başlamış plan parçası başka güne taşınamaz.");
        if (await db.WorkSessions.AnyAsync(x => x.UserId == userId && x.State == WorkState.Running && x.StartedScheduleId == id, ct)) throw Conflict("move_active_work", "Aktif çalışmanın başlangıç bloğu taşınamaz.");
        if ((block.IsFixed || block.IsLocked) && !command.AllowProtectedChange) throw Conflict("schedule_protected", "Sabit/kilitli bloğu taşıma niyetini açık belirtin.");
        var target = await Plan(userId, command.TargetDate, null, ct); PlanDayPart[] parts;
        try { parts = PlanTime.Split(command.StartsAt, command.EndsAt, target.TimeZoneId); } catch (ArgumentException) { throw Invalid("schedule_range_invalid", "Geçerli hedef saat aralığı girin."); }
        if (parts.Length != 1 || parts[0].LocalDate != command.TargetDate) throw Invalid("move_target_day_mismatch", "Yeni blok hedef günün kayıtlı zaman dilimi içinde kalmalı.");
        var before = RevisionWriter.View(block); block.DailyPlanId = target.Id; block.StartsAt = command.StartsAt; block.EndsAt = command.EndsAt; block.IsAutomatic = false; block.Version++;
        var warnings = await Conflicts(userId, block, command.AllowConflicts, ct);
        var deltas = new PlanDelta[] { new(block, before, "MovedOut", source.Id, before with { State = ScheduleState.Removed, Version = block.Version }), new(block, null, "MovedIn", target.Id) };
        var changeSet = Guid.CreateVersion7(); var revisions = await RevisionWriter.Write(db, userId, deltas, now, "Move", command.Reason!, changeSet, command.AllowConflicts, ct);
        state.PlanningVersion++; state.UpdatedAt = now; warnings = [.. warnings, .. await QuantityWarnings(userId, block.TaskId, now, ct)];
        var result = new PlanMutation(changeSet, state.PlanningVersion, [RevisionWriter.View(block)], revisions, warnings);
        Remember(userId, "schedule-move", key, new { id, command }, result, now); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return new(result, false);
    }
}

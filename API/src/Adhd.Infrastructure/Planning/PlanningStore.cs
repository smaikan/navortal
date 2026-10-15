using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Adhd.Application.Common;
using Adhd.Application.Planning;
using Adhd.Application.Preferences;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Adhd.Domain.Users;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Planning;

public sealed partial class PlanningStore(PlannerDbContext db, IPreferencesStore preferences, WorkStore work, TimeProvider clock, DayGlanceStore glance) : IPlanningStore
{
    public async Task<PlanMutationResult> CreateAsync(Guid userId, CreateSchedule command, string key, CancellationToken ct)
    {
        command = command with { StartsAt = Utc(command.StartsAt), EndsAt = Utc(command.EndsAt), Reason = Reason(command.Reason) };
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var replay = await Replay(userId, "schedule-create", key, command, ct); if (replay is not null) return new(replay, true);
        CheckVersion(state, command.ExpectedPlanningVersion); ValidateDate(command.LocalDate);
        var first = await Plan(userId, command.LocalDate, null, ct); PlanDayPart[] parts;
        try { parts = PlanTime.Split(command.StartsAt, command.EndsAt, first.TimeZoneId); }
        catch (ArgumentException) { throw Invalid("schedule_range_invalid", "Plan aralığı pozitif ve en çok7 gün olmalı."); }
        if (parts[0].LocalDate != command.LocalDate) throw Invalid("schedule_day_mismatch", "Başlangıç seçilen planın yerel gününde olmalı.");
        TaskItem? task = null; string? metadata = null;
        if (command.Kind == ScheduleKind.Work)
        {
            if (command.TaskId is null) throw Invalid("task_required", "Çalışma bloğu görev gerektirir.");
            task = await db.Tasks.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == command.TaskId, ct) ?? throw Missing("task_not_found", "Görev bulunamadı.");
            if (!task.HasDirectWork || task.DirectWorkCompleted || task.ArchivedAt is not null || task.State is not (TaskState.Pending or TaskState.InProgress or TaskState.Paused))
                throw Conflict("task_not_plannable", "Yalnız açık doğrudan işi planlayabilirsiniz.");
            metadata = JsonSerializer.Serialize(new PlanningTaskSnapshot(await work.Snapshot(task, state.PlanningVersion, ct), task.State, task.HasDirectWork, task.DirectWorkCompleted, task.RequiredForParent, task.DirectEstimatedSeconds, task.TargetBudgetSeconds, task.Priority, task.EnergyDemand), RevisionWriter.Json);
        }
        else if (command.TaskId.HasValue) throw Invalid("schedule_kind_invalid", "Mola ve tampon görev taşıyamaz.");
        var timedItem = command.DayItemId is { } dayItemId ? await TimeDayItem(userId, dayItemId, command, ct) : null;
        var deltas = new List<PlanDelta>(); var warnings = new List<PlanningWarning>(); var group = parts.Length > 1 ? Guid.CreateVersion7() : (Guid?)null; Guid? origin = null;
        foreach (var part in parts)
        {
            var plan = part.LocalDate == first.LocalDate ? first : await Plan(userId, part.LocalDate, first.TimeZoneId, ct);
            var block = new TaskSchedule { Id = Guid.CreateVersion7(), UserId = userId, DailyPlanId = plan.Id, TaskId = command.TaskId, Kind = command.Kind,
                StartsAt = part.StartsAt, EndsAt = part.EndsAt, IsFixed = command.IsFixed, IsLocked = command.IsLocked, SplitGroupId = group, OriginScheduleId = origin, TaskSnapshot = metadata };
            warnings.AddRange(await Conflicts(userId, block, command.AllowConflicts, ct)); db.TaskSchedules.Add(block); deltas.Add(new(block, null, group is null ? "Added" : "SplitAdded")); origin ??= block.Id;
        }
        if (timedItem is not null) timedItem.ScheduleId = origin;
        var now = clock.GetUtcNow(); var changeSet = Guid.CreateVersion7();
        var revisions = await RevisionWriter.Write(db, userId, deltas, now, "Manual", command.Reason!, changeSet, command.AllowConflicts, ct);
        warnings.AddRange(await QuantityWarnings(userId, command.TaskId, now, ct));
        state.PlanningVersion++; state.UpdatedAt = now;
        var result = new PlanMutation(changeSet, state.PlanningVersion, deltas.Select(x => RevisionWriter.View(x.Schedule)).ToArray(), revisions, warnings.ToArray());
        Remember(userId, "schedule-create", key, command, result, now); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return new(result, false);
    }
    public async Task<PlanMutationResult> ChangeAsync(Guid userId, Guid id, UpdateSchedule command, bool remove, string key, CancellationToken ct)
    {
        command = command with { StartsAt = Utc(command.StartsAt), EndsAt = Utc(command.EndsAt), Reason = Reason(command.Reason) };
        var scope = remove ? "schedule-remove" : "schedule-update"; var payload = new { id, command };
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var replay = await Replay(userId, scope, key, payload, ct); if (replay is not null) return new(replay, true);
        var block = await Find(userId, id, ct); CheckVersion(state, command.ExpectedPlanningVersion);
        if (block.Version != command.Version) throw Conflict("version_conflict", "Blok değişmiş; güncel kaydı alın.");
        if (block.State == ScheduleState.Removed) throw Conflict("schedule_removed", "Blok kaldırılmış.");
        if ((block.IsFixed || block.IsLocked) && !command.AllowProtectedChange) throw Conflict("schedule_protected", "Sabit/kilitli bloğu değiştirme niyetini açık belirtin.");
        var before = RevisionWriter.View(block); PlanningWarning[] warnings = [];
        if (remove) block.State = ScheduleState.Removed;
        else
        {
            var plan = await db.DailyPlans.SingleAsync(x => x.UserId == userId && x.Id == block.DailyPlanId, ct);
            PlanDayPart[] parts;
            try { parts = PlanTime.Split(command.StartsAt, command.EndsAt, plan.TimeZoneId); } catch (ArgumentException) { throw Invalid("schedule_range_invalid", "Geçerli plan aralığı girin."); }
            if (parts.Length != 1 || parts[0].LocalDate != plan.LocalDate) throw Conflict("schedule_move_requires_intent", "Başka güne taşımayı ayrı çok günlük move komutuyla yapın.");
            block.StartsAt = command.StartsAt; block.EndsAt = command.EndsAt; block.IsFixed = command.IsFixed; block.IsLocked = command.IsLocked;
            block.IsAutomatic = false;
            warnings = await Conflicts(userId, block, command.AllowConflicts, ct);
        }
        block.Version++; var now = clock.GetUtcNow(); var changeSet = Guid.CreateVersion7();
        var revisions = await RevisionWriter.Write(db, userId, [new(block, before, remove ? "Removed" : "Updated")], now, "Manual", command.Reason!, changeSet, command.AllowConflicts, ct);
        warnings = [.. warnings, .. await QuantityWarnings(userId, block.TaskId, now, ct)];
        state.PlanningVersion++; state.UpdatedAt = now;
        var result = new PlanMutation(changeSet, state.PlanningVersion, [RevisionWriter.View(block)], revisions, warnings);
        Remember(userId, scope, key, payload, result, now); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return new(result, false);
    }
    private async Task<DailyPlan> Plan(Guid userId, DateOnly date, string? zone, CancellationToken ct)
    {
        ValidateDate(date);
        // Aynı gün kayıt öncesi iki kez istenebilir. Bellekte eklenmiş plan varsa onu kullan
        var plan = db.DailyPlans.Local.FirstOrDefault(x => x.UserId == userId && x.LocalDate == date)
            ?? await db.DailyPlans.SingleOrDefaultAsync(x => x.UserId == userId && x.LocalDate == date, ct);
        if (plan is not null) { if (zone is not null && plan.TimeZoneId != zone) throw Conflict("plan_zone_conflict", "Günlerin kayıtlı zaman dilimleri farklı; ayrı planlayın."); return plan; }
        plan = new() { Id = Guid.CreateVersion7(), UserId = userId, LocalDate = date, TimeZoneId = zone ?? (await preferences.ReadAsync(userId, ct)).Values.TimeZoneId }; db.DailyPlans.Add(plan); return plan;
    }
    private async Task<PlanningWarning[]> Conflicts(Guid userId, TaskSchedule block, bool accept, CancellationToken ct)
    {
        var ids = await db.TaskSchedules.AsNoTracking().Where(x => x.UserId == userId && x.Id != block.Id && x.State == ScheduleState.Planned && x.StartsAt < block.EndsAt && x.EndsAt > block.StartsAt).Select(x => x.Id).ToArrayAsync(ct);
        if (ids.Length > 0 && !accept) throw Conflict("schedule_overlap", "Plan bloğu çakışıyor; açık kabul veya yeni saat gerekli.");
        return ids.Length == 0 ? [] : [new("manual_overlap_accepted", ids)];
    }
    private async Task<PlanMutation?> Replay(Guid userId, string scope, string key, object payload, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 128) throw Invalid("idempotency_key_required", "Idempotency-Key gerekli; en çok128 karakter.");
        var row = await db.IdempotencyRecords.SingleOrDefaultAsync(x => x.UserId == userId && x.Scope == scope && x.Key == key, ct);
        if (row is null) return null;
        if (row.RequestHash != Hash(payload)) throw Conflict("idempotency_conflict", "Anahtar başka bir komutta kullanılmış.");
        return JsonSerializer.Deserialize<PlanMutation>(row.Response, RevisionWriter.Json)!;
    }
    private void Remember(Guid userId, string scope, string key, object payload, PlanMutation result, DateTimeOffset now) => db.IdempotencyRecords.Add(new() { UserId = userId, Scope = scope, Key = key, RequestHash = Hash(payload), Response = JsonSerializer.Serialize(result, RevisionWriter.Json), CreatedAt = now });
    private static string Hash(object value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value, RevisionWriter.Json))));
    private static DateTimeOffset Utc(DateTimeOffset value) => new(value.UtcTicks - value.UtcTicks % 10, TimeSpan.Zero);
    private static string Reason(string? value) => string.IsNullOrWhiteSpace(value) ? "Manuel plan düzenlemesi" : value.Trim().Length <= 2000 ? value.Trim() : throw Invalid("reason_invalid", "Neden en çok2000 karakter olabilir.");
    private static void ValidateDate(DateOnly date) { if (date.Year is < 2 or > 9998) throw Invalid("date_invalid", "Geçerli plan günü girin."); }
    private static void CheckVersion(UserPlanningState state, long version) { if (state.PlanningVersion != version) throw Conflict("planning_version_conflict", "Plan girdileri değişmiş; güncel planı alın."); }
    private Task<UserPlanningState> Lock(Guid userId, CancellationToken ct) => db.PlanningStates.FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\" = {userId} FOR UPDATE").SingleAsync(ct);
    private async Task<TaskSchedule> Find(Guid userId, Guid id, CancellationToken ct) => await db.TaskSchedules.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id, ct) ?? throw Missing("schedule_not_found", "Blok bulunamadı.");
    private static UseCaseException Conflict(string code, string message) => new(ErrorKind.Conflict, code, message);
    private static UseCaseException Invalid(string code, string message) => new(ErrorKind.Validation, code, message);
    private static UseCaseException Missing(string code, string message) => new(ErrorKind.NotFound, code, message);
}

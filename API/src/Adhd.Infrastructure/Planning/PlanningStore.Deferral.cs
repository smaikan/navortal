using System.Data;

using System.Text.Json;

using Adhd.Application.Planning;

using Adhd.Domain.Planning;

using Adhd.Domain.Tasks;

using Adhd.Domain.Work;

using Microsoft.EntityFrameworkCore;



namespace Adhd.Infrastructure.Planning;



public sealed partial class PlanningStore

{

    private sealed record DeferralCapture(DayDeferralPreview Preview, TaskSchedule[] Blocks, DayItem[] Items);



    public async Task<DayDeferralPreview> PreviewDeferralAsync(Guid userId, DateOnly sourceDate, DeferDaySelection command, CancellationToken ct)

    {

        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);

        var capture = await CaptureDeferral(userId, sourceDate, command, ct);

        await tx.CommitAsync(ct);

        return capture.Preview;

    }



    private async Task<DeferralCapture> CaptureDeferral(Guid userId, DateOnly sourceDate, DeferDaySelection command, CancellationToken ct)

    {

        ValidateDate(sourceDate); ValidateDate(command.TargetDate);

        if (command.TargetDate <= sourceDate) throw Invalid("defer_target_invalid", "Kaynak günden sonraki bir günü seçin.");

        var version = await db.PlanningStates.AsNoTracking().Where(x => x.UserId == userId).Select(x => x.PlanningVersion).SingleAsync(ct);

        if (version != command.ExpectedPlanningVersion) throw Conflict("planning_version_conflict", "Plan değişmiş; güncel planı alın.");

        var planId = await db.DailyPlans.AsNoTracking().Where(x => x.UserId == userId && x.LocalDate == sourceDate).Select(x => (Guid?)x.Id).SingleOrDefaultAsync(ct);

        var scheduleIds = command.Schedules.Select(x => x.Id).ToArray();

        var blocks = await db.TaskSchedules.AsNoTracking().Where(x => x.UserId == userId && scheduleIds.Contains(x.Id)).OrderBy(x => x.Id).ToArrayAsync(ct);

        if (blocks.Length != scheduleIds.Length) throw Missing("schedule_not_found", "Seçilen saatli öğe bulunamadı.");

        foreach (var block in blocks)

        {

            if (block.Version != command.Schedules.Single(x => x.Id == block.Id).Version) throw Conflict("schedule_stale", "Saatli öğe değişmiş; güncel planı alın.");

            if (block.DailyPlanId != planId || block.Kind != ScheduleKind.Work || block.TaskId is null) throw Invalid("defer_source_mismatch", "Seçilen çalışma öğesi kaynak günün planında olmalı.");

            if (block.State != ScheduleState.Planned || block.CompletedAt is not null) throw Conflict("defer_item_not_open", "Yalnız açık plan öğeleri ertelenebilir.");

        }

        var ids = command.Items.Select(x => x.Id).ToArray();

        var items = await db.DayItems.AsNoTracking().Where(x => x.UserId == userId && ids.Contains(x.Id)).OrderBy(x => x.Id).ToArrayAsync(ct);

        if (items.Length != ids.Length) throw Missing("day_item_not_found", "Seçilen saatsiz öğe bulunamadı.");

        foreach (var item in items)

        {

            if (item.Version != command.Items.Single(x => x.Id == item.Id).Version) throw Conflict("version_conflict", "Saatsiz öğe değişmiş; güncel planı alın.");

            if (item.LocalDate != sourceDate) throw Invalid("defer_source_mismatch", "Saatsiz öğe kaynak günün planında olmalı.");

            if (item.State != DayItemState.Planned || item.CompletedAt is not null) throw Conflict("defer_item_not_open", "Yalnız açık plan öğeleri ertelenebilir.");

        }

        var taskIds = blocks.Select(x => x.TaskId!.Value).Concat(items.Select(x => x.TaskId)).Distinct().Order().ToArray();

        var tasks = await db.Tasks.AsNoTracking().Where(x => x.UserId == userId && taskIds.Contains(x.Id) && x.DeletedAt == null).ToArrayAsync(ct);

        if (tasks.Length != taskIds.Length) throw Missing("task_not_found", "Görev bulunamadı.");

        foreach (var task in tasks) Plannable(task);

        var target = await db.DayItems.AsNoTracking().Where(x => x.UserId == userId && x.LocalDate == command.TargetDate && taskIds.Contains(x.TaskId) && x.State == DayItemState.Planned).ToArrayAsync(ct);

        var issues = new List<DayDeferralIssue>();
        if (await db.RecurrenceOccurrences.AsNoTracking().AnyAsync(x => x.UserId == userId && x.TaskId.HasValue && taskIds.Contains(x.TaskId.Value), ct))
            issues.Add(new("defer_recurring_task", "Rutin görevleri ertelenemez."));

        if (!command.AllowProtectedChange && blocks.Any(x => x.IsFixed || x.IsLocked)) issues.Add(new("defer_schedule_protected", "Sabit veya kilitli saati iptal etmek için açık izin gerekli."));

        if (await db.WorkSessions.AsNoTracking().AnyAsync(x => x.UserId == userId && x.TaskId.HasValue && taskIds.Contains(x.TaskId.Value) && x.State == WorkState.Running, ct))

            issues.Add(new("defer_work_running", "Çalışan işi önce açıkça duraklat; erteleme çalışmayı durdurmaz."));

        if (target.Any(x => x.CompletedAt is not null)) issues.Add(new("defer_target_completed", "Bu görevin hedef gündeki öğesi tamamlanmış. Başka bir gün seç; öğe kendiliğinden açılmaz."));

        var views = new List<DayItemView>();

        foreach (var item in items) views.Add(View(item, await TaskOf(userId, item.TaskId, ct)));

        var preview = new DayDeferralPreview(sourceDate, command.TargetDate, version, blocks.Select(RevisionWriter.View).ToArray(), views.ToArray(),

            taskIds.Select(id => new DayDeferralTask(id, tasks.Single(x => x.Id == id).Title, target.Any(x => x.TaskId == id))).ToArray(), issues.ToArray(), issues.Count == 0);

        return new(preview, blocks, items);

    }



    public async Task<DayDeferralOutcome> DeferAsync(Guid userId, DateOnly sourceDate, DeferDaySelection command, string key, CancellationToken ct)

    {

        if (string.IsNullOrWhiteSpace(key) || key.Length > 128) throw Invalid("idempotency_key_required", "Idempotency-Key gerekli; en çok128 karakter.");

        command = command with { Schedules = command.Schedules.OrderBy(x => x.Id).ToArray(), Items = command.Items.OrderBy(x => x.Id).ToArray(), Reason = Reason(command.Reason) };

        var payload = new { sourceDate, command }; var hash = Hash(payload); const string scope = "day-defer";

        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);

        var receipt = await db.IdempotencyRecords.SingleOrDefaultAsync(x => x.UserId == userId && x.Scope == scope && x.Key == key, ct);

        if (receipt is not null)

        {

            if (receipt.RequestHash != hash) throw Conflict("idempotency_conflict", "Anahtar başka bir komutta kullanılmış.");

            return new(JsonSerializer.Deserialize<DayDeferralResult>(receipt.Response, RevisionWriter.Json)!, true);

        }

        var capture = await CaptureDeferral(userId, sourceDate, command, ct);

        if (!capture.Preview.CanApply) throw Conflict(capture.Preview.Issues[0].Code, capture.Preview.Issues[0].Message);

        var now = clock.GetUtcNow();
        var applied = await ApplyDeferralTarget(userId,sourceDate,command,capture,now,ct);
        var deltas=applied.Deltas; var dayDeltas=applied.DayDeltas; var blocks=applied.Blocks;
        var changeSet = Guid.CreateVersion7();

        var revisions = await RevisionWriter.Write(db, userId, deltas, now, "Defer", command.Reason!, changeSet, false, ct, "defer-v1", dayDeltas: dayDeltas);

        state.PlanningVersion++; state.UpdatedAt = now; await db.SaveChangesAsync(ct);

        var moved = new List<DayItemView>(); foreach (var item in applied.TargetItems.OrderBy(x => x.SortOrder).ThenBy(x => x.Id)) moved.Add(await Read(userId, item.Id, ct));

        var result = new DayDeferralResult(changeSet, state.PlanningVersion, blocks.Select(RevisionWriter.View).ToArray(), moved.ToArray(), revisions);

        db.IdempotencyRecords.Add(new() { UserId = userId, Scope = scope, Key = key, RequestHash = hash, Response = JsonSerializer.Serialize(result, RevisionWriter.Json), CreatedAt = now });

        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return new(result, false);

    }

    private sealed record DeferralApplication(List<PlanDelta> Deltas,List<DayDelta> DayDeltas,TaskSchedule[] Blocks,DayItem[] TargetItems);
    private async Task<DeferralApplication> ApplyDeferralTarget(Guid userId,DateOnly sourceDate,DeferDaySelection command,DeferralCapture capture,DateTimeOffset now,CancellationToken ct)
    {
        var source = await Plan(userId, sourceDate, null, ct); var target = await Plan(userId, command.TargetDate, null, ct);

        var taskIds = capture.Preview.Tasks.Select(x => x.TaskId).ToArray();

        var targetItems = await db.DayItems.Where(x => x.UserId == userId && x.LocalDate == command.TargetDate && taskIds.Contains(x.TaskId) && x.State == DayItemState.Planned).ToDictionaryAsync(x => x.TaskId, ct);

        var selectedIds = capture.Items.Select(x => x.Id).ToArray(); var sourceItems = await db.DayItems.Where(x => x.UserId == userId && selectedIds.Contains(x.Id)).ToDictionaryAsync(x => x.TaskId, ct);

        var scheduleIds = capture.Blocks.Select(x => x.Id).ToArray(); var blocks = await db.TaskSchedules.Where(x => x.UserId == userId && scheduleIds.Contains(x.Id)).ToArrayAsync(ct);

        var deltas = new List<PlanDelta>(); var dayDeltas = new List<DayDelta>();

        foreach (var block in blocks)

        {

            var before = RevisionWriter.View(block); block.State = ScheduleState.Removed; block.Version++;

            deltas.Add(new(block, before, "Removed"));

        }

        var order = (await db.DayItems.Where(x => x.UserId == userId && x.LocalDate == command.TargetDate).MaxAsync(x => (int?)x.SortOrder, ct) ?? -1);

        foreach (var taskId in taskIds)

        {

            if (sourceItems.TryGetValue(taskId, out var item))

            {

                var before = RevisionWriter.Snapshot(item); item.Version++; item.UpdatedAt = now;

                if (targetItems.ContainsKey(taskId))

                {

                    item.State = DayItemState.Removed;

                    dayDeltas.Add(new(item, before, "DayItemRemoved", source.Id));

                }

                else

                {

                    item.LocalDate = command.TargetDate; item.SortOrder = checked(++order); item.StartsAt=null; item.EndsAt=null; item.IsUrgent=false; item.TimingIssue=null;

                    dayDeltas.Add(new(item, before, "DayItemMovedOut", source.Id, before with { State = DayItemState.Removed, Version = item.Version }));

                    dayDeltas.Add(new(item, null, "DayItemMovedIn", target.Id)); targetItems.Add(taskId, item);

                }

            }

            else if (!targetItems.ContainsKey(taskId))

            {

                var added = new DayItem { Id = Guid.CreateVersion7(), UserId = userId, TaskId = taskId, LocalDate = command.TargetDate, SortOrder = checked(++order), CreatedAt = now, UpdatedAt = now };

                db.DayItems.Add(added); dayDeltas.Add(new(added, null, "DayItemAdded", target.Id)); targetItems.Add(taskId, added);

            }

        }

        return new(deltas,dayDeltas,blocks,targetItems.Values.ToArray());
    }

}


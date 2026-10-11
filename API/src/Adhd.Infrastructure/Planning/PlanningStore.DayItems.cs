using System.Text.Json;
using Adhd.Application.Planning;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Planning;

// Saatsiz öğeleri kapasite, çakışma, motor ve hatırlatmaya katma. Her değişiklik
// sürümü artırır ve geçmişten geri alınabilir. Öğeyi bitirmek görevi bitirmez.
public sealed partial class PlanningStore
{
    public async Task<DayItemPage> DayItemsAsync(Guid userId, DateOnly date, int offset, int limit, CancellationToken ct)
    {
        ValidateDate(date);
        var rows = Visible(userId).Where(x => x.Item.LocalDate == date);
        var total = await rows.CountAsync(ct);
        var page = await rows.OrderBy(x => x.Item.SortOrder).ThenBy(x => x.Item.Id).Skip(offset).Take(limit).ToArrayAsync(ct);
        return new(page.Select(View).ToArray(), offset, limit, total);
    }
    public async Task<DayItemView> AddDayItemAsync(Guid userId, DateOnly date, Guid taskId, DayItemPlacement placement, CancellationToken ct)
    {
        ValidateDate(date);
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var task = await db.Tasks.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == taskId && x.DeletedAt == null, ct) ?? throw Missing("task_not_found", "Görev bulunamadı.");
        Plannable(task);
        if (await db.DayItems.AnyAsync(x => x.UserId == userId && x.LocalDate == date && x.TaskId == taskId && x.State == DayItemState.Planned, ct))
            throw Conflict("day_item_exists", "Bu görev bu günün planında zaten var.");
        var now = clock.GetUtcNow(); var plan = await Plan(userId, date, null, ct);
        int order;
        if (placement == DayItemPlacement.First)
        {
            // Yarının ilk işini en üste koy. Diğer işlerin sırası aynı kalsın.
            await db.DayItems.Where(x => x.UserId == userId && x.LocalDate == date).ExecuteUpdateAsync(s => s.SetProperty(x => x.SortOrder, x => x.SortOrder + 1), ct);
            order = 0;
        }
        else order = (await db.DayItems.Where(x => x.UserId == userId && x.LocalDate == date).MaxAsync(x => (int?)x.SortOrder, ct) ?? -1) + 1;
        var item = new DayItem { Id = Guid.CreateVersion7(), UserId = userId, LocalDate = date, TaskId = taskId, SortOrder = order, CreatedAt = now, UpdatedAt = now };
        db.DayItems.Add(item);
        var changeSet = await History(userId, state, [new(item, null, placement == DayItemPlacement.First ? "DayItemAddedFirst" : "DayItemAdded", plan.Id)], now, "Plana eklendi", null, ct);
        await tx.CommitAsync(ct);
        return await Read(userId, item.Id, ct) with { ChangeSetId = changeSet, PlanningVersion = state.PlanningVersion };
    }
    public async Task<DayItemView> ChangeDayItemAsync(Guid userId, Guid id, long version, DayItemAction action, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var item = await Current(userId, id, version, ct); var now = clock.GetUtcNow(); var before = RevisionWriter.Snapshot(item);
        switch (action)
        {
            case DayItemAction.Complete: item.CompletedAt ??= now; break;
            case DayItemAction.Reopen: item.CompletedAt = null; break;
            case DayItemAction.Remove: item.State = DayItemState.Removed; break;
        }
        item.Version++; item.UpdatedAt = now;
        var plan = await Plan(userId, item.LocalDate, null, ct);
        var type = action switch { DayItemAction.Complete => "DayItemCompleted", DayItemAction.Reopen => "DayItemReopened", _ => "DayItemRemoved" };
        var reason = action switch { DayItemAction.Complete => "Plan öğesi bitti", DayItemAction.Reopen => "Plan öğesi yeniden açıldı", _ => "Plandan kaldırıldı" };
        var changeSet = await History(userId, state, [new(item, before, type, plan.Id)], now, reason, null, ct);
        await tx.CommitAsync(ct);
        var view = action == DayItemAction.Remove ? View(item, await TaskOf(userId, item.TaskId, ct)) : await Read(userId, item.Id, ct);
        return view with { ChangeSetId = changeSet, PlanningVersion = state.PlanningVersion };
    }
    public async Task<DayItemView> MoveDayItemAsync(Guid userId, Guid id, long version, DateOnly targetDate, CancellationToken ct)
    {
        ValidateDate(targetDate);
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var item = await Current(userId, id, version, ct); var now = clock.GetUtcNow();
        var deltas = await MoveOne(userId, item, targetDate, now, ct);
        var changeSet = await History(userId, state, deltas, now, "Başka güne taşındı", null, ct);
        await tx.CommitAsync(ct);
        return await Read(userId, item.Id, ct) with { ChangeSetId = changeSet, PlanningVersion = state.PlanningVersion };
    }
    // UI-R3 "Bugünü hafiflet": several untimed items of one day move together in one undoable change set.
    public async Task<DayItemBatchResult> MoveDayItemsAsync(Guid userId, DateOnly date, DayItemMoveEntry[] items, DateOnly targetDate, CancellationToken ct)
    {
        ValidateDate(date); ValidateDate(targetDate);
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct); var now = clock.GetUtcNow();
        var deltas = new List<DayDelta>(); var moved = new List<DayItem>();
        foreach (var entry in items)
        {
            var item = await Current(userId, entry.Id, entry.Version, ct);
            if (item.LocalDate != date) throw Invalid("day_item_day_mismatch", "Gün öğesi seçilen plan gününde olmalı.");
            deltas.AddRange(await MoveOne(userId, item, targetDate, now, ct)); moved.Add(item);
        }
        var changeSet = await History(userId, state, deltas, now, "Bugün hafifletildi", null, ct);
        await tx.CommitAsync(ct);
        var views = new List<DayItemView>(); foreach (var item in moved) views.Add(await Read(userId, item.Id, ct));
        return new(changeSet, state.PlanningVersion, views.ToArray());
    }
    // Son saatsiz değişikliği geri al.
    // Etkilenen gün veya öğe sonradan
    // değiştiyse ya da işlem
    // zaten geri alındıysa reddet.
    public async Task<DayItemBatchResult> UndoDayItemsAsync(Guid userId, Guid changeSetId, long expectedPlanningVersion, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct); CheckVersion(state, expectedPlanningVersion);
        var revisions = await db.PlanRevisions.Where(x => x.UserId == userId && x.ChangeSetId == changeSetId).ToArrayAsync(ct);
        if (revisions.Length == 0) throw Missing("change_set_not_found", "Değişiklik grubu bulunamadı.");
        if (await db.PlanRevisions.AnyAsync(x => x.UserId == userId && x.ReversesChangeSetId == changeSetId, ct)) throw Conflict("undo_already_applied", "Bu değişiklik zaten geri alındı.");
        foreach (var revision in revisions)
        {
            var latest = await db.PlanRevisions.Where(x => x.UserId == userId && x.DailyPlanId == revision.DailyPlanId && x.Trigger != "TaskState").OrderByDescending(x => x.Number).Select(x => x.Id).FirstAsync(ct);
            if (latest != revision.Id) throw Conflict("undo_not_latest", "Yalnız günün son plan değişikliğini geri alabilirsin.");
        }
        var revisionIds = revisions.Select(x => x.Id).ToArray();
        var changes = await db.PlanRevisionChanges.Where(x => x.UserId == userId && revisionIds.Contains(x.RevisionId)).OrderBy(x => x.Id).ToArrayAsync(ct);
        if (revisions.All(x => x.Trigger == "Defer"))
        {
            var result = await UndoDeferral(userId, changeSetId, state, revisions, changes, ct);
            await tx.CommitAsync(ct);
            return result;
        }
        if (revisions.All(x => x.Trigger == "Pool"))
        {
            var result = await UndoPoolBatch(userId, changeSetId, state, revisions, changes, ct);
            await tx.CommitAsync(ct);
            return result;
        }
        if (changes.Any(x => x.DayItemId is null)) throw Conflict("undo_use_schedule", "Saatli plan değişikliğini plan geçmişinden geri al.");
        var now = clock.GetUtcNow(); var deltas = new List<DayDelta>(); var touched = new Dictionary<Guid, DayItem>();
        // Taşıma her gün için bir değişiklik yazar. Öğeyi bir kez, en eski haline döndür.
        foreach (var group in changes.GroupBy(x => x.DayItemId!.Value))
        {
            var item = await db.DayItems.SingleAsync(x => x.UserId == userId && x.Id == group.Key, ct);
            var first = group.First(); var last = group.Last();
            var after = JsonSerializer.Deserialize<DayItemSnapshot>(last.After!, RevisionWriter.Json)!;
            if (item.Version != after.Version || item.State != after.State) throw Conflict("undo_day_item_changed", "Plan öğesi bu değişiklikten sonra değişmiş; güncel planı al.");
            var before = first.Before is null ? null : JsonSerializer.Deserialize<DayItemSnapshot>(first.Before, RevisionWriter.Json)!;
            var current = RevisionWriter.Snapshot(item); var fromDate = item.LocalDate;
            if (before is null) item.State = DayItemState.Removed;
            else
            {
                if (before.State == DayItemState.Planned && await db.DayItems.AnyAsync(x => x.UserId == userId && x.Id != item.Id && x.LocalDate == before.LocalDate && x.TaskId == item.TaskId && x.State == DayItemState.Planned, ct))
                    throw Conflict("day_item_exists", "Bu görev o günün planında zaten var.");
                item.LocalDate = before.LocalDate; item.SortOrder = before.SortOrder; item.State = before.State; item.CompletedAt = before.CompletedAt;
                item.StartsAt = before.StartsAt; item.EndsAt = before.EndsAt; item.IsUrgent = before.IsUrgent; item.TimingIssue = before.TimingIssue;
            }
            item.Version++; item.UpdatedAt = now; touched[item.Id] = item;
            foreach (var date in new[] { fromDate, item.LocalDate }.Distinct())
                deltas.Add(new(item, current, "DayItemUndone", (await Plan(userId, date, null, ct)).Id));
        }
        var changeSet = await History(userId, state, deltas, now, "Geri alındı", changeSetId, ct);
        await tx.CommitAsync(ct);
        var views = new List<DayItemView>();
        foreach (var item in touched.Values) views.Add(item.State == DayItemState.Planned ? await Read(userId, item.Id, ct) : View(item, await TaskOf(userId, item.TaskId, ct)));
        return new(changeSet, state.PlanningVersion, views.ToArray());
    }
    private async Task<DayDelta[]> MoveOne(Guid userId, DayItem item, DateOnly targetDate, DateTimeOffset now, CancellationToken ct)
    {
        if (item.LocalDate == targetDate) throw Invalid("day_item_same_day", "Hedef gün öğenin bulunduğu günden farklı olmalı.");
        if (await db.DayItems.AnyAsync(x => x.UserId == userId && x.LocalDate == targetDate && x.TaskId == item.TaskId && x.State == DayItemState.Planned, ct))
            throw Conflict("day_item_exists", "Bu görev hedef günün planında zaten var.");
        var before = RevisionWriter.Snapshot(item); var from = await Plan(userId, item.LocalDate, null, ct); var to = await Plan(userId, targetDate, null, ct);
        var order = await db.DayItems.Where(x => x.UserId == userId && x.LocalDate == targetDate).MaxAsync(x => (int?)x.SortOrder, ct) ?? -1;
        // Aynı gruptaki taşınmış öğeler henüz DB'de yok. Sıra numaraları birbirine girmesin
        order = Math.Max(order, db.ChangeTracker.Entries<DayItem>().Where(x => x.Entity.UserId == userId && x.Entity.LocalDate == targetDate).Select(x => x.Entity.SortOrder).DefaultIfEmpty(-1).Max());
        if (item.StartsAt is {} start) {
            var fromZone = TimeZoneInfo.FindSystemTimeZoneById(from.TimeZoneId);
            var local = TimeZoneInfo.ConvertTime(start,fromZone); var shifted = EntryStart(targetDate,new TimeOnly(local.Hour,local.Minute),to.TimeZoneId);
            var duration = item.EndsAt-start; item.StartsAt=shifted; item.EndsAt=duration is {} length?shifted+length:null;
        }
        item.LocalDate = targetDate; item.SortOrder = order + 1; item.CompletedAt = null; item.Version++; item.UpdatedAt = now;
        return [new(item, before, "DayItemMovedOut", from.Id), new(item, before, "DayItemMovedIn", to.Id)];
    }
    // Değişen her gün için bir revizyon yaz ve plan sürümünü artır.
    private async Task<Guid> History(Guid userId, Adhd.Domain.Users.UserPlanningState state, IReadOnlyCollection<DayDelta> deltas, DateTimeOffset now, string reason, Guid? reverses, CancellationToken ct)
    {
        var changeSet = Guid.CreateVersion7();
        await RevisionWriter.Write(db, userId, [], now, "DayItem", reason, changeSet, false, ct, reversesChangeSetId: reverses, dayDeltas: deltas);
        state.PlanningVersion++; state.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        return changeSet;
    }
    // Saatli öğeyi bitir ya da tekrar aç. Gece yarısını geçen bloğun parçaları birlikte değişir.
    public async Task<ScheduleCompletion> CompleteScheduleAsync(Guid userId, Guid id, long version, bool complete, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(userId, ct);
        var block = await Find(userId, id, ct);
        if (block.Version != version) throw Conflict("version_conflict", "Blok değişmiş; güncel kaydı alın.");
        if (block.State == ScheduleState.Removed) throw Conflict("schedule_removed", "Blok kaldırılmış.");
        var group = block.SplitGroupId is { } split
            ? await db.TaskSchedules.Where(x => x.UserId == userId && x.SplitGroupId == split && x.State == ScheduleState.Planned).OrderBy(x => x.StartsAt).ToArrayAsync(ct)
            : [block];
        var now = clock.GetUtcNow();
        foreach (var part in group)
        {
            var next = complete ? part.CompletedAt ?? now : (DateTimeOffset?)null;
            if (part.CompletedAt == next) continue;
            part.CompletedAt = next; part.Version++;
        }
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return new(group.Select(RevisionWriter.View).ToArray());
    }
    private async Task<DayItem> TimeDayItem(Guid userId, Guid id, CreateSchedule command, CancellationToken ct)
    {
        if (command.Kind != ScheduleKind.Work) throw Invalid("schedule_kind_invalid", "Gün öğesine yalnız çalışma bloğu verilebilir.");
        var item = await Current(userId, id, command.DayItemVersion ?? throw Invalid("day_item_version_required", "Gün öğesinin sürümü gerekli."), ct);
        if (item.TaskId != command.TaskId) throw Invalid("day_item_task_mismatch", "Gün öğesi ile blok görevi aynı olmalı.");
        if (item.LocalDate != command.LocalDate) throw Invalid("day_item_day_mismatch", "Gün öğesi seçilen plan gününde olmalı.");
        item.State = DayItemState.Scheduled; item.Version++; item.UpdatedAt = clock.GetUtcNow();
        return item;
    }
    private async Task<DayItem> Current(Guid userId, Guid id, long version, CancellationToken ct)
    {
        var item = await db.DayItems.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id, ct) ?? throw Missing("day_item_not_found", "Gün öğesi bulunamadı.");
        if (item.Version != version) throw Conflict("version_conflict", "Gün öğesi değişmiş; güncel kaydı alın.");
        if (item.State != DayItemState.Planned) throw Conflict("day_item_not_planned", "Gün öğesi artık planda değil.");
        if (!await db.Tasks.AnyAsync(x => x.UserId == userId && x.Id == item.TaskId && x.DeletedAt == null, ct)) throw Missing("day_item_not_found", "Gün öğesi bulunamadı.");
        return item;
    }
    private static void Plannable(TaskItem task)
    {
        if (!task.HasDirectWork || task.DirectWorkCompleted || task.ArchivedAt is not null || task.State is not (TaskState.Pending or TaskState.InProgress or TaskState.Paused))
            throw Conflict("task_not_plannable", "Yalnız açık doğrudan işi planlayabilirsiniz.");
    }
    // EF filtre ve sıralamayı çevirebilsin diye burada kurucu yerine alanları doldur
    private sealed class Row { public required DayItem Item { get; init; } public required TaskItem Task { get; init; } public TaskItem? Parent { get; init; } }
    private IQueryable<Row> Visible(Guid userId) =>
        from item in db.DayItems.AsNoTracking()
        join task in db.Tasks.AsNoTracking() on new { item.UserId, Id = item.TaskId } equals new { task.UserId, task.Id }
        join parent in db.Tasks.AsNoTracking() on new { task.UserId, Id = task.ParentTaskId } equals new { parent.UserId, Id = (Guid?)parent.Id } into parents
        from parent in parents.DefaultIfEmpty()
        where item.UserId == userId && item.State == DayItemState.Planned && task.DeletedAt == null && task.ArchivedAt == null
        select new Row { Item = item, Task = task, Parent = parent };
    private async Task<DayItemView> Read(Guid userId, Guid id, CancellationToken ct) => View(await Visible(userId).SingleAsync(x => x.Item.Id == id, ct));
    private async Task<(TaskItem Task, TaskItem? Parent)> TaskOf(Guid userId, Guid taskId, CancellationToken ct)
    {
        var task = await db.Tasks.AsNoTracking().SingleAsync(x => x.UserId == userId && x.Id == taskId, ct);
        var parent = task.ParentTaskId is { } p ? await db.Tasks.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Id == p, ct) : null;
        return (task, parent);
    }
    private static DayItemView View(Row row) => View(row.Item, (row.Task, row.Parent));
    private static DayItemView View(DayItem item, (TaskItem Task, TaskItem? Parent) owner) => new(item.Id, item.LocalDate, item.TaskId, item.SortOrder, item.CompletedAt, item.Version,
        owner.Task.Title, owner.Task.ParentTaskId, owner.Parent?.Title, owner.Task.DirectEstimatedSeconds, owner.Task.State,
        StartsAt: item.StartsAt, EndsAt: item.EndsAt, IsUrgent: item.IsUrgent, Priority: owner.Task.Priority, EnergyDemand: owner.Task.EnergyDemand, TimingIssue: item.TimingIssue);
}

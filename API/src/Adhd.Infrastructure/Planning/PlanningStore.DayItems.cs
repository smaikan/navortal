using Adhd.Application.Planning;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Planning;

// Saatsiz öğeler kapasite, çakışma, motor, revizyon ve hatırlatmaya
// katılmaz. Plan sürümü artmaz. Öğeyi bitirmek görevi bitirmez.
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
    public async Task<DayItemView> AddDayItemAsync(Guid userId, DateOnly date, Guid taskId, CancellationToken ct)
    {
        ValidateDate(date);
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(userId, ct);
        var task = await db.Tasks.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == taskId && x.DeletedAt == null, ct) ?? throw Missing("task_not_found", "Görev bulunamadı.");
        Plannable(task);
        if (await db.DayItems.AnyAsync(x => x.UserId == userId && x.LocalDate == date && x.TaskId == taskId && x.State == DayItemState.Planned, ct))
            throw Conflict("day_item_exists", "Bu görev bu günün planında zaten var.");
        var now = clock.GetUtcNow();
        var order = await db.DayItems.Where(x => x.UserId == userId && x.LocalDate == date).MaxAsync(x => (int?)x.SortOrder, ct) ?? -1;
        var item = new DayItem { Id = Guid.CreateVersion7(), UserId = userId, LocalDate = date, TaskId = taskId, SortOrder = order + 1, CreatedAt = now, UpdatedAt = now };
        db.DayItems.Add(item); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return await Read(userId, item.Id, ct);
    }
    public async Task<DayItemView> ChangeDayItemAsync(Guid userId, Guid id, long version, DayItemAction action, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(userId, ct);
        var item = await Current(userId, id, version, ct); var now = clock.GetUtcNow();
        switch (action)
        {
            case DayItemAction.Complete: item.CompletedAt ??= now; break;
            case DayItemAction.Reopen: item.CompletedAt = null; break;
            case DayItemAction.Remove: item.State = DayItemState.Removed; break;
        }
        item.Version++; item.UpdatedAt = now;
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return action == DayItemAction.Remove ? View(item, await TaskOf(userId, item.TaskId, ct)) : await Read(userId, item.Id, ct);
    }
    public async Task<DayItemView> MoveDayItemAsync(Guid userId, Guid id, long version, DateOnly targetDate, CancellationToken ct)
    {
        ValidateDate(targetDate);
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(userId, ct);
        var item = await Current(userId, id, version, ct);
        if (item.LocalDate == targetDate) throw Invalid("day_item_same_day", "Hedef gün öğenin bulunduğu günden farklı olmalı.");
        if (await db.DayItems.AnyAsync(x => x.UserId == userId && x.LocalDate == targetDate && x.TaskId == item.TaskId && x.State == DayItemState.Planned, ct))
            throw Conflict("day_item_exists", "Bu görev hedef günün planında zaten var.");
        var order = await db.DayItems.Where(x => x.UserId == userId && x.LocalDate == targetDate).MaxAsync(x => (int?)x.SortOrder, ct) ?? -1;
        item.LocalDate = targetDate; item.SortOrder = order + 1; item.CompletedAt = null; item.Version++; item.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return await Read(userId, item.Id, ct);
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
    private async Task TimeDayItem(Guid userId, Guid id, CreateSchedule command, CancellationToken ct)
    {
        if (command.Kind != ScheduleKind.Work) throw Invalid("schedule_kind_invalid", "Gün öğesine yalnız çalışma bloğu verilebilir.");
        var item = await Current(userId, id, command.DayItemVersion ?? throw Invalid("day_item_version_required", "Gün öğesinin sürümü gerekli."), ct);
        if (item.TaskId != command.TaskId) throw Invalid("day_item_task_mismatch", "Gün öğesi ile blok görevi aynı olmalı.");
        if (item.LocalDate != command.LocalDate) throw Invalid("day_item_day_mismatch", "Gün öğesi seçilen plan gününde olmalı.");
        item.State = DayItemState.Scheduled; item.Version++; item.UpdatedAt = clock.GetUtcNow();
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
        owner.Task.Title, owner.Task.ParentTaskId, owner.Parent?.Title, owner.Task.DirectEstimatedSeconds, owner.Task.State);
}

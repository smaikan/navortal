using Adhd.Application.Common;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Adhd.Domain.Users;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Tasks;

public sealed class TaskStore(PlannerDbContext db, TimeProvider clock) : ITaskStore
{
    public async Task<TaskView> CreateAsync(Guid userId, TaskFields fields, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var state = await Lock(userId, ct); var now = clock.GetUtcNow();
        var task = new TaskItem { Id = Guid.CreateVersion7(), UserId = userId, CreatedAt = now, UpdatedAt = now };
        task.SortOrder = (await db.Tasks.Where(x => x.UserId == userId && x.ParentTaskId == null && x.ArchivedAt == null).Select(x => (decimal?)x.SortOrder).MaxAsync(ct) ?? 0) + 1024;
        Apply(task, fields); db.Tasks.Add(task); AddEvent(task, "Created", null);
        state.PlanningVersion++; state.UpdatedAt = now;
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return View(task);
    }
    public async Task<TaskView> GetAsync(Guid userId, Guid id, CancellationToken ct) => View(await Find(userId, id, ct));
    public async Task<TaskPage> ListAsync(Guid userId, TaskQuery query, CancellationToken ct)
    {
        var tasks = db.Tasks.AsNoTracking().Where(x => x.UserId == userId && x.DeletedAt == null && (query.IncludeArchived || x.ArchivedAt == null));
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // LIKE kullanırken yüzde, alt çizgi ve ters eğik çizgiyi joker olarak değil düz metin olarak ara.
            var term = query.Search.Trim();
            tasks = tasks.Where(x => EF.Functions.Collate(x.Title, "adhd_search").ToLower().Contains(EF.Functions.Collate(term, "adhd_search").ToLower()));
        }
        if (query.Priority.HasValue) tasks = tasks.Where(x => x.Priority == query.Priority.Value);
        if (query.State.HasValue) tasks = tasks.Where(x => x.State == query.State.Value);
        if (!query.IncludeCompleted) tasks = tasks.Where(x => x.State != TaskState.Completed);
        if (query.ProjectId.HasValue) tasks = tasks.Where(x => x.ProjectId == query.ProjectId);
        if (query.PoolId.HasValue) tasks = tasks.Where(x => x.PoolId == query.PoolId);
        if (query.CategoryId.HasValue) tasks = tasks.Where(x => x.CategoryId == query.CategoryId);
        if (query.AssignedOn is { } day) tasks = tasks.Where(x => x.PlannedFrom <= day && x.PlannedTo >= day);
        if (query.TagId.HasValue) tasks = tasks.Where(x => db.TaskTagLinks.Any(tag => tag.UserId == userId && tag.TaskId == x.Id && tag.TagId == query.TagId));
        if (query.IsPlanned is { } isPlanned)
        {
            if (!query.From.HasValue || !query.To.HasValue || query.From >= query.To || query.To - query.From > TimeSpan.FromDays(366))
                throw new UseCaseException(ErrorKind.Validation, "planning_range_required", "Plan filtresi pozitif, en çok366 günlük from/to gerektirir.");
            var now = clock.GetUtcNow(); var from = query.From.Value > now ? query.From.Value.ToUniversalTime() : now; var to = query.To.Value.ToUniversalTime();
            tasks = tasks.Where(x => db.TaskSchedules.Any(s => s.UserId == userId && s.TaskId == x.Id && s.State == Adhd.Domain.Planning.ScheduleState.Planned
                && s.Kind == Adhd.Domain.Planning.ScheduleKind.Work && s.StartsAt < to && s.EndsAt > from && to > from) == isPlanned);
        }
        var total = await tasks.CountAsync(ct);
        var ordered = query.OrderBy switch
        {
            "Title" => tasks.OrderBy(x => x.Title).ThenBy(x => x.Id),
            "Priority" => tasks.OrderByDescending(x => x.Priority == TaskPriority.Urgent ? 3 : x.Priority == TaskPriority.High ? 2 : x.Priority == TaskPriority.Normal ? 1 : 0).ThenBy(x => x.Id),
            "Deadline" => tasks.OrderBy(x => x.DeadlineAt == null).ThenBy(x => x.DeadlineAt).ThenBy(x => x.Id),
            "CompletedDesc" => tasks.OrderBy(x => x.CompletedAt == null).ThenByDescending(x => x.CompletedAt).ThenBy(x => x.Id),
            _ => tasks.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
        };
        var rows = await ordered.Skip(query.Offset).Take(query.Limit).ToArrayAsync(ct);
        return new(rows.Select(View).ToArray(), query.Offset, query.Limit, total);
    }
    public async Task<TaskView> UpdateAsync(Guid userId, Guid id, long version, TaskFields? fields, bool archive, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var state = await Lock(userId, ct); var task = await Find(userId, id, ct);
        if (task.Version != version) throw new UseCaseException(ErrorKind.Conflict, "version_conflict", "Görev değişmiş; güncel kaydı alın.");
        if (task.ArchivedAt is not null)
        {
            if (!archive) throw new UseCaseException(ErrorKind.Conflict, "task_archived", "Arşivlenmiş görev düzenlenemez.");
            return View(task);
        }
        if (archive && await db.Tasks.AnyAsync(x => x.UserId == userId && x.ParentTaskId == id && x.ArchivedAt == null, ct))
            throw new UseCaseException(ErrorKind.Conflict, "task_has_children", "Önce açık alt görevleri taşıyın veya arşivleyin.");
        if (archive && await db.WorkSessions.AnyAsync(x => x.UserId == userId && x.TaskId == id && (x.State == Adhd.Domain.Work.WorkState.Running || x.State == Adhd.Domain.Work.WorkState.Paused), ct))
            throw new UseCaseException(ErrorKind.Conflict, "task_has_work", "Arşivlemeden önce çalışma oturumunu bitirin.");
        var before = View(task); var now = clock.GetUtcNow();
        if (archive) task.ArchivedAt = now; else Apply(task, fields!);
        task.UpdatedAt = now; task.Version++; AddEvent(task, archive ? "Archived" : "Updated", before);
        state.PlanningVersion++; state.UpdatedAt = now;
        if (archive && task.ParentTaskId is { } parent)
        {
            var nodes = await WorkloadAccess.ValidateUserTree(db, userId, ct);
            LifecycleAccess.Reconcile(db, nodes, [parent], now);
        }
        if (archive) await Adhd.Infrastructure.Planning.PlanningLifecycle.CloseFuture(db, userId, [task], now, ct);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return View(task);
    }
    // Görevi ve açık alt ağacı
    // tek işlemde listeden çıkar. Çalışmayı
    // kapat, gelecek blokları kaldır ve
    // üstü kontrol et. Geçmiş aynı
    // kalır, grup geri alınabilir.
    public async Task<TaskView> DeleteAsync(Guid userId, Guid id, long version, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var state = await Lock(userId, ct); var task = await Find(userId, id, ct);
        if (task.Version != version) throw new UseCaseException(ErrorKind.Conflict, "version_conflict", "Görev değişmiş; güncel kaydı alın.");
        if (task.DeletedAt is not null) return View(task);
        if (task.ArchivedAt is not null) throw new UseCaseException(ErrorKind.Conflict, "task_archived", "Arşivlenmiş görev silinemez.");
        var nodes = await db.Tasks.Where(x => x.UserId == userId && x.ArchivedAt == null).ToArrayAsync(ct);
        var children = nodes.Where(x => x.ParentTaskId.HasValue).ToLookup(x => x.ParentTaskId!.Value);
        var subtree = new List<TaskItem>(); var queue = new Queue<TaskItem>([nodes.Single(x => x.Id == id)]);
        while (queue.TryDequeue(out var next)) { subtree.Add(next); foreach (var child in children[next.Id]) queue.Enqueue(child); }
        var now = clock.GetUtcNow();
        foreach (var item in subtree)
        {
            var before = View(item);
            item.ArchivedAt = now; item.DeletedAt = now; item.UpdatedAt = now; item.Version++;
            AddEvent(item, "Deleted", before);
        }
        _ = await Adhd.Infrastructure.Work.WorkLifecycle.CloseForTasks(db, userId, subtree, now, ct);
        await Adhd.Infrastructure.Planning.PlanningLifecycle.CloseFuture(db, userId, subtree, now, ct);
        if (task.ParentTaskId is { } parent) LifecycleAccess.Reconcile(db, nodes, [parent], now);
        state.PlanningVersion++; state.UpdatedAt = now;
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return View(task);
    }
    // Tek silmede çıkan grubu birlikte geri getir. Silinen veya arşivlenen üst görev önce açılmalı.
    public async Task<TaskView> RestoreAsync(Guid userId, Guid id, long version, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var state = await Lock(userId, ct); var task = await Find(userId, id, ct);
        if (task.Version != version) throw new UseCaseException(ErrorKind.Conflict, "version_conflict", "Görev değişmiş; güncel kaydı alın.");
        if (task.DeletedAt is not { } deletedAt) throw new UseCaseException(ErrorKind.Conflict, "task_not_deleted", "Görev silinmemiş.");
        if (task.ParentTaskId is { } parentId && await db.Tasks.AnyAsync(x => x.UserId == userId && x.Id == parentId && x.ArchivedAt != null, ct))
            throw new UseCaseException(ErrorKind.Conflict, "parent_deleted", "Önce üst görevi geri alın.");
        var batch = await db.Tasks.Where(x => x.UserId == userId && x.DeletedAt == deletedAt).ToArrayAsync(ct);
        var children = batch.Where(x => x.ParentTaskId.HasValue).ToLookup(x => x.ParentTaskId!.Value);
        var restore = new List<TaskItem>(); var queue = new Queue<TaskItem>([task]);
        while (queue.TryDequeue(out var next)) { restore.Add(next); foreach (var child in children[next.Id]) queue.Enqueue(child); }
        var now = clock.GetUtcNow();
        foreach (var item in restore)
        {
            var before = View(item);
            item.ArchivedAt = null; item.DeletedAt = null; item.UpdatedAt = now; item.Version++;
            AddEvent(item, "Restored", before);
        }
        if (task.ParentTaskId is { } parent)
        {
            await db.SaveChangesAsync(ct);
            var nodes = await db.Tasks.Where(x => x.UserId == userId && x.ArchivedAt == null).ToArrayAsync(ct);
            LifecycleAccess.Reconcile(db, nodes, [parent], now);
        }
        state.PlanningVersion++; state.UpdatedAt = now;
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return View(task);
    }
    public async Task<TaskView> SetPlannedRangeAsync(Guid userId, Guid id, long version, DateOnly? from, DateOnly? to, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var state = await Lock(userId, ct); var task = await Find(userId, id, ct);
        if (task.Version != version) throw new UseCaseException(ErrorKind.Conflict, "version_conflict", "Görev değişmiş; güncel kaydı alın.");
        if (task.ArchivedAt is not null) throw new UseCaseException(ErrorKind.Conflict, "task_archived", "Arşivlenmiş görev düzenlenemez.");
        if (task.PlannedFrom == from && task.PlannedTo == to) return View(task);
        var before = View(task); var now = clock.GetUtcNow();
        task.PlannedFrom = from; task.PlannedTo = to; task.UpdatedAt = now; task.Version++; AddEvent(task, "PlannedRangeChanged", before);
        state.PlanningVersion++; state.UpdatedAt = now;
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return View(task);
    }
    public async Task<TreeRowSummary> SummaryAsync(Guid userId, Guid id, CancellationToken ct)
    {
        var task = await Find(userId, id, ct);
        if (task.DeletedAt is not null) throw new UseCaseException(ErrorKind.NotFound, "task_not_found", "Görev bulunamadı.");
        return (await TaskSummaries.Build(db, userId, [id], ct))[0];
    }
    private Task<UserPlanningState> Lock(Guid userId, CancellationToken ct) => db.PlanningStates
        .FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\" = {userId} FOR UPDATE").SingleAsync(ct);
    private async Task<TaskItem> Find(Guid userId, Guid id, CancellationToken ct) =>
        await db.Tasks.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id, ct)
            ?? throw new UseCaseException(ErrorKind.NotFound, "task_not_found", "Görev bulunamadı.");
    private void AddEvent(TaskItem task, string type, TaskView? before) => TaskHistory.Append(db, task, type, before);
    private static void Apply(TaskItem task, TaskFields fields)
    { task.Title = fields.Title; task.Description = fields.Description; task.Priority = fields.Priority; task.DeadlineAt = fields.DeadlineAt; task.CanSplit = fields.CanSplit; }
    public static TaskView View(TaskItem t) => new(t.Id, t.Title, t.Description, t.State, t.Priority, t.DeadlineAt, t.CanSplit, t.DirectEstimatedSeconds, t.CreatedAt, t.UpdatedAt, t.ArchivedAt, t.Version,
        t.ParentTaskId, t.SortOrder, t.HasDirectWork, t.TargetBudgetSeconds, t.DirectWorkCompleted, t.RequiredForParent, t.CompletionOrigin, t.CompletedAt,
        t.ProjectId, t.PoolId, t.CategoryId, t.EnergyDemand, t.AutoCompleteFromChildren, t.PlannedFrom, t.PlannedTo);
}

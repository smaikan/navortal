using Adhd.Application.Common;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Adhd.Domain.Users;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Tasks;

public sealed class TaskTreeStore(PlannerDbContext db, TimeProvider clock) : ITaskTreeStore
{
    public async Task<TaskView> CreateChildAsync(Guid userId, Guid parentId, long parentVersion, TaskFields fields, ParentWorkDisposition? disposition, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var parent = await Find(userId, parentId, ct); Check(parent, parentVersion); var parentBefore = TaskStore.View(parent);
        await ConfigureParent(parent, disposition, ct);
        var now = clock.GetUtcNow();
        var task = new TaskItem
        {
            Id = Guid.CreateVersion7(), UserId = userId, ParentTaskId = parentId, Title = fields.Title, Description = fields.Description,
            ProjectId = parent.ProjectId, PoolId = parent.PoolId, CategoryId = parent.CategoryId,
            Priority = fields.Priority, DeadlineAt = fields.DeadlineAt, CanSplit = fields.CanSplit, CreatedAt = now, UpdatedAt = now,
            SortOrder = (await db.Tasks.Where(x => x.UserId == userId && x.ParentTaskId == parentId && x.ArchivedAt == null).Select(x => (decimal?)x.SortOrder).MaxAsync(ct) ?? 0) + 1024
        };
        var inheritedTags = await db.TaskTagLinks.Where(x => x.UserId == userId && x.TaskId == parentId).Select(x => x.TagId).ToArrayAsync(ct);
        db.Tasks.Add(task);
        db.TaskTagLinks.AddRange(inheritedTags.Select(tag => new TaskTagLink { UserId = userId, TaskId = task.Id, TagId = tag }));
        TaskHistory.Append(db, task, "Created", null, new { tagIds = inheritedTags }); Touch(parent, "ChildAdded", parentBefore);
        state.PlanningVersion++; state.UpdatedAt = now;
        var nodes = await WorkloadAccess.ValidateUserTree(db, userId, ct);
        await TaskGraphAccess.Validate(db, userId, nodes, ct);
        LifecycleAccess.Reconcile(db, nodes, [parentId], now);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return TaskStore.View(task);
    }
    public async Task<TaskView> MoveAsync(Guid userId, Guid taskId, MoveTask move, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var task = await Find(userId, taskId, ct); Check(task, move.Version);
        if (move.ParentTaskId == taskId || move.BeforeSiblingId == taskId) throw Invalid("tree_cycle", "Görev kendi altına veya önüne taşınamaz.");
        var before = TaskStore.View(task); var oldParentId = task.ParentTaskId;
        TaskItem? parent = null; TaskView? parentBefore = null;
        if (move.ParentTaskId is { } parentId)
        {
            parent = await Find(userId, parentId, ct); Check(parent, move.ParentVersion!.Value); parentBefore = TaskStore.View(parent);
            var isCycle = await db.Tasks.FromSqlInterpolated($"""
                WITH RECURSIVE ancestors AS (
                    SELECT * FROM tasks WHERE "UserId" = {userId} AND "Id" = {parentId}
                    UNION
                    SELECT t.* FROM tasks t JOIN ancestors a ON t."Id" = a."ParentTaskId" AND t."UserId" = a."UserId"
                ) SELECT * FROM ancestors
                """).AsNoTracking().AnyAsync(x => x.Id == taskId, ct);
            if (isCycle) throw Invalid("tree_cycle", "Alt görev kendi atasını içeremez.");
            if (oldParentId != parentId) await ConfigureParent(parent, move.ParentWorkDisposition, ct);
        }
        var siblings = await db.Tasks.Where(x => x.UserId == userId && x.ParentTaskId == move.ParentTaskId && x.Id != taskId && x.ArchivedAt == null)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Id).ToListAsync(ct);
        var index = move.BeforeSiblingId is { } siblingId ? siblings.FindIndex(x => x.Id == siblingId) : siblings.Count;
        if (index < 0) throw Invalid("sibling_invalid", "Sıra hedefi aynı üst görevin açık çocuğu olmalı.");
        task.ParentTaskId = move.ParentTaskId; siblings.Insert(index, task);
        for (var i = 0; i < siblings.Count; i++)
        {
            var sibling = siblings[i]; var order = (i + 1) * 1024m;
            if (sibling.Id == taskId) { sibling.SortOrder = order; continue; }
            if (sibling.SortOrder != order) { var previous = TaskStore.View(sibling); sibling.SortOrder = order; Touch(sibling, "Reordered", previous); }
        }
        Touch(task, "Moved", before);
        if (parent is not null) Touch(parent, oldParentId == move.ParentTaskId ? "ChildrenReordered" : "ChildAdded", parentBefore!);
        if (oldParentId is { } oldId && oldParentId != move.ParentTaskId)
        {
            var oldParent = await Find(userId, oldId, ct); Touch(oldParent, "ChildRemoved", TaskStore.View(oldParent));
        }
        state.PlanningVersion++; state.UpdatedAt = clock.GetUtcNow();
        var nodes = await WorkloadAccess.ValidateUserTree(db, userId, ct);
        await TaskGraphAccess.Validate(db, userId, nodes, ct);
        LifecycleAccess.Reconcile(db, nodes, new[] { oldParentId, move.ParentTaskId }.OfType<Guid>(), clock.GetUtcNow());
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return TaskStore.View(task);
    }
    public async Task<TreePage> ChildrenAsync(Guid userId, Guid? parentId, int offset, int limit, bool includeArchived, CancellationToken ct, bool? completed = null, bool excludeRecurring = false)
    {
        if (parentId is { } id) _ = await Find(userId, id, ct);
        var query = db.Tasks.AsNoTracking().Where(x => x.UserId == userId && x.ParentTaskId == parentId && x.DeletedAt == null && (includeArchived || x.ArchivedAt == null));
        if (excludeRecurring)
            query = query.Where(x => !db.RecurrenceOccurrences.Any(o => o.UserId == userId && o.TaskId == x.Id));
        if (completed is { } done) query = query.Where(x => (x.State == TaskState.Completed) == done);
        var ordered = completed == true ? query.OrderByDescending(x => x.CompletedAt).ThenBy(x => x.Id) : query.OrderBy(x => x.SortOrder).ThenBy(x => x.Id);
        var rows = await ordered.Skip(offset).Take(limit + 1).ToArrayAsync(ct);
        var page = Page(rows, offset, limit);
        return page with { Summaries = await TaskSummaries.Build(db, userId, page.Items.Select(x => x.Id).ToArray(), ct) };
    }
    public async Task<TreePage> SubtreeAsync(Guid userId, Guid taskId, int offset, int limit, bool includeArchived, CancellationToken ct)
    {
        _ = await Find(userId, taskId, ct);
        // Derinlik ne olursa olsun tek recursive sorgu kullan. Sayfalarken ParentTaskId kalsın
        var rows = await db.Tasks.FromSqlInterpolated($"""
            WITH RECURSIVE tree AS (
                SELECT t.*, 0 AS depth FROM tasks t WHERE t."UserId" = {userId} AND t."Id" = {taskId} AND t."DeletedAt" IS NULL AND ({includeArchived} OR t."ArchivedAt" IS NULL)
                UNION ALL
                SELECT t.*, p.depth + 1 FROM tasks t JOIN tree p ON t."ParentTaskId" = p."Id" AND t."UserId" = p."UserId"
                WHERE t."DeletedAt" IS NULL AND ({includeArchived} OR t."ArchivedAt" IS NULL)
            ) SELECT * FROM tree ORDER BY depth, "ParentTaskId", "SortOrder", "Id" LIMIT {limit + 1} OFFSET {offset}
            """).AsNoTracking().ToArrayAsync(ct);
        return Page(rows, offset, limit);
    }
    private static TreePage Page(TaskItem[] rows, int offset, int limit) => new(rows.Take(limit).Select(TaskStore.View).ToArray(), offset, limit, rows.Length > limit);
    private Task<UserPlanningState> Lock(Guid userId, CancellationToken ct) => db.PlanningStates
        .FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\" = {userId} FOR UPDATE").SingleAsync(ct);
    private async Task<TaskItem> Find(Guid userId, Guid id, CancellationToken ct) => await db.Tasks.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id, ct)
        ?? throw new UseCaseException(ErrorKind.NotFound, "task_not_found", "Görev bulunamadı.");
    private static void Check(TaskItem task, long version)
    {
        if (task.Version != version) throw new UseCaseException(ErrorKind.Conflict, "version_conflict", "Görev değişmiş; güncel kaydı alın.");
        if (task.ArchivedAt is not null) throw new UseCaseException(ErrorKind.Conflict, "task_archived", "Arşivlenmiş görev taşınamaz veya alt görev alamaz.");
    }
    private async Task ConfigureParent(TaskItem parent, ParentWorkDisposition? disposition, CancellationToken ct)
    {
        var hasChildren = await db.Tasks.AnyAsync(x => x.UserId == parent.UserId && x.ParentTaskId == parent.Id, ct);
        var hasWork = await db.WorkSessions.AnyAsync(x => x.UserId == parent.UserId && x.TaskId == parent.Id, ct);
        var hasSchedule = await db.TaskSchedules.AnyAsync(x => x.UserId == parent.UserId && x.TaskId == parent.Id && x.State == Adhd.Domain.Planning.ScheduleState.Planned && x.EndsAt > clock.GetUtcNow(), ct);
        if (hasSchedule && (disposition == ParentWorkDisposition.ConvertToContainer || (!hasChildren && disposition is null)))
            throw new UseCaseException(ErrorKind.Conflict, "parent_has_schedule", "Gelecek blokları olan üst görevin doğrudan işini koruyun.");
        if (hasWork && (disposition == ParentWorkDisposition.ConvertToContainer || (!hasChildren && disposition is null)))
            throw new UseCaseException(ErrorKind.Conflict, "parent_work_history", "Gerçek çalışma bulunan üst görevin kendi işini koruyarak alt görev ekleyin.");
        if (parent.DirectWorkCompleted && disposition != ParentWorkDisposition.PreserveDirect)
            throw new UseCaseException(ErrorKind.Conflict, "parent_work_history", "Tamamlanmış doğrudan işi koruyarak alt görev ekleyin.");
        if (!hasChildren && parent.HasDirectWork && parent.DirectEstimatedSeconds.HasValue && disposition is null)
            throw new UseCaseException(ErrorKind.Conflict, "parent_work_decision_required", "Üst görevin kendi işini korumayı veya konteynere çevirmeyi seçin.");
        if (disposition == ParentWorkDisposition.PreserveDirect) { parent.HasDirectWork = true; return; }
        if (disposition == ParentWorkDisposition.ConvertToContainer || (!hasChildren && parent.DirectEstimatedSeconds is null && disposition is null))
        {
            if (parent.DirectEstimatedSeconds.HasValue && parent.TargetBudgetSeconds.HasValue && parent.TargetBudgetSeconds != parent.DirectEstimatedSeconds)
                throw new UseCaseException(ErrorKind.Conflict, "parent_budget_conflict", "Mevcut hedef bütçeyi açıkça çözün.");
            parent.TargetBudgetSeconds ??= parent.DirectEstimatedSeconds;
            parent.DirectEstimatedSeconds = null; parent.HasDirectWork = false;
        }
    }
    private void Touch(TaskItem task, string kind, TaskView before)
    { task.Version++; task.UpdatedAt = clock.GetUtcNow(); TaskHistory.Append(db, task, kind, before); }
    private static UseCaseException Invalid(string code, string message) => new(ErrorKind.Validation, code, message);
}

using Adhd.Application.Common;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Adhd.Domain.Users;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Tasks;

public sealed class TaskRelationsStore(PlannerDbContext db, TimeProvider clock) : ITaskRelationsStore
{
    public async Task<TaskRelationView> AddAsync(Guid userId, Guid targetId, Guid sourceId, long version, TaskRelationKind kind, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var target = await Find(userId, targetId, ct); _ = await Find(userId, sourceId, ct); Check(target, version);
        var id = Guid.CreateVersion7(); TaskRelationView relation;
        if (kind == TaskRelationKind.Dependency)
        {
            if (await db.TaskDependencies.AnyAsync(x => x.UserId == userId && x.PredecessorTaskId == sourceId && x.SuccessorTaskId == targetId, ct)) throw Duplicate();
            db.TaskDependencies.Add(new TaskDependency { Id = id, UserId = userId, PredecessorTaskId = sourceId, SuccessorTaskId = targetId });
            var nodes = await db.Tasks.Where(x => x.UserId == userId).ToArrayAsync(ct); await TaskGraphAccess.Validate(db, userId, nodes, ct);
            relation = new(id, sourceId, targetId, "FinishToStart");
        }
        else
        {
            if (await db.TaskOrderingPreferences.AnyAsync(x => x.UserId == userId && x.BeforeTaskId == sourceId && x.AfterTaskId == targetId, ct)) throw Duplicate();
            db.TaskOrderingPreferences.Add(new TaskOrderingPreference { Id = id, UserId = userId, BeforeTaskId = sourceId, AfterTaskId = targetId });
            relation = new(id, sourceId, targetId, "PreferredBefore");
        }
        Touch(target, state, kind == TaskRelationKind.Dependency ? "DependencyAdded" : "OrderingAdded", relation);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return relation;
    }
    public async Task RemoveAsync(Guid userId, Guid targetId, Guid sourceId, long version, TaskRelationKind kind, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var target = await Find(userId, targetId, ct); Check(target, version); TaskRelationView relation;
        if (kind == TaskRelationKind.Dependency)
        {
            var edge = await db.TaskDependencies.SingleOrDefaultAsync(x => x.UserId == userId && x.SuccessorTaskId == targetId && x.PredecessorTaskId == sourceId, ct) ?? throw Missing();
            relation = new(edge.Id, sourceId, targetId, "FinishToStart"); db.TaskDependencies.Remove(edge);
        }
        else
        {
            var edge = await db.TaskOrderingPreferences.SingleOrDefaultAsync(x => x.UserId == userId && x.AfterTaskId == targetId && x.BeforeTaskId == sourceId, ct) ?? throw Missing();
            relation = new(edge.Id, sourceId, targetId, "PreferredBefore"); db.TaskOrderingPreferences.Remove(edge);
        }
        Touch(target, state, kind == TaskRelationKind.Dependency ? "DependencyRemoved" : "OrderingRemoved", relation);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
    public async Task<TaskRelationPage> ListAsync(Guid userId, Guid targetId, TaskRelationKind kind, int offset, int limit, CancellationToken ct)
    {
        _ = await Find(userId, targetId, ct);
        if (kind == TaskRelationKind.Dependency)
        {
            var query = db.TaskDependencies.AsNoTracking().Where(x => x.UserId == userId && x.SuccessorTaskId == targetId);
            var total = await query.CountAsync(ct);
            var items = await query.OrderBy(x => x.Id).Skip(offset).Take(limit)
                .Select(x => new TaskRelationView(x.Id, x.PredecessorTaskId, x.SuccessorTaskId, "FinishToStart")).ToArrayAsync(ct);
            return new(items, offset, limit, total);
        }
        else
        {
            var query = db.TaskOrderingPreferences.AsNoTracking().Where(x => x.UserId == userId && x.AfterTaskId == targetId);
            var total = await query.CountAsync(ct);
            var items = await query.OrderBy(x => x.Id).Skip(offset).Take(limit)
                .Select(x => new TaskRelationView(x.Id, x.BeforeTaskId, x.AfterTaskId, "PreferredBefore")).ToArrayAsync(ct);
            return new(items, offset, limit, total);
        }
    }
    public async Task<TaskStartDecision> CanStartAsync(Guid userId, Guid taskId, CancellationToken ct)
    {
        var selected = await Find(userId, taskId, ct);
        var nodes = await db.Tasks.AsNoTracking().Where(x => x.UserId == userId).ToArrayAsync(ct);
        var edges = await db.TaskDependencies.AsNoTracking().Where(x => x.UserId == userId).ToArrayAsync(ct);
        return TaskGraphRules.CanStart(selected, nodes, edges);
    }
    private void Touch(TaskItem target, UserPlanningState state, string kind, TaskRelationView relation)
    {
        var before = TaskStore.View(target); target.Version++; target.UpdatedAt = clock.GetUtcNow();
        TaskHistory.Append(db, target, kind, before, relation); state.PlanningVersion++; state.UpdatedAt = target.UpdatedAt;
    }
    private Task<UserPlanningState> Lock(Guid userId, CancellationToken ct) => db.PlanningStates
        .FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\" = {userId} FOR UPDATE").SingleAsync(ct);
    private async Task<TaskItem> Find(Guid userId, Guid id, CancellationToken ct) => await db.Tasks.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id, ct)
        ?? throw new UseCaseException(ErrorKind.NotFound, "task_not_found", "Görev bulunamadı.");
    private static void Check(TaskItem task, long version)
    {
        if (task.Version != version) throw new UseCaseException(ErrorKind.Conflict, "version_conflict", "Görev değişmiş; güncel kaydı alın.");
        if (task.ArchivedAt is not null) throw new UseCaseException(ErrorKind.Conflict, "task_archived", "Arşivlenmiş görevin ilişkileri değiştirilemez.");
    }
    private static UseCaseException Duplicate() => new(ErrorKind.Conflict, "relation_exists", "İlişki zaten var.");
    private static UseCaseException Missing() => new(ErrorKind.NotFound, "relation_not_found", "İlişki bulunamadı.");
}

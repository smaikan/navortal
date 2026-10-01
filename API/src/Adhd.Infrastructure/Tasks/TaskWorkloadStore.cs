using Adhd.Application.Common;
using Adhd.Application.Tasks;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Tasks;

public sealed class TaskWorkloadStore(PlannerDbContext db, TimeProvider clock) : ITaskWorkloadStore
{
    public async Task<TaskView> UpdateAsync(Guid userId, Guid taskId, WorkDefinition definition, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var state = await db.PlanningStates.FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\" = {userId} FOR UPDATE").SingleAsync(ct);
        var task = await db.Tasks.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == taskId, ct)
            ?? throw new UseCaseException(ErrorKind.NotFound, "task_not_found", "Görev bulunamadı.");
        if (task.Version != definition.Version) throw new UseCaseException(ErrorKind.Conflict, "version_conflict", "Görev değişmiş; güncel kaydı alın.");
        if (task.ArchivedAt is not null) throw new UseCaseException(ErrorKind.Conflict, "task_archived", "Arşivlenmiş görevin tahmini düzenlenemez.");
        if (!definition.HasDirectWork && await db.WorkSessions.AnyAsync(x => x.UserId == userId && x.TaskId == taskId, ct))
            throw new UseCaseException(ErrorKind.Conflict, "work_history_exists", "Gerçek çalışma geçmişi bulunan doğrudan iş korunmalı.");
        if (!definition.HasDirectWork && await db.TaskSchedules.AnyAsync(x => x.UserId == userId && x.TaskId == taskId && x.State == Adhd.Domain.Planning.ScheduleState.Planned && x.EndsAt > clock.GetUtcNow(), ct))
            throw new UseCaseException(ErrorKind.Conflict, "task_has_schedule", "Önce gelecekteki doğrudan iş bloklarını kaldırın.");
        if ((task.DirectWorkCompleted && !definition.HasDirectWork) || (task.State == Adhd.Domain.Tasks.TaskState.Completed && task.HasDirectWork != definition.HasDirectWork))
            throw new UseCaseException(ErrorKind.Conflict, "work_completed_reopen", "Doğrudan iş niteliğini değiştirmeden önce yeniden açın.");
        if (task.HasDirectWork && task.DirectEstimatedSeconds.HasValue && !definition.HasDirectWork && definition.TargetBudgetSeconds is null)
            throw new UseCaseException(ErrorKind.Conflict, "work_budget_required", "Mevcut tahmini konteynere çevirirken hedef bütçeyi açıkça belirtin.");
        var before = TaskStore.View(task);
        task.HasDirectWork = definition.HasDirectWork; task.DirectEstimatedSeconds = definition.DirectEstimatedSeconds; task.TargetBudgetSeconds = definition.TargetBudgetSeconds;
        if (!task.HasDirectWork) task.DirectWorkCompleted = false;
        task.Version++; task.UpdatedAt = clock.GetUtcNow();
        var nodes = await WorkloadAccess.ValidateUserTree(db, userId, ct);
        TaskHistory.Append(db, task, "WorkDefinitionChanged", before);
        LifecycleAccess.Reconcile(db, nodes, [taskId], task.UpdatedAt);
        state.PlanningVersion++; state.UpdatedAt = task.UpdatedAt;
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return TaskStore.View(task);
    }
    public async Task<TaskWorkloadReport> ReadAsync(Guid userId, Guid taskId, CancellationToken ct)
    {
        var tasks = await TaskSubtreeReader.Read(db, userId, taskId, ct);
        var result = WorkloadAccess.Calculate(tasks);
        return new(result.Summaries[taskId], result.Components);
    }
}

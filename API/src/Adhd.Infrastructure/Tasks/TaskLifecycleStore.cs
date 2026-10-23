using Adhd.Application.Common;
using Adhd.Application.Preferences;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Adhd.Domain.Users;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Tasks;

public sealed class TaskLifecycleStore(PlannerDbContext db, IPreferencesStore preferences, TimeProvider clock) : ITaskLifecycleStore
{
    public Task<TaskView> ExecuteAsync(Guid userId, Guid taskId, TaskStateCommand command, CancellationToken ct) => ExecuteCore(userId, taskId, command, true, ct);
    internal Task<TaskView> ExecuteInTransaction(Guid userId, Guid taskId, TaskStateCommand command, CancellationToken ct) => ExecuteCore(userId, taskId, command, false, ct);
    // Aynı işlemdeki görevleri tek grafik yüklemesiyle uygular. Rutin serisi değişince toplu atlama ve geri açma bununla yapılır.
    internal async Task ExecuteManyInTransaction(Guid userId, IReadOnlyCollection<Guid> taskIds, TaskAction action, CancellationToken ct)
    {
        if (taskIds.Count == 0) return;
        if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("An owning transaction is required.");
        var nodes = await db.Tasks.Where(x => x.UserId == userId && x.ArchivedAt == null).ToArrayAsync(ct);
        var before = LifecycleAccess.Capture(nodes); var now = clock.GetUtcNow();
        foreach (var id in taskIds) TaskLifecycle.Apply(nodes, id, action, null, now);
        var closed = await Adhd.Infrastructure.Work.WorkLifecycle.CloseForTasks(db, userId, nodes, now, ct);
        if (LifecycleAccess.Record(db, nodes, before, now, "StateChanged") == 0 && closed == 0) return;
        await Adhd.Infrastructure.Planning.PlanningLifecycle.CloseFuture(db, userId, nodes, now, ct);
        await db.SaveChangesAsync(ct);
    }
    private async Task<TaskView> ExecuteCore(Guid userId, Guid taskId, TaskStateCommand command, bool ownTransaction, CancellationToken ct)
    {
        if (command.Reason?.Length > 2000) throw new UseCaseException(ErrorKind.Validation, "reason_invalid", "Neden en çok2000 karakter olabilir.");
        if (!ownTransaction && db.Database.CurrentTransaction is null) throw new InvalidOperationException("An owning transaction is required.");
        await using var tx = ownTransaction ? await db.Database.BeginTransactionAsync(ct) : null; var state = await Lock(userId, ct);
        var selected = await Find(userId, taskId, command.Version, ct);
        var nodes = await db.Tasks.Where(x => x.UserId == userId && x.ArchivedAt == null).ToArrayAsync(ct);
        var choice = command.ParentCompletionChoice;
        if (command.Action == TaskAction.Complete && choice is null && nodes.Any(x => x.ParentTaskId == taskId))
        {
            var policy = (await preferences.ReadAsync(userId, ct)).Values.ParentCompletionPolicy;
            choice = policy switch { "CompleteSubtree" => ParentCompletionChoice.CompleteSubtree, "ParentOnly" => ParentCompletionChoice.ParentOnly, _ => null };
            if (choice is null) throw new UseCaseException(ErrorKind.Conflict, "completion_choice_required", "Altları da mı, yalnız üst görevi mi tamamlayacağınızı seçin.");
        }
        if (command.Action is TaskAction.CompleteDirectWork or TaskAction.ReopenDirectWork && !selected.HasDirectWork)
            throw new UseCaseException(ErrorKind.Validation, "direct_work_required", "Konteynerde doğrudan iş yok.");
        if (command.Action == TaskAction.CompleteDirectWork && selected.State is TaskState.Canceled or TaskState.Skipped or TaskState.Deferred)
            throw new UseCaseException(ErrorKind.Conflict, "task_not_active", "Önce görevi yeniden açın.");
        var before = LifecycleAccess.Capture(nodes); var now = clock.GetUtcNow();
        if (command.Action is TaskAction.Reopen or TaskAction.ReopenDirectWork && await db.WorkSessions.AnyAsync(x => x.UserId == userId && x.TaskId == taskId && x.State == Adhd.Domain.Work.WorkState.Running, ct))
            throw new UseCaseException(ErrorKind.Conflict, "work_already_running", "Önce açık çalışmayı duraklatın veya bitirin.");
        TaskLifecycle.Apply(nodes, taskId, command.Action, choice, now);
        var closed = await Adhd.Infrastructure.Work.WorkLifecycle.CloseForTasks(db, userId, nodes, now, ct);
        var reason = string.IsNullOrWhiteSpace(command.Reason) ? null : command.Reason.Trim();
        if (LifecycleAccess.Record(db, nodes, before, now, "StateChanged", reason is null ? null : new { reason, initiatingTaskId = taskId }) == 0 && closed == 0) return TaskStore.View(selected);
        await Adhd.Infrastructure.Planning.PlanningLifecycle.CloseFuture(db, userId, nodes, now, ct);
        if (ownTransaction) state.PlanningVersion++; state.UpdatedAt = now;
        await db.SaveChangesAsync(ct); if (tx is not null) await tx.CommitAsync(ct); return TaskStore.View(selected);
    }
    public async Task<TaskView> SetRequiredAsync(Guid userId, Guid taskId, long version, bool required, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var selected = await Find(userId, taskId, version, ct);
        if (selected.RequiredForParent == required) return TaskStore.View(selected);
        var nodes = await db.Tasks.Where(x => x.UserId == userId && x.ArchivedAt == null).ToArrayAsync(ct);
        var before = LifecycleAccess.Capture(nodes); var now = clock.GetUtcNow(); selected.RequiredForParent = required;
        var graphNodes = await db.Tasks.Where(x => x.UserId == userId).ToArrayAsync(ct);
        await TaskGraphAccess.Validate(db, userId, graphNodes, ct);
        TaskLifecycle.Reconcile(nodes, selected.ParentTaskId is { } parent ? [parent] : [], now);
        _ = LifecycleAccess.Record(db, nodes, before, now, "RequiredForParentChanged");
        state.PlanningVersion++; state.UpdatedAt = now;
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return TaskStore.View(selected);
    }
    // Çocuklardan otomatik bitirme görev bazında. Açmak görevin kendisini hemen uzlaştırır.
    public async Task<TaskView> SetAutoCompleteAsync(Guid userId, Guid taskId, long version, bool enabled, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var selected = await Find(userId, taskId, version, ct);
        if (selected.AutoCompleteFromChildren == enabled) return TaskStore.View(selected);
        var nodes = await db.Tasks.Where(x => x.UserId == userId && x.ArchivedAt == null).ToArrayAsync(ct);
        var before = LifecycleAccess.Capture(nodes); var now = clock.GetUtcNow(); selected.AutoCompleteFromChildren = enabled;
        TaskLifecycle.Reconcile(nodes, [taskId], now);
        _ = LifecycleAccess.Record(db, nodes, before, now, "AutoCompleteChanged");
        await Adhd.Infrastructure.Planning.PlanningLifecycle.CloseFuture(db, userId, nodes, now, ct);
        state.PlanningVersion++; state.UpdatedAt = now;
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return TaskStore.View(selected);
    }
    public async Task<TaskProgress> ProgressAsync(Guid userId, Guid taskId, CancellationToken ct)
    {
        try { return TaskProgressCalculator.Calculate(await TaskSubtreeReader.Read(db, userId, taskId, ct), taskId); }
        catch (OverflowException) { throw new UseCaseException(ErrorKind.Validation, "workload_overflow", "Toplam süre desteklenen sayı aralığını aşıyor."); }
    }
    private Task<UserPlanningState> Lock(Guid userId, CancellationToken ct) => db.PlanningStates
        .FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\" = {userId} FOR UPDATE").SingleAsync(ct);
    private async Task<TaskItem> Find(Guid userId, Guid taskId, long version, CancellationToken ct)
    {
        var task = await db.Tasks.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == taskId, ct)
            ?? throw new UseCaseException(ErrorKind.NotFound, "task_not_found", "Görev bulunamadı.");
        if (task.Version != version) throw new UseCaseException(ErrorKind.Conflict, "version_conflict", "Görev değişmiş; güncel kaydı alın.");
        if (task.ArchivedAt is not null) throw new UseCaseException(ErrorKind.Conflict, "task_archived", "Arşivlenmiş görevin durumu değiştirilemez.");
        return task;
    }
}

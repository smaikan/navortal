using System.Data;
using Adhd.Application.Common;
using Adhd.Application.Tasks;
using Adhd.Domain.Collections;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Collections;

public sealed class TaskClassificationStore(PlannerDbContext db, TimeProvider clock) : ITaskClassificationStore
{
    public async Task<ClassificationView> ReadAsync(Guid userId, Guid taskId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var task = await Find(userId, taskId, ct);
        var tags = await db.TaskTagLinks.AsNoTracking().Where(x => x.UserId == userId && x.TaskId == taskId).OrderBy(x => x.TagId).Select(x => x.TagId).ToArrayAsync(ct);
        var planningVersion = await db.PlanningStates.Where(x => x.UserId == userId).Select(x => x.PlanningVersion).SingleAsync(ct);
        var view = new ClassificationView(task.Id, task.Version, planningVersion, Values(task, tags)); await tx.CommitAsync(ct); return view;
    }
    public async Task<ClassificationView> WriteAsync(Guid userId, Guid taskId, ClassificationChange change, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var state = await db.PlanningStates.FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\" = {userId} FOR UPDATE").SingleAsync(ct);
        var root = await Find(userId, taskId, ct);
        if (root.Version != change.Version) throw new UseCaseException(ErrorKind.Conflict, "version_conflict", "Görev değişmiş; güncel kaydı alın.");
        if (root.ArchivedAt is not null) throw new UseCaseException(ErrorKind.Conflict, "task_archived", "Arşivlenmiş görevin sınıflandırması değiştirilemez.");
        if ((change.ApplyToSubtree || change.DetachKind is not null) && state.PlanningVersion != change.ExpectedPlanningVersion) throw new UseCaseException(ErrorKind.Conflict, "planning_version_conflict", "Alt ağaç değişmiş; güncel bağlamı alın.");
        if (change.DetachKind is not null)
        {
            var detached = await DetachAsync(userId, root, state, change, ct);
            await tx.CommitAsync(ct); return detached;
        }
        await Owned<TaskProject>(userId, change.Values.ProjectId, ct); await Owned<TaskPool>(userId, change.Values.PoolId, ct); await Owned<TaskCategory>(userId, change.Values.CategoryId, ct);
        if (await db.Tags.CountAsync(x => x.UserId == userId && change.Values.TagIds.Contains(x.Id), ct) != change.Values.TagIds.Length)
            throw MissingResource();
        var nodes = change.ApplyToSubtree ? await TaskSubtreeReader.Read(db, userId, taskId, ct, tracking: true) : [root];
        var ids = nodes.Select(x => x.Id).ToArray();
        var links = await db.TaskTagLinks.Where(x => x.UserId == userId && ids.Contains(x.TaskId)).ToArrayAsync(ct);
        var linksByTask = links.ToLookup(x => x.TaskId);
        var wanted = change.Values.TagIds.ToHashSet(); var changes = 0; var now = clock.GetUtcNow();
        foreach (var task in nodes)
        {
            var oldLinks = linksByTask[task.Id].ToArray(); var oldTags = oldLinks.Select(x => x.TagId).ToHashSet();
            var previousValues = Values(task, oldTags.Order().ToArray());
            if (task.ProjectId == change.Values.ProjectId && task.PoolId == change.Values.PoolId && task.CategoryId == change.Values.CategoryId && wanted.SetEquals(oldTags)) continue;
            var before = TaskStore.View(task);
            if (task.ProjectId.HasValue && change.Values.ProjectId is null) task.ProjectDetached = true;
            if (task.PoolId.HasValue && change.Values.PoolId is null) task.PoolDetached = true;
            if (task.CategoryId.HasValue && change.Values.CategoryId is null) task.CategoryDetached = true;
            if (change.Values.ProjectId.HasValue) task.ProjectDetached = false;
            if (change.Values.PoolId.HasValue) task.PoolDetached = false;
            if (change.Values.CategoryId.HasValue) task.CategoryDetached = false;
            task.ProjectId = change.Values.ProjectId; task.PoolId = change.Values.PoolId; task.CategoryId = change.Values.CategoryId;
            db.TaskTagLinks.RemoveRange(oldLinks.Where(x => !wanted.Contains(x.TagId)));
            db.TaskTagLinks.AddRange(wanted.Except(oldTags).Select(tag => new TaskTagLink { UserId = userId, TaskId = task.Id, TagId = tag }));
            task.Version++; task.UpdatedAt = now;
            TaskHistory.Append(db, task, "ClassificationChanged", before, new { before = previousValues, after = change.Values }); changes++;
        }
        if (changes > 0) { state.PlanningVersion++; state.UpdatedAt = now; await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); }
        return new(root.Id, root.Version, state.PlanningVersion, change.Values);
    }
    private async Task<ClassificationView> DetachAsync(Guid userId, TaskItem root, Adhd.Domain.Users.UserPlanningState state, ClassificationChange change, CancellationToken ct)
    {
        var kind = change.DetachKind!; var id = change.DetachResourceId!.Value;
        if (kind == "projects") await Owned<TaskProject>(userId, id, ct);
        else if (kind == "pools") await Owned<TaskPool>(userId, id, ct);
        else await Owned<TaskCategory>(userId, id, ct);
        var all = await db.Tasks.Where(x => x.UserId == userId && x.ArchivedAt == null && x.DeletedAt == null).ToArrayAsync(ct);
        var owners = CollectionTaskScope.Resolve(all, kind);
        if (owners.GetValueOrDefault(root.Id) != id)
            throw new UseCaseException(ErrorKind.Conflict, "membership_changed", "Görev artık bu bölümde değil. Güncel listeyi kontrol edin.");
        var nodes = await TaskSubtreeReader.Read(db, userId, root.Id, ct, tracking: true); var now = clock.GetUtcNow();
        foreach (var task in nodes.Where(x => owners.GetValueOrDefault(x.Id) == id))
        {
            var before = TaskStore.View(task); CollectionTaskScope.Detach(task, kind, task.Id == root.Id);
            task.Version++; task.UpdatedAt = now;
            TaskHistory.Append(db, task, "ClassificationChanged", before, new { removedFrom = new { kind, resourceId = id } });
        }
        state.PlanningVersion++; state.UpdatedAt = now; await db.SaveChangesAsync(ct);
        var tags = await db.TaskTagLinks.Where(x => x.UserId == userId && x.TaskId == root.Id).OrderBy(x => x.TagId).Select(x => x.TagId).ToArrayAsync(ct);
        return new(root.Id, root.Version, state.PlanningVersion, Values(root, tags));
    }
    private async Task<TaskItem> Find(Guid userId, Guid taskId, CancellationToken ct) => await db.Tasks.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == taskId, ct)
        ?? throw new UseCaseException(ErrorKind.NotFound, "task_not_found", "Görev bulunamadı.");
    private async Task Owned<T>(Guid userId, Guid? id, CancellationToken ct) where T : class, INamedResource
    {
        if (id.HasValue && !await db.Set<T>().AnyAsync(x => EF.Property<Guid>(x, "UserId") == userId && EF.Property<Guid>(x, "Id") == id.Value, ct)) throw MissingResource();
    }
    private static ClassificationValues Values(TaskItem task, Guid[] tags) => new(task.ProjectId, task.PoolId, task.CategoryId, tags);
    private static UseCaseException MissingResource() => new(ErrorKind.NotFound, "resource_not_found", "Sınıflandırma kaydı bulunamadı.");
}

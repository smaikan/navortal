using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Adhd.Application.Common;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Tasks;

// Kök ve alt görevler tek işlemde, tek oluşturma ve alt görev ekleme kurallarıyla açılır. Alt görevi olan yeni görev kapsayıcıdır.
public sealed class TaskTreeCreateStore(PlannerDbContext db, TimeProvider clock) : ITaskTreeCreateStore
{
    public async Task<(TaskTreeCreateResult Result, bool Replayed)> CreateAsync(Guid userId, TaskTreeNode root, string key, CancellationToken ct)
    {
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(root, RevisionWriter.Json))));
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var state = await db.PlanningStates.FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\" = {userId} FOR UPDATE").SingleAsync(ct);
        var previous = await db.IdempotencyRecords.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Scope == "task-tree-create" && x.Key == key, ct);
        if (previous is not null)
        {
            if (previous.RequestHash != hash) throw new UseCaseException(ErrorKind.Conflict, "idempotency_conflict", "Anahtar başka bir komutta kullanılmış.");
            return (JsonSerializer.Deserialize<TaskTreeCreateResult>(previous.Response, RevisionWriter.Json)!, true);
        }
        var now = clock.GetUtcNow();
        var created = new List<TaskItem>();
        TaskItem Add(TaskTreeNode node, Guid? parentId, decimal order)
        {
            var children = node.Children ?? [];
            var task = new TaskItem
            {
                Id = Guid.CreateVersion7(), UserId = userId, ParentTaskId = parentId, Title = node.Title, SortOrder = order,
                CreatedAt = now, UpdatedAt = now,
                // Alt görevi olan yeni kök de tek alt görev eklemedeki gibi kapsayıcı olur.
                HasDirectWork = children.Length == 0,
            };
            db.Tasks.Add(task); TaskHistory.Append(db, task, "Created", null); created.Add(task);
            for (var i = 0; i < children.Length; i++) Add(children[i], task.Id, (i + 1) * 1024m);
            return task;
        }
        var rootOrder = (await db.Tasks.Where(x => x.UserId == userId && x.ParentTaskId == null && x.ArchivedAt == null).Select(x => (decimal?)x.SortOrder).MaxAsync(ct) ?? 0) + 1024;
        var top = Add(root, null, rootOrder);
        state.PlanningVersion++; state.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        var nodes = await WorkloadAccess.ValidateUserTree(db, userId, ct);
        await TaskGraphAccess.Validate(db, userId, nodes, ct);
        LifecycleAccess.Reconcile(db, nodes, created.Where(x => x.ParentTaskId is not null).Select(x => x.ParentTaskId!.Value).Distinct(), now);
        var result = new TaskTreeCreateResult(TaskStore.View(top), created.Select(TaskStore.View).ToArray(), state.PlanningVersion);
        db.IdempotencyRecords.Add(new() { UserId = userId, Scope = "task-tree-create", Key = key, RequestHash = hash, Response = JsonSerializer.Serialize(result, RevisionWriter.Json), CreatedAt = now });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return (result, false);
    }
}

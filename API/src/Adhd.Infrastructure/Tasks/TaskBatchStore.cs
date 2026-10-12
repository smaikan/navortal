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

// Her başlığı tek görev eklemedeki kurallarla bir kök olarak kaydet. Hepsi aynı işlemde.
public sealed class TaskBatchStore(PlannerDbContext db, TimeProvider clock) : ITaskBatchStore
{
    public async Task<(TaskBatchResult Result, bool Replayed)> CreateAsync(Guid userId, TaskBatchCommand command, string key, CancellationToken ct)
    {
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(command, RevisionWriter.Json))));
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var state = await db.PlanningStates.FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\" = {userId} FOR UPDATE").SingleAsync(ct);
        var previous = await db.IdempotencyRecords.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Scope == "task-batch" && x.Key == key, ct);
        if (previous is not null)
        {
            if (previous.RequestHash != hash) throw new UseCaseException(ErrorKind.Conflict, "idempotency_conflict", "Anahtar başka bir komutta kullanılmış.");
            return (JsonSerializer.Deserialize<TaskBatchResult>(previous.Response, RevisionWriter.Json)!, true);
        }
        if (command.PoolId is { } pool && !await db.Pools.AnyAsync(x => x.UserId == userId && x.Id == pool && x.ArchivedAt == null, ct))
            throw new UseCaseException(ErrorKind.NotFound, "pool_not_found", "Havuz bulunamadı.");
        var now = clock.GetUtcNow();
        var order = await db.Tasks.Where(x => x.UserId == userId && x.ParentTaskId == null && x.ArchivedAt == null).Select(x => (decimal?)x.SortOrder).MaxAsync(ct) ?? 0;
        var created = new List<TaskItem>();
        foreach (var title in command.Titles)
        {
            order += 1024;
            var task = new TaskItem { Id = Guid.CreateVersion7(), UserId = userId, CreatedAt = now, UpdatedAt = now, Title = title, SortOrder = order, PoolId = command.PoolId };
            db.Tasks.Add(task); TaskHistory.Append(db, task, "Created", null); created.Add(task);
        }
        state.PlanningVersion++; state.UpdatedAt = now;
        var result = new TaskBatchResult(created.Select(TaskStore.View).ToArray(), state.PlanningVersion);
        db.IdempotencyRecords.Add(new() { UserId = userId, Scope = "task-batch", Key = key, RequestHash = hash, Response = JsonSerializer.Serialize(result, RevisionWriter.Json), CreatedAt = now });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return (result, false);
    }
}

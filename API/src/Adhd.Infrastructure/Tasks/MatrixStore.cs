using System.Data;
using Adhd.Application.Common;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Tasks;
public sealed class MatrixStore(PlannerDbContext db) : IMatrixStore
{
    private IQueryable<TaskItem> Active(Guid userId) => db.Tasks.AsNoTracking().Where(t => t.UserId == userId && t.DeletedAt == null && t.ArchivedAt == null
        && (t.State == TaskState.Pending || t.State == TaskState.InProgress || t.State == TaskState.Paused || t.State == TaskState.Deferred));
    public async Task<MatrixView> ReadAsync(Guid userId, int[] offsets, int limit, CancellationToken ct)
    {
        if (offsets.Length != 5 || offsets.Any(x => x is < 0 or > 100000) || limit is < 1 or > 100) throw Invalid();
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var version = await db.MatrixStates.AsNoTracking().Where(x => x.UserId == userId).Select(x => (long?)x.Version).SingleOrDefaultAsync(ct) ?? 0;
        var columns = new List<MatrixColumn>();
        foreach (var quadrant in Enum.GetValues<MatrixQuadrant>())
        {
            var query = from m in db.MatrixItems.AsNoTracking().Where(x => x.UserId == userId && x.Quadrant == quadrant)
                        join t in Active(userId) on m.TaskId equals t.Id
                        join p in db.Tasks.AsNoTracking().Where(x => x.UserId == userId && x.DeletedAt == null) on t.ParentTaskId equals (Guid?)p.Id into parents
                        from p in parents.DefaultIfEmpty()
                        select new { Item = m, Task = t, Parent = p };
            var total = await query.CountAsync(ct);
            var offset = Math.Min(offsets[(int)quadrant], total == 0 ? 0 : ((total - 1) / limit) * limit);
            var items = await query.OrderBy(x => x.Item.SortOrder).ThenBy(x => x.Item.TaskId).Skip(offset).Take(limit)
                .Select(x => new MatrixCard(new TaskPickerRow(x.Task.Id, x.Task.Title, x.Task.ParentTaskId, x.Parent == null ? null : x.Parent.Title,
                    x.Task.DirectEstimatedSeconds, x.Task.Priority, x.Task.EnergyDemand))).ToArrayAsync(ct);
            columns.Add(new(quadrant, items, offset, limit, total));
        }
        await tx.CommitAsync(ct); return new(version, columns.ToArray());
    }
    public async Task<TaskPickerPage> CandidatesAsync(Guid userId, string? search, int offset, int limit, CancellationToken ct)
    {
        if (offset is < 0 or > 100000 || limit is < 1 or > 100 || search?.Length > 200) throw Invalid();
        var term = search?.Trim() ?? "";
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var query = from t in Active(userId).Where(t => !db.MatrixItems.Any(m => m.UserId == userId && m.TaskId == t.Id))
                    join p in db.Tasks.AsNoTracking().Where(x => x.UserId == userId && x.DeletedAt == null) on t.ParentTaskId equals (Guid?)p.Id into parents
                    from p in parents.DefaultIfEmpty()
                    where term == "" || EF.Functions.Collate(t.Title, "adhd_search").ToLower().Contains(EF.Functions.Collate(term, "adhd_search").ToLower())
                        || (p != null && EF.Functions.Collate(p.Title, "adhd_search").ToLower().Contains(EF.Functions.Collate(term, "adhd_search").ToLower()))
                    select new { Task = t, Parent = p };
        var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(x => x.Task.Title).ThenBy(x => x.Task.Id).Skip(offset).Take(limit)
            .Select(x => new TaskPickerRow(x.Task.Id, x.Task.Title, x.Task.ParentTaskId, x.Parent == null ? null : x.Parent.Title,
                x.Task.DirectEstimatedSeconds, x.Task.Priority, x.Task.EnergyDemand)).ToArrayAsync(ct);
        await tx.CommitAsync(ct); return new(rows, offset, limit, total);
    }
    public async Task<MatrixWriteResult> WriteAsync(Guid userId, Guid taskId, MatrixChange change, bool add, CancellationToken ct)
    {
        if (!Enum.IsDefined(change.Quadrant) || change.Version < 0 || change.BeforeTaskId == taskId) throw Invalid();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var state = await Lock(userId, change.Version, ct);
        if (!await Active(userId).AnyAsync(t => t.Id == taskId, ct)) throw Missing();
        var item = await db.MatrixItems.SingleOrDefaultAsync(m => m.UserId == userId && m.TaskId == taskId, ct);
        if (add && item != null) throw new UseCaseException(ErrorKind.Conflict, "matrix_task_exists", "Görev matriste zaten var. Listeyi yenile.");
        if (!add && item == null) throw Missing();
        var target = db.MatrixItems.Where(m => m.UserId == userId && m.Quadrant == change.Quadrant && m.TaskId != taskId);
        decimal order;
        if (change.BeforeTaskId is { } beforeId)
        {
            var before = await target.AsNoTracking().SingleOrDefaultAsync(m => m.TaskId == beforeId, ct) ?? throw Missing();
            if (!await Active(userId).AnyAsync(t => t.Id == beforeId, ct)) throw Missing();
            var previous = await target.Where(m => m.SortOrder < before.SortOrder).Select(m => (decimal?)m.SortOrder).MaxAsync(ct) ?? before.SortOrder - 2048;
            order = decimal.Round((previous + before.SortOrder) / 2, 10, MidpointRounding.ToZero);
            if (order <= previous || order >= before.SortOrder)
            {
                var all = await target.OrderBy(m => m.SortOrder).ThenBy(m => m.TaskId).ToListAsync(ct);
                var index = all.FindIndex(m => m.TaskId == beforeId);
                for (var i = 0; i < all.Count; i++) all[i].SortOrder = (i + (i >= index ? 2 : 1)) * 1024m;
                order = (index + 1) * 1024m;
            }
        }
        else order = (await target.Select(m => (decimal?)m.SortOrder).MaxAsync(ct) ?? 0) + 1024;
        if (item == null) { item = new() { UserId = userId, TaskId = taskId }; db.MatrixItems.Add(item); }
        item.Quadrant = change.Quadrant; item.SortOrder = order; state.Version++;
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return new(state.Version, taskId);
    }
    public async Task<MatrixWriteResult> RemoveAsync(Guid userId, Guid taskId, long version, CancellationToken ct)
    {
        if (version < 0) throw Invalid();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var state = await Lock(userId, version, ct);
        var item = await db.MatrixItems.SingleOrDefaultAsync(m => m.UserId == userId && m.TaskId == taskId, ct) ?? throw Missing();
        db.MatrixItems.Remove(item); state.Version++; await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return new(state.Version, taskId);
    }
    private async Task<MatrixState> Lock(Guid userId, long version, CancellationToken ct)
    {
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO matrix_states (\"UserId\", \"Version\") VALUES ({userId}, 0) ON CONFLICT (\"UserId\") DO NOTHING", ct);
        var state = await db.MatrixStates.FromSqlInterpolated($"SELECT * FROM matrix_states WHERE \"UserId\" = {userId} FOR UPDATE").SingleAsync(ct);
        if (state.Version != version) throw new UseCaseException(ErrorKind.Conflict, "matrix_version_conflict", "Matris başka bir işlemde değişti. Güncel listeyi alıp yeniden seç.");
        return state;
    }
    private static UseCaseException Invalid() => new(ErrorKind.Validation, "matrix_invalid", "Matris alanı, sıra veya sayfa bilgisi geçersiz.");
    private static UseCaseException Missing() => new(ErrorKind.NotFound, "matrix_task_not_found", "Görev veya hedef matris kaydı bulunamadı.");
}

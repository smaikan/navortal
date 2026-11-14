using Adhd.Application.Collections;
using Adhd.Application.Common;
using Adhd.Domain.Collections;
using Adhd.Domain.Users;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Collections;

public sealed class NamedResourceStore<T>(PlannerDbContext db, TimeProvider clock) : INamedResourceStore<T> where T : class, INamedResource, new()
{
    public async Task<NamedResourceView> CreateAsync(Guid userId, NamedResourceFields fields, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct); var now = clock.GetUtcNow();
        var entity = new T { Id = Guid.CreateVersion7(), UserId = userId, Name = fields.Name, Description = fields.Description, CreatedAt = now, UpdatedAt = now };
        db.Set<T>().Add(entity); state.PlanningVersion++; state.UpdatedAt = now;
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return View(entity);
    }
    public async Task<NamedResourceView> GetAsync(Guid userId, Guid id, CancellationToken ct) => View(await Find(userId, id, ct));
    public async Task<NamedResourcePage> ListAsync(Guid userId, int offset, int limit, string? search, bool includeArchived, bool includeSummary, CancellationToken ct)
    {
        var query = db.Set<T>().AsNoTracking().Where(x => EF.Property<Guid>(x, "UserId") == userId && (includeArchived || EF.Property<DateTimeOffset?>(x, "ArchivedAt") == null));
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => EF.Functions.Collate(EF.Property<string>(x, "Name"), "adhd_search").ToLower().Contains(EF.Functions.Collate(term, "adhd_search").ToLower()));
        }
        var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(x => EF.Property<string>(x, "Name")).ThenBy(x => EF.Property<Guid>(x, "Id")).Skip(offset).Take(limit).ToArrayAsync(ct);
        return new(rows.Select(View).ToArray(), offset, limit, total, includeSummary ? await SummariesAsync(userId, rows.Select(x => x.Id).ToArray(), ct) : null);
    }
    // Sayfadaki özetleri tek görev sorgusunda al. Sayıları iş yüküyle aynı şekilde hesapla.
    private async Task<NamedResourceSummary[]> SummariesAsync(Guid userId, Guid[] ids, CancellationToken ct)
    {
        var query = db.Tasks.AsNoTracking().Where(x => x.UserId == userId && x.ArchivedAt == null && x.DeletedAt == null);
        var kind = typeof(T) == typeof(TaskProject) ? "projects" : typeof(T) == typeof(TaskPool) ? "pools" : typeof(T) == typeof(TaskCategory) ? "categories" : null;
        if (kind is null) return [];
        var all = await query.ToArrayAsync(ct); var owners = CollectionTaskScope.Resolve(all, kind);
        var groups = all.ToLookup(x => owners[x.Id]);
        var children = all.Where(x => x.ParentTaskId.HasValue).ToLookup(x => x.ParentTaskId!.Value);
        try
        {
            return ids.Select(id =>
            {
                var tasks = groups[id].ToArray();
                var values = WorkloadForestCalculator.Calculate(tasks);
                var counted = tasks.Where(x => !children[x.Id].Any()).ToArray();
                return new NamedResourceSummary(id, counted.Length, counted.Count(x => x.State == TaskState.Completed), values.OpenComponentCount, values.KnownEstimatedSeconds, values.UnknownEstimateCount);
            }).ToArray();
        }
        catch (OverflowException) { throw new UseCaseException(ErrorKind.Validation, "workload_overflow", "Toplam süre desteklenen sayı aralığını aşıyor."); }
    }
    public async Task<NamedResourceView> UpdateAsync(Guid userId, Guid id, long version, NamedResourceFields? fields, bool archive, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct); var entity = await Find(userId, id, ct);
        if (entity.Version != version) throw new UseCaseException(ErrorKind.Conflict, "version_conflict", "Kayıt değişmiş; güncel veriyi alın.");
        if (entity.ArchivedAt is not null)
        {
            if (!archive) throw new UseCaseException(ErrorKind.Conflict, "resource_archived", "Arşivlenmiş kayıt düzenlenemez.");
            return View(entity);
        }
        var now = clock.GetUtcNow();
        if (archive) entity.ArchivedAt = now; else { entity.Name = fields!.Name; entity.Description = fields.Description; }
        entity.Version++; entity.UpdatedAt = now; state.PlanningVersion++; state.UpdatedAt = now;
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return View(entity);
    }
    private Task<UserPlanningState> Lock(Guid userId, CancellationToken ct) => db.PlanningStates
        .FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\" = {userId} FOR UPDATE").SingleAsync(ct);
    private async Task<T> Find(Guid userId, Guid id, CancellationToken ct) => await db.Set<T>().SingleOrDefaultAsync(x => EF.Property<Guid>(x, "UserId") == userId && EF.Property<Guid>(x, "Id") == id, ct)
        ?? throw new UseCaseException(ErrorKind.NotFound, "resource_not_found", "Kayıt bulunamadı.");
    private static NamedResourceView View(T e) => new(e.Id, e.Name, e.Description, e.CreatedAt, e.UpdatedAt, e.ArchivedAt, e.Version);
    public async Task<NamedResourceWorkload> WorkloadAsync(Guid userId, Guid id, CancellationToken ct)
    {
        _ = await Find(userId, id, ct);
        var query = db.Tasks.AsNoTracking().Where(x => x.UserId == userId && x.ArchivedAt == null && x.DeletedAt == null);
        if (typeof(T) == typeof(TaskProject) || typeof(T) == typeof(TaskPool) || typeof(T) == typeof(TaskCategory))
        {
            var kind = typeof(T) == typeof(TaskProject) ? "projects" : typeof(T) == typeof(TaskPool) ? "pools" : "categories";
            var all = await query.ToArrayAsync(ct); var owners = CollectionTaskScope.Resolve(all, kind);
            var parents = all.Where(x => x.ParentTaskId.HasValue).Select(x => x.ParentTaskId!.Value).ToHashSet();
            var tasks = all.Where(x => owners[x.Id] == id).ToArray();
            try { return new(id, WorkloadForestCalculator.Calculate(tasks) with { TaskCount = tasks.Count(x => !parents.Contains(x.Id)) }); }
            catch (OverflowException) { throw new UseCaseException(ErrorKind.Validation, "workload_overflow", "Toplam süre desteklenen sayı aralığını aşıyor."); }
        }
        else if (typeof(T) == typeof(TaskTag)) query = query.Where(x => db.TaskTagLinks.Any(tag => tag.UserId == userId && tag.TaskId == x.Id && tag.TagId == id));
        else throw new InvalidOperationException("Unknown collection type.");
        try { return new(id, WorkloadForestCalculator.Calculate(await query.ToArrayAsync(ct))); }
        catch (OverflowException) { throw new UseCaseException(ErrorKind.Validation, "workload_overflow", "Toplam süre desteklenen sayı aralığını aşıyor."); }
    }
}

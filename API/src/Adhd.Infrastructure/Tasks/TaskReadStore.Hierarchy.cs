using System.Data;
using Adhd.Application.Common;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Tasks;

public sealed partial class TaskReadStore
{
    private async Task<TaskItem[]> HierarchyNodes(Guid userId, CancellationToken ct)
    {
        var nodes = await db.Tasks.AsNoTracking().Where(x => x.UserId == userId && x.DeletedAt == null && x.ArchivedAt == null).OrderBy(x => x.SortOrder).ThenBy(x => x.Id).Take(50001).ToArrayAsync(ct);
        if (nodes.Length > 50000) throw new UseCaseException(ErrorKind.Conflict, "task_tree_too_dense", "Görev ağacı çok büyük; önce arşivlenmiş işleri ayırın.");
        return nodes;
    }
    public async Task<ResourceTaskTreePage> CollectionAsync(Guid userId, string kind, Guid id, int offset, int limit, CancellationToken ct)
    {
        if (offset is < 0 or > 100000 || limit is < 1 or > 100) throw new UseCaseException(ErrorKind.Validation, "tree_query_invalid", "Sayfa sınırları geçersiz.");
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var owned = kind switch {
            "projects" => await db.Projects.AnyAsync(x => x.UserId == userId && x.Id == id, ct),
            "pools" => await db.Pools.AnyAsync(x => x.UserId == userId && x.Id == id, ct),
            "categories" => await db.Categories.AnyAsync(x => x.UserId == userId && x.Id == id, ct),
            "tags" => await db.Tags.AnyAsync(x => x.UserId == userId && x.Id == id, ct), _ => false };
        if (!owned) throw new UseCaseException(ErrorKind.NotFound, "resource_not_found", "Kayıt bulunamadı.");
        var all = await HierarchyNodes(userId, ct); var byId = all.ToDictionary(x => x.Id);
        var tags = kind == "tags" ? await db.TaskTagLinks.Where(x => x.UserId == userId && x.TagId == id).Select(x => x.TaskId).ToArrayAsync(ct) : [];
        var members = all.Where(x => kind switch { "projects" => x.ProjectId == id, "pools" => x.PoolId == id, "categories" => x.CategoryId == id, _ => tags.Contains(x.Id) }).ToArray();
        var memberIds = members.Select(x => x.Id).ToHashSet();
        bool HasMemberAncestor(TaskItem task) {
            var seen = new HashSet<Guid> { task.Id }; var parent = task.ParentTaskId;
            while (parent is {} p && byId.TryGetValue(p, out var node)) {
                if (!seen.Add(p)) throw new UseCaseException(ErrorKind.Conflict, "task_tree_cycle", "Görev ağacında döngü var.");
                if (memberIds.Contains(p)) return true; parent = node.ParentTaskId;
            }
            return false;
        }
        var roots = members.Where(x => !HasMemberAncestor(x)).OrderBy(x => x.State == TaskState.Completed).ThenBy(x => x.Title).ThenBy(x => x.Id).ToArray();
        var page = roots.Skip(offset).Take(limit).ToArray(); var children = all.Where(x => x.ParentTaskId.HasValue).ToLookup(x => x.ParentTaskId!.Value);
        var included = new Dictionary<Guid, TaskItem>(); var queue = new Queue<TaskItem>(page);
        while (queue.TryDequeue(out var node)) {
            if (!included.TryAdd(node.Id, node)) throw new UseCaseException(ErrorKind.Conflict, "task_tree_cycle", "Görev ağacında döngü var.");
            foreach (var child in children[node.Id]) queue.Enqueue(child);
        }
        return new(page.Select(TaskStore.View).ToArray(), included.Values.Select(TaskStore.View).ToArray(), page.Where(x => x.ParentTaskId.HasValue && byId.ContainsKey(x.ParentTaskId.Value)).Select(x => byId[x.ParentTaskId!.Value]).DistinctBy(x => x.Id).Select(x => new TaskAncestorRow(x.Id, x.Title, x.ParentTaskId, x.Version)).ToArray(), offset, limit, roots.Length);
    }
    private async Task<TaskPickerView> HierarchicalPicker(Guid userId, DateOnly? date, string? search, int offset, int assignedOffset, int limit, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var state = await db.PlanningStates.AsNoTracking().SingleAsync(x => x.UserId == userId, ct);
        var recurring = await db.RecurrenceOccurrences.Where(x => x.UserId == userId && (date == null || x.LocalDate != date)).Select(x => x.TaskId).ToArrayAsync(ct);
        var all = (await HierarchyNodes(userId, ct)).Where(x => !recurring.Contains(x.Id) && x.State is TaskState.Pending or TaskState.InProgress or TaskState.Paused).ToArray();
        var children = all.Where(x => x.ParentTaskId.HasValue).ToLookup(x => x.ParentTaskId!.Value); var byId = all.ToDictionary(x => x.Id);
        var term = search?.Trim() ?? ""; var comparison = StringComparison.CurrentCultureIgnoreCase;
        var path = new HashSet<Guid>();
        TaskPickerRow? Build(TaskItem node, bool parentMatched = false) {
            if (path.Count >= 128) throw new UseCaseException(ErrorKind.Conflict, "task_tree_too_deep", "Görev ağacı 128 seviyeden derin olamaz.");
            if (!path.Add(node.Id)) throw new UseCaseException(ErrorKind.Conflict, "task_tree_cycle", "Görev ağacında döngü var.");
            var matches = parentMatched || term.Length == 0 || node.Title.Contains(term, comparison);
            var nested = children[node.Id].Select(x => Build(x, matches)).OfType<TaskPickerRow>().ToArray(); path.Remove(node.Id);
            if ((!matches && nested.Length == 0) || (node.DirectWorkCompleted && nested.Length == 0)) return null;
            return new(node.Id, node.Title, node.ParentTaskId, node.ParentTaskId is {} p && byId.TryGetValue(p, out var parent) ? parent.Title : null, node.DirectEstimatedSeconds, node.Priority, node.EnergyDemand, nested);
        }
        var roots = all.Where(x => x.ParentTaskId is null || !byId.ContainsKey(x.ParentTaskId.Value)).OrderBy(x => x.Title).ThenBy(x => x.Id).Select(x => Build(x)).OfType<TaskPickerRow>().ToArray();
        bool Assigned(TaskPickerRow row) => date is {} day && (byId[row.Id].PlannedFrom <= day && byId[row.Id].PlannedTo >= day || (row.Children ?? []).Any(Assigned));
        var a = roots.Where(Assigned).ToArray(); var b = roots.Where(x => !Assigned(x)).ToArray();
        return new(new(a.Skip(assignedOffset).Take(limit).ToArray(), assignedOffset, limit, a.Length), new(b.Skip(offset).Take(limit).ToArray(), offset, limit, b.Length), term.Length > 0 && all.Any(x => string.Equals(x.Title, term, comparison)), new(new(state.PlanningVersion, state.NotesVersion, state.SpecialDaysVersion), clock.GetUtcNow()));
    }
}

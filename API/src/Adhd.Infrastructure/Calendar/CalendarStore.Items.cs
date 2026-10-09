using Adhd.Application.Calendar;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Calendar;

// Her günün açık planını görev, üst ve köküyle sınırlı
// sayıda sorguda al. Molalar, tamponlar ve silinenler hariç.
public sealed partial class CalendarStore
{
    private sealed record TaskNode(Guid Id, string Title, Guid? ParentTaskId, TaskState State);
    public async Task<CalendarItemPage> ItemsAsync(Guid userId, DateOnly fromDate, DateOnly toDate, int offset, int limit, CancellationToken ct)
    {
        Validate(fromDate, toDate);
        var timed = await (from s in db.TaskSchedules.AsNoTracking()
                           join p in db.DailyPlans.AsNoTracking() on new { s.UserId, Id = s.DailyPlanId } equals new { p.UserId, p.Id }
                           join t in db.Tasks.AsNoTracking() on new { s.UserId, Id = s.TaskId } equals new { t.UserId, Id = (Guid?)t.Id }
                           where s.UserId == userId && s.State == ScheduleState.Planned && s.Kind == ScheduleKind.Work && p.LocalDate >= fromDate && p.LocalDate <= toDate && t.DeletedAt == null
                           select new { s.Id, p.LocalDate, TaskId = t.Id, s.StartsAt, s.EndsAt, s.CompletedAt }).ToArrayAsync(ct);
        var untimed = await (from d in db.DayItems.AsNoTracking()
                             join t in db.Tasks.AsNoTracking() on new { d.UserId, Id = d.TaskId } equals new { t.UserId, t.Id }
                             where d.UserId == userId && d.State == DayItemState.Planned && d.LocalDate >= fromDate && d.LocalDate <= toDate && t.DeletedAt == null && t.ArchivedAt == null
                             select new { d.Id, d.LocalDate, d.TaskId, d.SortOrder, d.CompletedAt }).ToArrayAsync(ct);
        // Önce görevleri al, sonra her seviyenin üstlerini tek sorguyla yükle.
        var nodes = new Dictionary<Guid, TaskNode>();
        var wanted = timed.Select(x => x.TaskId).Concat(untimed.Select(x => x.TaskId)).ToHashSet();
        while (wanted.Count > 0)
        {
            var ids = wanted.ToArray();
            var found = await db.Tasks.AsNoTracking().Where(x => x.UserId == userId && ids.Contains(x.Id)).Select(x => new TaskNode(x.Id, x.Title, x.ParentTaskId, x.State)).ToArrayAsync(ct);
            foreach (var node in found) nodes[node.Id] = node;
            wanted = found.Where(x => x.ParentTaskId is { } parent && !nodes.ContainsKey(parent)).Select(x => x.ParentTaskId!.Value).ToHashSet();
        }
        TaskNode Root(TaskNode node)
        {
            var seen = new HashSet<Guid>();
            while (node.ParentTaskId is { } parent && nodes.TryGetValue(parent, out var next) && seen.Add(node.Id)) node = next;
            return node;
        }
        CalendarItem Make(CalendarItemKind kind, Guid id, DateOnly date, Guid taskId, DateTimeOffset? starts, DateTimeOffset? ends, DateTimeOffset? completed)
        {
            var task = nodes[taskId]; var root = Root(task);
            TaskNode? parent = task.ParentTaskId is { } p && nodes.TryGetValue(p, out var found) ? found : null;
            return new(kind, id, date, task.Id, task.Title, parent?.Id, parent?.Title, root.Id, root.Title, starts, ends, completed, task.State);
        }
        var all = timed.OrderBy(x => x.LocalDate).ThenBy(x => x.StartsAt).ThenBy(x => x.Id)
            .Select(x => (x.LocalDate, Order: 0, Sort: x.StartsAt.UtcTicks, Item: Make(CalendarItemKind.Timed, x.Id, x.LocalDate, x.TaskId, x.StartsAt, x.EndsAt, x.CompletedAt)))
            .Concat(untimed.Select(x => (x.LocalDate, Order: 1, Sort: (long)x.SortOrder, Item: Make(CalendarItemKind.Untimed, x.Id, x.LocalDate, x.TaskId, null, null, x.CompletedAt))))
            .OrderBy(x => x.LocalDate).ThenBy(x => x.Order).ThenBy(x => x.Sort).ThenBy(x => x.Item.Id)
            .Select(x => x.Item).ToArray();
        return new(fromDate, toDate, all.Skip(offset).Take(limit).ToArray(), offset, limit, all.Length);
    }
}

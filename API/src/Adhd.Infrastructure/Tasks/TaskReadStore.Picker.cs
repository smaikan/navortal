using System.Data;
using Adhd.Application.Common;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Tasks;

public sealed partial class TaskReadStore
{
    public async Task<TaskPickerView> PickerAsync(Guid userId, DateOnly? date, string? search, int offset, int assignedOffset, int limit, CancellationToken ct)
    {
        if (offset is < 0 or > 100000 || assignedOffset is < 0 or > 100000 || limit is < 1 or > 100 || search?.Length > 200 || date?.Year is < 2 or > 9998)
            throw new UseCaseException(ErrorKind.Validation, "task_picker_invalid", "Görev arama filtresi geçersiz.");
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var state = await db.PlanningStates.AsNoTracking().SingleAsync(x => x.UserId == userId, ct);
        var term = search?.Trim() ?? "";
        var eligible = db.Tasks.AsNoTracking().Where(x => x.UserId == userId && x.DeletedAt == null && x.ArchivedAt == null
            && x.HasDirectWork && !x.DirectWorkCompleted && (x.State == TaskState.Pending || x.State == TaskState.InProgress || x.State == TaskState.Paused));
        var exact = term.Length > 0 && await eligible.AnyAsync(x => EF.Functions.Collate(x.Title, "adhd_search").ToLower() == EF.Functions.Collate(term, "adhd_search").ToLower(), ct);
        var rows = from t in eligible
                   join p in db.Tasks.AsNoTracking().Where(x => x.UserId == userId && x.DeletedAt == null) on t.ParentTaskId equals (Guid?)p.Id into parents
                   from parent in parents.DefaultIfEmpty()
                   where term == "" || EF.Functions.Collate(t.Title, "adhd_search").ToLower().Contains(EF.Functions.Collate(term, "adhd_search").ToLower())
                       || (parent != null && EF.Functions.Collate(parent.Title, "adhd_search").ToLower().Contains(EF.Functions.Collate(term, "adhd_search").ToLower()))
                   select new { Task = t, Parent = parent, Assigned = date != null && t.PlannedFrom <= date && t.PlannedTo >= date };
        var assigned = rows.Where(x => x.Assigned);
        var other = rows.Where(x => !x.Assigned);
        var assignedTotal = await assigned.CountAsync(ct); var otherTotal = await other.CountAsync(ct);
        var a = await assigned.OrderBy(x => x.Task.Title).ThenBy(x => x.Task.Id).Skip(assignedOffset).Take(limit)
            .Select(x => new TaskPickerRow(x.Task.Id, x.Task.Title, x.Task.ParentTaskId, x.Parent == null ? null : x.Parent.Title, x.Task.DirectEstimatedSeconds, x.Task.Priority, x.Task.EnergyDemand)).ToArrayAsync(ct);
        var b = await other.OrderBy(x => x.Task.Title).ThenBy(x => x.Task.Id).Skip(offset).Take(limit)
            .Select(x => new TaskPickerRow(x.Task.Id, x.Task.Title, x.Task.ParentTaskId, x.Parent == null ? null : x.Parent.Title, x.Task.DirectEstimatedSeconds, x.Task.Priority, x.Task.EnergyDemand)).ToArrayAsync(ct);
        await tx.CommitAsync(ct);
        return new(new(a, assignedOffset, limit, assignedTotal), new(b, offset, limit, otherTotal), exact, new(new(state.PlanningVersion, state.NotesVersion, state.SpecialDaysVersion), clock.GetUtcNow()));
    }
}

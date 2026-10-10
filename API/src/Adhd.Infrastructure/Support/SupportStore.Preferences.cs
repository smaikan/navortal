using Adhd.Application.Support;
using Adhd.Application.Tasks;
using Adhd.Domain.Support;
using Adhd.Infrastructure.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Support;

public sealed partial class SupportStore
{
    public async Task<SupportDayView> DayAsync(Guid userId, DateOnly date, SupportDayChange? change, CancellationToken ct)
    {
        Date(date); if (change is not null && (change.Version < 0 || change.AvailableEnergy.HasValue && !Enum.IsDefined(change.AvailableEnergy.Value) || change.CriticalTaskIds is null || change.CriticalTaskIds.Length > 3 || change.CriticalTaskIds.Distinct().Count() != change.CriticalTaskIds.Length)) throw Invalid("support_day_invalid", "En çok3 benzersiz kritik iş ve geçerli efor seçin.");
        await using var tx = await db.Database.BeginTransactionAsync(change is null ? System.Data.IsolationLevel.RepeatableRead : System.Data.IsolationLevel.ReadCommitted, ct);
        var state = change is null ? await db.PlanningStates.AsNoTracking().SingleAsync(x => x.UserId == userId, ct) : await Lock(userId, ct);
        var prefs = await preferences.ReadAsync(userId, ct); var day = await db.SupportDays.SingleOrDefaultAsync(x => x.UserId == userId && x.LocalDate == date, ct);
        if (change is not null)
        {
            Check(day?.Version ?? 0, change.Version);
            if (await db.Tasks.CountAsync(x => x.UserId == userId && change.CriticalTaskIds.Contains(x.Id) && x.ArchivedAt == null, ct) != change.CriticalTaskIds.Length) throw Missing("task_not_found");
            if (day is null)
            {
                day = new() { UserId = userId, LocalDate = date, TimeZoneId = await db.DailyPlans.Where(x => x.UserId == userId && x.LocalDate == date).Select(x => x.TimeZoneId).SingleOrDefaultAsync(ct) ?? prefs.Values.TimeZoneId }; db.SupportDays.Add(day);
            }
            else day.Version++;
            day.AvailableEnergy = change.AvailableEnergy;
            await db.CriticalTasks.Where(x => x.UserId == userId && x.LocalDate == date).ExecuteDeleteAsync(ct);
            db.CriticalTasks.AddRange(change.CriticalTaskIds.Select((id, i) => new DailyCriticalTask { UserId = userId, LocalDate = date, TaskId = id, Slot = i + 1 }));
            state.PlanningVersion++; state.UpdatedAt = clock.GetUtcNow(); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        }
        var ids = change?.CriticalTaskIds ?? await db.CriticalTasks.AsNoTracking().Where(x => x.UserId == userId && x.LocalDate == date).OrderBy(x => x.Slot).Select(x => x.TaskId).ToArrayAsync(ct);
        return new(date, day?.TimeZoneId ?? prefs.Values.TimeZoneId, day?.AvailableEnergy, ids, day?.Version ?? 0, state.PlanningVersion, prefs.Values.SupportEnabled);
    }
    public async Task<TaskView> EnergyAsync(Guid userId, Guid taskId, long version, EnergyLevel? energy, CancellationToken ct)
    {
        if (energy.HasValue && !Enum.IsDefined(energy.Value)) throw Invalid("energy_invalid", "Efor Low/Medium/High veya boş olmalı.");
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct); var task = await Task(userId, taskId, ct); Check(task.Version, version);
        if (task.ArchivedAt.HasValue) throw Conflict("task_archived", "Arşivdeki işin efor tercihi değiştirilemez.");
        var before = TaskStore.View(task); task.EnergyDemand = energy; task.Version++; task.UpdatedAt = clock.GetUtcNow(); TaskHistory.Append(db, task, "EnergyChanged", before);
        state.PlanningVersion++; state.UpdatedAt = task.UpdatedAt; await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return TaskStore.View(task);
    }
}

using System.Data;
using Adhd.Application.Planning;
using Adhd.Application.Support;
using Adhd.Domain.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Planning;

public sealed partial class PlanningStore : IDayOverviewStore
{
    public async Task<DayOverviewView> OverviewAsync(Guid userId, DateOnly date, int scheduleOffset,
        int scheduleLimit, int itemOffset, int itemLimit, CancellationToken ct)
    {
        ValidateDate(date);
        if (scheduleOffset is < 0 or > 100000 || itemOffset is < 0 or > 100000
            || scheduleLimit is < 1 or > 100 || itemLimit is < 1 or > 100)
            throw Invalid("pagination_invalid", "Offset0..100000 ve limit1..100 olmalı.");
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var state = await db.PlanningStates.AsNoTracking().SingleAsync(x => x.UserId == userId, ct);
        var prefs = (await preferences.ReadAsync(userId, ct)).Values;
        var plan = await db.DailyPlans.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.LocalDate == date, ct);
        var day = plan is null ? new DailyPlanView(null, date, prefs.TimeZoneId, null, null, 0, state.PlanningVersion)
            : new(plan.Id, date, plan.TimeZoneId, plan.CurrentRevisionId, plan.BaselineRevisionId, plan.Version, state.PlanningVersion);
        var from = PlanTime.DayStart(date, day.TimeZoneId); var to = PlanTime.DayStart(date.AddDays(1), day.TimeZoneId);
        var query = db.TaskSchedules.AsNoTracking().Where(x => x.UserId == userId
            && x.DailyPlanId == day.Id && x.State == ScheduleState.Planned);
        var total = await query.CountAsync(ct);
        var schedules = await query.OrderBy(x => x.StartsAt).ThenBy(x => x.Id).Skip(scheduleOffset).Take(scheduleLimit).ToArrayAsync(ct);
        var items = await DayItemsAsync(userId, date, itemOffset, itemLimit, ct);
        var summary = await glance.ReadInSnapshotAsync(userId, date, prefs, plan, state.PlanningVersion, clock.GetUtcNow(), ct);
        var support = await db.SupportDays.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.LocalDate == date, ct);
        var critical = await db.CriticalTasks.AsNoTracking().Where(x => x.UserId == userId && x.LocalDate == date)
            .OrderBy(x => x.Slot).Select(x => x.TaskId).ToArrayAsync(ct);
        var supportView = new SupportDayView(date, support?.TimeZoneId ?? prefs.TimeZoneId, support?.AvailableEnergy,
            critical, support?.Version ?? 0, state.PlanningVersion, prefs.SupportEnabled);
        var visibleTaskIds = schedules.Where(x => x.TaskId.HasValue).Select(x => x.TaskId!.Value)
            .Concat(items.Items.Select(x => x.TaskId)).Distinct().ToArray();
        var recurringTaskIds = await db.RecurrenceOccurrences.AsNoTracking()
            .Where(x => x.UserId == userId && x.TaskId.HasValue && visibleTaskIds.Contains(x.TaskId.Value))
            .Select(x => x.TaskId!.Value).Distinct().OrderBy(x => x).ToArrayAsync(ct);
        return new(day, from, to, new(schedules.Select(RevisionWriter.View).ToArray(), scheduleOffset, scheduleLimit, total),
            items, summary, supportView, new(state.PlanningVersion, state.NotesVersion, state.SpecialDaysVersion), recurringTaskIds);
    }
}

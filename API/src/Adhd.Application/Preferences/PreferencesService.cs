using Adhd.Application.Common;
using Adhd.Domain.Preferences;

namespace Adhd.Application.Preferences;

public sealed record PreferencesSnapshot(long Version, PlanningPreferences Values);
public sealed record WorkingDay(DateOnly Date, string TimeZoneId, MinuteRange[] LocalIntervals, UtcWindow[] UtcIntervals);
public interface IPreferencesStore
{
    Task<PreferencesSnapshot> ReadAsync(Guid userId, CancellationToken ct);
    Task<PreferencesSnapshot> WriteAsync(Guid userId, long expectedVersion, PlanningPreferences values, CancellationToken ct);
}
public sealed class PreferencesService(IPreferencesStore store)
{
    public Task<PreferencesSnapshot> ReadAsync(Guid userId, CancellationToken ct) => store.ReadAsync(userId, ct);
    public Task<PreferencesSnapshot> WriteAsync(Guid userId, long expectedVersion, PlanningPreferences values, CancellationToken ct)
    {
        var error = WorkingCalendar.Validate(values);
        if (error is not null) throw new UseCaseException(ErrorKind.Validation, "preferences_invalid", error);
        return store.WriteAsync(userId, expectedVersion, values, ct);
    }
    public async Task<WorkingDay> DayAsync(Guid userId, DateOnly date, CancellationToken ct)
    {
        if (date.Year is < 2 or > 9998)
            throw new UseCaseException(ErrorKind.Validation, "date_out_of_range", "Tarih desteklenen aralık dışında.");
        var p = (await store.ReadAsync(userId, ct)).Values;
        return new(date, p.TimeZoneId, WorkingCalendar.LocalIntervals(p, date), WorkingCalendar.UtcIntervals(p, date));
    }
}

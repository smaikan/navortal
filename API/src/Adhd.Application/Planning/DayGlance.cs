using Adhd.Application.Common;
using Adhd.Domain.Preferences;
using Adhd.Domain.Support;

namespace Adhd.Application.Planning;

// Gün çubuğunun sürelerini sunucuda hesapla. Bilinmeyen tahminin sayısını tut, sıfır sayma.
public sealed record DayGlanceView(DateOnly LocalDate, decimal WorkingRemainingSeconds, decimal PlannedRemainingSeconds, int UnknownEstimateCount,
    int CompletedItemCount, int OpenItemCount, decimal ActualSeconds, bool OverCapacity, DayGlanceHint[] Hints, long PlanningVersion, DateTimeOffset ServerNow, int UnboundedItemCount = 0);
// Her görev için eforu ve son adım notunu tek toplu okumada al.
public sealed record DayGlanceHint(Guid TaskId, EnergyLevel? EnergyDemand, DayGlanceNextStep? NextStep, Adhd.Domain.Tasks.TaskPriority? Priority = null);
public sealed record DayGlanceNextStep(Guid NoteId, string Text);
public interface IDayGlanceStore { Task<DayGlanceView> ReadAsync(Guid userId, DateOnly date, CancellationToken ct); }
public sealed class DayGlanceService(IDayGlanceStore store)
{
    public Task<DayGlanceView> ReadAsync(Guid userId, DateOnly date, CancellationToken ct)
    {
        if (date.Year is < 2 or > 9998) throw new UseCaseException(ErrorKind.Validation, "date_invalid", "Geçerli plan günü girin.");
        return store.ReadAsync(userId, date, ct);
    }
}
// Çalışma dışı özel günü uygula. Ayarlarda o tarihe özel aralık varsa o öncelikli.
public interface IWorkingDayCalendar
{
    Task<UtcWindow[]> UtcIntervalsAsync(Guid userId, PlanningPreferences preferences, DateOnly date, CancellationToken ct);
}

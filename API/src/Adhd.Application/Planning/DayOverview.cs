using Adhd.Application.Support;
using Adhd.Application.Sync;

namespace Adhd.Application.Planning;

// Tek hesap görüntüsünden sınırlı ilk sayfalar ve bütün günün yetkili toplamları.
public sealed record DayOverviewView(DailyPlanView Day, DateTimeOffset WindowStartsAt, DateTimeOffset WindowEndsAt,
    SchedulePage Timed, DayItemPage Untimed, DayGlanceView Glance, SupportDayView Support, DayReadVersions Versions, Guid[] RecurringTaskIds);

public interface IDayOverviewStore
{
    Task<DayOverviewView> OverviewAsync(Guid userId, DateOnly date, int scheduleOffset, int scheduleLimit,
        int itemOffset, int itemLimit, CancellationToken ct);
}

using Adhd.Domain.Recurrence;
using Adhd.Domain.Tasks;

namespace Adhd.Domain.Analytics;

public enum RecurrenceDayClass { OnTime, Late, NotDone, TodayPending, Skipped, NotGenerated }

// Bir rutin gününün analiz sınıfı. Oranın payı ve paydası bu sınıflardan çıkar.
public static class RecurrenceDayRules
{
    // Az örnekle yüzde gösterilmez. Tahmin isabetiyle aynı sınır.
    public const int MinimumSamples = 3;

    // current: Görevin bugünkü durumu. Görev silindiyse veya hiç yoksa
    // null. completedByDayEnd: Görev, oluşum gününün sonunda tamamlanmış durumdaydı.
    public static RecurrenceDayClass Classify(OccurrenceState state, string? reason, TaskState? current, bool completedByDayEnd, DateOnly date, DateOnly today)
    {
        // Kullanıcı kapattıysa atlandı say. Sistem kapattıysa ortada görünen bir görev yoktu.
        if (state == OccurrenceState.Canceled) return RecurrenceDayClass.Skipped;
        if (state == OccurrenceState.Skipped) return reason is null or OccurrenceReason.User ? RecurrenceDayClass.Skipped : RecurrenceDayClass.NotGenerated;
        if (completedByDayEnd) return RecurrenceDayClass.OnTime;
        if (current is null or TaskState.Skipped or TaskState.Canceled) return RecurrenceDayClass.Skipped;
        if (current == TaskState.Completed) return RecurrenceDayClass.Late;
        return date < today ? RecurrenceDayClass.NotDone : RecurrenceDayClass.TodayPending;
    }

    public static bool Completed(RecurrenceDayClass value) => value is RecurrenceDayClass.OnTime or RecurrenceDayClass.Late;

    // Üst üste yapılan en uzun görev dizisi. Atlanan ve oluşmayan günler diziyi kesmez.
    public static int LongestRun(IEnumerable<RecurrenceDayClass> ordered)
    {
        int best = 0, run = 0;
        foreach (var value in ordered)
        {
            if (Completed(value)) best = Math.Max(best, ++run);
            else if (value == RecurrenceDayClass.NotDone) run = 0;
        }
        return best;
    }
}

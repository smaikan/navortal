using Adhd.Application.Focus;
using Adhd.Application.Work;
using Adhd.Domain.Jobs;

namespace Adhd.Application.Planning;

public sealed record NotificationReceiptView(Guid Id, string Kind, Guid SourceId, DateTimeOffset? ReadAt,
    NotificationIntentState State, int SnoozeCount);
public sealed record RunningTaskContext(Guid TaskId, bool HasDirectWork, long? DirectEstimatedSeconds);
public sealed record DaySignalsView(DateOnly LocalDate, DateTimeOffset ServerNow, int ReturnThresholdSeconds,
    NotificationReceiptView[] Notifications, bool Complete, WorkView? LastWork, bool FocusIncluded,
    FocusView? Focus, Guid? RunningWorkSessionId, RunningTaskContext? RunningTask);
public interface IDaySignalsStore
{
    Task<DaySignalsView> SignalsAsync(Guid userId, DateOnly date, bool observeFocus, CancellationToken ct);
}

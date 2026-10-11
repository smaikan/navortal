namespace Adhd.Application.Planning;

// Seçili saatleri boşalt ve mevcut görevleri ileri güne saatsiz ekle.
public sealed record DeferDaySelection(DateOnly TargetDate, DayItemMoveEntry[] Schedules, DayItemMoveEntry[] Items,
    long ExpectedPlanningVersion, bool AllowProtectedChange, string? Reason);
public sealed record DayDeferralTask(Guid TaskId, string Title, bool AlreadyPlanned);
public sealed record DayDeferralIssue(string Code, string Message);
public sealed record DayDeferralPreview(DateOnly SourceDate, DateOnly TargetDate, long PlanningVersion,
    ScheduleView[] Schedules, DayItemView[] Items, DayDeferralTask[] Tasks, DayDeferralIssue[] Issues, bool CanApply);
public sealed record DayDeferralResult(Guid ChangeSetId, long PlanningVersion, ScheduleView[] Schedules,
    DayItemView[] Items, Guid[] RevisionIds);
public sealed record DayDeferralOutcome(DayDeferralResult Values, bool Replayed);
public sealed record DeferTaskTarget(Guid TaskId, DateOnly TargetDate);
public sealed record DeferTasksSelection(DeferTaskTarget[] Tasks, long ExpectedPlanningVersion);

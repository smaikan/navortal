using System.Collections.Immutable;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;

namespace Adhd.Domain.Scheduling;

public sealed record SchedulingTask(Guid Id, Guid? ParentTaskId = null, bool RequiredForParent = true,
    bool HasDirectWork = true, bool DirectWorkCompleted = false, TaskState State = TaskState.Pending,
    long? EstimatedSeconds = null, decimal ActualSeconds = 0, decimal OutsideReservedSeconds = 0,
    DateTimeOffset? OutsideCompletionAt = null, TaskPriority Priority = TaskPriority.Normal,
    DateTimeOffset? DeadlineAt = null, decimal SortOrder = 0, bool IsCritical = false, bool CanSplit = true, bool IsArchived = false, Adhd.Domain.Support.EnergyLevel? EnergyDemand = null);
public sealed record SchedulingDependency(Guid PredecessorId, Guid SuccessorId);
public sealed record SchedulingOrder(Guid BeforeId, Guid AfterId);
public sealed record SchedulingWindow(DateTimeOffset StartsAt, DateTimeOffset EndsAt);
public sealed record SchedulingBlock(Guid? ExistingScheduleId, Guid? TaskId, ScheduleKind Kind,
    DateTimeOffset StartsAt, DateTimeOffset EndsAt, bool IsFixed = false, bool IsLocked = false, bool IsActive = false, bool IsPreserved = false, bool IsAutomatic = false);
public sealed record SchedulingPolicy(int MinimumSplitSeconds = 900, int TransitionSeconds = 0, bool EnableSplitting = true, bool PreserveExisting = true);
public sealed record SchedulingSnapshot(DateOnly LocalDate, string TimeZoneId, DateTimeOffset ServerNow, long PlanningVersion,
    ImmutableArray<SchedulingTask> Tasks, ImmutableArray<SchedulingDependency> Dependencies,
    ImmutableArray<SchedulingOrder> Ordering, ImmutableArray<SchedulingWindow> WorkingWindows, ImmutableArray<SchedulingBlock> ExistingBlocks, SchedulingPolicy? Policy = null,
    ImmutableArray<SchedulingWindow>? ExternalBusyWindows = null, ImmutableArray<SchedulingBlock>? ExternalWorkBlocks = null, Adhd.Domain.Support.EnergyLevel? AvailableEnergy = null);
public enum SchedulingIntentKind { DayReplan }
public sealed record SchedulingIntent(ImmutableArray<Guid> TaskIds, SchedulingIntentKind Kind = SchedulingIntentKind.DayReplan, DateTimeOffset? NewWorkNotBefore = null);
public enum UnplacedReason { NoEstimate, NeedsEstimateExtension, TaskInactive, DependencyBlocked, NoWorkingHours, InsufficientCapacity, NoContiguousSlot, DeadlineRisk, MinimumSplitConstraint, ActiveReservationTooShort }
public sealed record UnplacedWork(Guid TaskId, decimal? RemainingSeconds, UnplacedReason Reason);
public sealed record SchedulingMessage(string Code, Guid? TaskId = null, decimal? Seconds = null, Guid? ScheduleId = null);
public sealed record SchedulingProposal(DateOnly LocalDate, long InputPlanningVersion, DateTimeOffset AnchorAt, string AlgorithmVersion,
    ImmutableArray<SchedulingBlock> Blocks, ImmutableArray<UnplacedWork> Unplaced,
    ImmutableArray<SchedulingMessage> Warnings, ImmutableArray<SchedulingMessage> Explanations, bool HasConstraintConflicts);

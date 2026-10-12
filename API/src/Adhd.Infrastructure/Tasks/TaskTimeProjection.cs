using Adhd.Application.Common;
using Adhd.Application.Work;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;

namespace Adhd.Infrastructure.Tasks;

internal static class TaskTimeProjection
{
    internal static TaskTimeView Calculate(Guid taskId,TaskItem[] tasks,IEnumerable<(Guid TaskId,WorkSessionSegment Segment)> segments,DateTimeOffset now)
    {
        var grouped = segments.ToLookup(x => x.TaskId, x => x.Segment);
        decimal total = 0, direct = 0, remaining = 0, overtime = 0; var unknown = 0; var unknownRemaining = 0;
        foreach (var task in tasks)
        {
            var actual = Measure(grouped[task.Id], now); total += actual; if (task.Id == taskId) direct = actual;
            if (!task.HasDirectWork) continue;
            if (task.DirectEstimatedSeconds is { } estimate) overtime += Math.Max(0, actual - estimate); else unknown++;
            if (task.ArchivedAt is not null || task.DirectWorkCompleted || task.State is not (TaskState.Pending or TaskState.InProgress or TaskState.Paused)) continue;
            if (task.DirectEstimatedSeconds is { } known) remaining += Math.Max(0, known - actual); else unknownRemaining++;
        }
        return new(taskId, direct, total, remaining, unknownRemaining, unknownRemaining == 0 ? remaining : null, overtime, unknown, now);
    }
    private static decimal Measure(IEnumerable<WorkSessionSegment> segments,DateTimeOffset now)
    {
        try { return WorkTime.Seconds(segments,now); }
        catch(ArgumentOutOfRangeException) { throw new UseCaseException(ErrorKind.Conflict,"server_clock_conflict","Sunucu zamanı önceki kayıttan geride; tekrar deneyin."); }
    }
}

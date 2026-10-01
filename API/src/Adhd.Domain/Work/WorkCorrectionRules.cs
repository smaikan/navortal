namespace Adhd.Domain.Work;

public static class WorkCorrectionRules
{
    public static bool IsValidRange(DateTimeOffset start, DateTimeOffset? end, DateTimeOffset now, bool voided) =>
        start.Year is >= 2 and <= 9998 && start <= now && (end is null || (end >= start && end <= now)) && (!voided || end.HasValue);

    public static void UpdateEnvelope(WorkSession session, IReadOnlyCollection<WorkSessionSegment> segments)
    {
        if (segments.Count == 0) throw new ArgumentException("A session needs at least one segment.", nameof(segments));
        var effective = segments.Where(x => !x.IsVoided).ToArray();
        var envelope = effective.Length == 0 ? segments.ToArray() : effective;
        session.StartedAt = envelope.Min(x => x.StartedAt);
        if (session.State == WorkState.Running && !effective.Any(x => x.EndedAt is null)) session.State = WorkState.Finished;
        session.EndedAt = session.State is WorkState.Finished or WorkState.Canceled
            ? envelope.Max(x => x.EndedAt ?? throw new ArgumentException("A closed session cannot have an open segment.", nameof(segments))) : null;
    }
}

namespace Adhd.Domain.Planning;

public sealed record PlanDayPart(DateOnly LocalDate, DateTimeOffset StartsAt, DateTimeOffset EndsAt);
public static class PlanTime
{
    public static DateOnly Date(DateTimeOffset instant, string zone) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, TimeZoneInfo.FindSystemTimeZoneById(zone)).DateTime);
    public static DateTimeOffset DayStart(DateOnly date, string zoneId)
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById(zoneId); var local = date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        while (zone.IsInvalidTime(local)) local = local.AddMinutes(1);
        var offset = zone.IsAmbiguousTime(local) ? zone.GetAmbiguousTimeOffsets(local).Max() : zone.GetUtcOffset(local);
        return new DateTimeOffset(local, offset).ToUniversalTime();
    }
    public static PlanDayPart[] Split(DateTimeOffset start, DateTimeOffset end, string zone)
    {
        if (start.Year is < 2 or > 9998 || end.Year is < 2 or > 9998 || start >= end || end - start > TimeSpan.FromDays(7))
            throw new ArgumentOutOfRangeException(nameof(end));
        start = start.ToUniversalTime(); end = end.ToUniversalTime(); var result = new List<PlanDayPart>();
        while (start < end)
        {
            var date = Date(start, zone); var boundary = DayStart(date.AddDays(1), zone);
            var finish = end < boundary ? end : boundary;
            if (finish <= start) throw new ArgumentException("Invalid local day boundary.", nameof(zone));
            result.Add(new(date, start, finish)); start = finish;
        }
        return result.ToArray();
    }
    public static bool Overlaps(DateTimeOffset start, DateTimeOffset end, DateTimeOffset otherStart, DateTimeOffset otherEnd) => start < otherEnd && otherStart < end;
}

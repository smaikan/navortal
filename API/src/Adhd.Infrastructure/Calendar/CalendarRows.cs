using System.Text.Json;
using Adhd.Application.Calendar;
using Adhd.Application.Common;
using Adhd.Application.Preferences;
using Adhd.Domain.Planning;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace Adhd.Infrastructure.Calendar;

internal sealed class PlanCalendarRollup
{
    public Guid PlanId { get; set; }
    public decimal Work { get; set; }
    public decimal Break { get; set; }
    public decimal Buffer { get; set; }
    public decimal Baseline { get; set; }
    public int Blocks { get; set; }
}
internal sealed class ActualCalendarRollup
{
    public DateOnly LocalDate { get; set; }
    public decimal Seconds { get; set; }
    public int Segments { get; set; }
    public bool Open { get; set; }
    public bool ClockConflict { get; set; }
}
internal sealed class CompletionCalendarRollup { public DateOnly LocalDate { get; set; } public int Tasks { get; set; } }
internal sealed class CalendarActualRow
{
    public Guid SessionId { get; set; }
    public Guid SegmentId { get; set; }
    public Guid? TaskId { get; set; }
    public string TimeZoneId { get; set; } = "";
    public DateTimeOffset StartsAt { get; set; }
    public DateTimeOffset EndsAt { get; set; }
    public DateTimeOffset SourceStartedAt { get; set; }
    public DateTimeOffset? SourceEndedAt { get; set; }
    public bool Running { get; set; }
    public string? Snapshot { get; set; }
}
internal sealed class CalendarCompletionRow
{
    public Guid Id { get; set; }
    public Guid TaskId { get; set; }
    public DateTimeOffset EffectiveAt { get; set; }
    public string TimeZoneId { get; set; } = "";
    public string? Title { get; set; }
    public Guid? ParentTaskId { get; set; }
    public long Sequence { get; set; }
}
internal sealed class CalendarHistoryRow
{
    public Guid TaskId { get; set; }
    public string Zone { get; set; } = "";
    public string? State { get; set; }
    public long? Sequence { get; set; }
    public DateTimeOffset? EffectiveAt { get; set; }
}
internal sealed record CalendarContext(CalendarRangeView Range, CalendarDateWindow[] Windows, DailyPlan[] Plans);

public sealed partial class CalendarStore(PlannerDbContext db, IPreferencesStore preferences, TimeProvider clock) : ICalendarStore
{
    private const string WindowsSql = """
        WITH days AS (SELECT * FROM unnest(@zones::text[],@dates::date[],@starts::timestamptz[],@ends::timestamptz[]) AS d("Zone","Date","Start","End"))
        """;
    private const string CompletionTransition = " " + """
        COALESCE(e."Payload"->'after'->>'State',e."Payload"->'after'->>'state')='Completed'
        AND COALESCE(e."Payload"->'before'->>'State',e."Payload"->'before'->>'state','')<>'Completed'
        """;
    private static object[] Parameters(Guid userId, CalendarDateWindow[] windows, DateTimeOffset now, int? offset = null, int? limit = null)
    {
        var items = new List<object> { new NpgsqlParameter("user", userId), new NpgsqlParameter("now", now),
            new NpgsqlParameter("zones", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = windows.Select(x => x.TimeZoneId).ToArray() },
            new NpgsqlParameter("dates", NpgsqlDbType.Array | NpgsqlDbType.Date) { Value = windows.Select(x => x.LocalDate).ToArray() },
            new NpgsqlParameter("starts", NpgsqlDbType.Array | NpgsqlDbType.TimestampTz) { Value = windows.Select(x => x.StartsAt).ToArray() },
            new NpgsqlParameter("ends", NpgsqlDbType.Array | NpgsqlDbType.TimestampTz) { Value = windows.Select(x => x.EndsAt).ToArray() } };
        if (offset.HasValue) items.Add(new NpgsqlParameter("offset", offset.Value)); if (limit.HasValue) items.Add(new NpgsqlParameter("limit", limit.Value)); return items.ToArray();
    }
    private static void Validate(DateOnly from, DateOnly to)
    {
        if (from.Year is < 2 or > 9998 || to.Year is < 2 or > 9998 || to.DayNumber - from.DayNumber is < 0 or > 41)
            throw new UseCaseException(ErrorKind.Validation, "calendar_range_invalid", "1–42 günlük açık tarih aralığı seçin.");
    }
    private static T? Read<T>(string? json) => json is null ? default : JsonSerializer.Deserialize<T>(json, RevisionWriter.Json);
}

using System.Data;
using Adhd.Application.Calendar;
using Adhd.Application.Common;
using Adhd.Domain.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Calendar;

public sealed partial class CalendarStore
{
    public async Task<CalendarRangeView> RangeAsync(Guid userId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        Validate(from, to); await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct); return (await Context(userId, from, to, ct)).Range;
    }
    private async Task<CalendarContext> Context(Guid userId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var version = await db.PlanningStates.AsNoTracking().Where(x => x.UserId == userId).Select(x => x.PlanningVersion).SingleAsync(ct); var now = clock.GetUtcNow();
        var prefs = await preferences.ReadAsync(userId, ct); var plans = await db.DailyPlans.AsNoTracking().Where(x => x.UserId == userId && x.LocalDate >= from && x.LocalDate <= to).ToArrayAsync(ct);
        var outerStart = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)).AddDays(-1); var outerEnd = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)).AddDays(1);
        var workZones = from s in db.WorkSegments.AsNoTracking() join w in db.WorkSessions.AsNoTracking() on new { s.UserId, Id = s.SessionId } equals new { w.UserId, w.Id }
            where s.UserId == userId && !s.IsVoided && s.StartedAt < outerEnd && (s.EndedAt ?? now) > outerStart select w.TimeZoneId;
        var eventZones = db.TaskEvents.AsNoTracking().Where(x => x.UserId == userId && x.TimeZoneId != null && x.EffectiveAt >= outerStart && x.EffectiveAt < outerEnd).Select(x => x.TimeZoneId!);
        var zones = (await workZones.Concat(eventZones).Distinct().ToArrayAsync(ct)).Concat(plans.Select(x => x.TimeZoneId)).Append(prefs.Values.TimeZoneId).Distinct().ToArray();
        CalendarDateWindow[] windows;
        try { windows = CalendarTime.Windows(from, to, zones); } catch (TimeZoneNotFoundException) { throw new UseCaseException(ErrorKind.Conflict, "historical_zone_unavailable", "Tarihsel saat dilimi bu ortamda bulunamıyor."); }
        var planRows = await db.Database.SqlQuery<PlanCalendarRollup>($"""
            SELECT p."Id" AS "PlanId", COALESCE(c.work,0)::numeric AS "Work",COALESCE(c.break,0)::numeric AS "Break",COALESCE(c.buffer,0)::numeric AS "Buffer",COALESCE(c.blocks,0)::int AS "Blocks",COALESCE(b.work,0)::numeric AS "Baseline"
            FROM daily_plans p
            LEFT JOIN LATERAL (SELECT SUM(EXTRACT(EPOCH FROM (s."EndsAt"-s."StartsAt"))) FILTER(WHERE s."Kind"='Work') AS work,
                SUM(EXTRACT(EPOCH FROM (s."EndsAt"-s."StartsAt"))) FILTER(WHERE s."Kind"='Break') AS break,
                SUM(EXTRACT(EPOCH FROM (s."EndsAt"-s."StartsAt"))) FILTER(WHERE s."Kind"='Buffer') AS buffer,COUNT(*) AS blocks
                FROM task_schedules s WHERE s."UserId"=p."UserId" AND s."DailyPlanId"=p."Id" AND s."State"='Planned') c ON true
            LEFT JOIN LATERAL (SELECT SUM(EXTRACT(EPOCH FROM ((i."Snapshot"->>'endsAt')::timestamptz-(i."Snapshot"->>'startsAt')::timestamptz))) AS work
                FROM plan_revision_items i WHERE i."UserId"=p."UserId" AND i."RevisionId"=p."BaselineRevisionId" AND i."Snapshot"->>'kind'='Work') b ON true
            WHERE p."UserId"={userId} AND p."LocalDate">={from} AND p."LocalDate"<={to}
            """).ToArrayAsync(ct);
        var actual = await db.Database.SqlQueryRaw<ActualCalendarRollup>(WindowsSql + """
            SELECT d."Date" AS "LocalDate",SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(s."EndedAt",@now),d."End")-GREATEST(s."StartedAt",d."Start"))))::numeric AS "Seconds",
                COUNT(DISTINCT s."Id")::int AS "Segments",bool_or(s."EndedAt" IS NULL AND @now<d."End") AS "Open",
                bool_or(COALESCE(s."EndedAt",@now)<s."StartedAt" OR COALESCE(s."EndedAt">@now,false)) AS "ClockConflict"
            FROM days d JOIN work_sessions w ON w."UserId"=@user AND w."TimeZoneId"=d."Zone"
            JOIN work_session_segments s ON s."UserId"=w."UserId" AND s."SessionId"=w."Id" AND NOT s."IsVoided"
                AND s."StartedAt"<d."End" AND COALESCE(s."EndedAt",@now)>d."Start"
            GROUP BY d."Date"
            """, Parameters(userId, windows, now)).ToArrayAsync(ct);
        if (actual.Any(x => x.ClockConflict || x.Seconds < 0)) throw new UseCaseException(ErrorKind.Conflict, "server_clock_conflict", "Sunucu zamanı çalışma kaydından geride.");
        var completed = await db.Database.SqlQueryRaw<CompletionCalendarRollup>(WindowsSql + """
            SELECT d."Date" AS "LocalDate",COUNT(DISTINCT e."TaskId")::int AS "Tasks" FROM days d JOIN task_events e
                ON e."UserId"=@user AND e."TimeZoneId"=d."Zone" AND e."EffectiveAt">=d."Start" AND e."EffectiveAt"<d."End" AND e."EffectiveAt"<=@now
            WHERE
            """ + CompletionTransition + " GROUP BY d.\"Date\"", Parameters(userId, windows, now)).ToArrayAsync(ct);
        var legacy = await db.Database.SqlQueryRaw<int>("SELECT COUNT(*)::int AS \"Value\" FROM task_events e WHERE e.\"UserId\"=@user AND e.\"TimeZoneId\" IS NULL AND e.\"EffectiveAt\">=@start AND e.\"EffectiveAt\"<@end AND e.\"EffectiveAt\"<=@now AND " + CompletionTransition,
            new Npgsql.NpgsqlParameter("user", userId), new Npgsql.NpgsqlParameter("start", outerStart), new Npgsql.NpgsqlParameter("end", outerEnd), new Npgsql.NpgsqlParameter("now", now)).SingleAsync(ct);
        var result = new List<CalendarDaySummary>();
        for (var date = from; date <= to; date = date.AddDays(1))
        {
            var plan = plans.SingleOrDefault(x => x.LocalDate == date); var p = plan is null ? null : planRows.Single(x => x.PlanId == plan.Id); var a = actual.SingleOrDefault(x => x.LocalDate == date); var c = completed.SingleOrDefault(x => x.LocalDate == date);
            result.Add(new(date, plan?.TimeZoneId ?? prefs.Values.TimeZoneId, plan?.Id, plan?.CurrentRevisionId, plan?.BaselineRevisionId, plan?.Version ?? 0, version,
                p?.Work ?? 0, p?.Break ?? 0, p?.Buffer ?? 0, p?.Baseline ?? 0, p?.Blocks ?? 0, a?.Seconds ?? 0, a?.Segments ?? 0, c?.Tasks ?? 0, a?.Open ?? false));
        }
        return new(new(from, to, now, result.ToArray(), legacy), windows, plans);
    }
}

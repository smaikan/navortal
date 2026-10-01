using System.Data;
using Adhd.Application.Calendar;
using Adhd.Application.Common;
using Adhd.Application.Planning;
using Adhd.Application.Work;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace Adhd.Infrastructure.Calendar;

public sealed partial class CalendarStore
{
    public async Task<CalendarDayView> DayAsync(Guid userId, DateOnly date, CalendarDayQuery query, CancellationToken ct)
    {
        Validate(date, date);
        if (new[] { query.PlanOffset, query.ActualOffset, query.CompletionOffset }.Any(x => x is < 0 or > 100000) ||
            new[] { query.PlanLimit, query.ActualLimit, query.CompletionLimit }.Any(x => x is < 1 or > 100))
            throw new UseCaseException(ErrorKind.Validation, "pagination_invalid", "Offset 0–100000, limit 1–100 olmalı.");
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var context = await Context(userId, date, date, ct); var summary = context.Range.Days[0]; var now = context.Range.ServerNow;
        var revision = query.RevisionId ?? summary.CurrentRevisionId;
        if (query.RevisionId.HasValue && !await db.PlanRevisions.AnyAsync(x => x.UserId == userId && x.Id == revision && x.DailyPlanId == summary.DailyPlanId, ct))
            throw new UseCaseException(ErrorKind.NotFound, "revision_not_found", "Bu güne ait revizyon bulunamadı.");
        var planTotal = revision.HasValue ? await db.PlanRevisionItems.CountAsync(x => x.UserId == userId && x.RevisionId == revision, ct) : 0;
        var planRows = revision.HasValue ? await db.PlanRevisionItems.FromSqlInterpolated($"""
            SELECT * FROM plan_revision_items WHERE "UserId"={userId} AND "RevisionId"={revision.Value}
            ORDER BY ("Snapshot"->>'startsAt')::timestamptz,"Id" OFFSET {query.PlanOffset} LIMIT {query.PlanLimit}
            """).AsNoTracking().ToArrayAsync(ct) : [];
        var plan = planRows.Select(x => (x.Id, Schedule: Read<ScheduleView>(x.Snapshot)!)).ToArray();
        var actual = await db.Database.SqlQueryRaw<CalendarActualRow>(WindowsSql + """
            SELECT w."Id" AS "SessionId",s."Id" AS "SegmentId",w."TaskId",w."TimeZoneId",
                GREATEST(s."StartedAt",d."Start") AS "StartsAt",LEAST(COALESCE(s."EndedAt",@now),d."End") AS "EndsAt",
                s."StartedAt" AS "SourceStartedAt",s."EndedAt" AS "SourceEndedAt",s."EndedAt" IS NULL AS "Running",w."TaskSnapshot"::text AS "Snapshot"
            FROM days d JOIN work_sessions w ON w."UserId"=@user AND w."TimeZoneId"=d."Zone"
            JOIN work_session_segments s ON s."UserId"=w."UserId" AND s."SessionId"=w."Id" AND NOT s."IsVoided"
                AND s."StartedAt"<d."End" AND COALESCE(s."EndedAt",@now)>d."Start"
            ORDER BY "StartsAt",w."Id",s."Id" OFFSET @offset LIMIT @limit
            """, Parameters(userId, context.Windows, now, query.ActualOffset, query.ActualLimit)).ToArrayAsync(ct);
        const string completionSql = WindowsSql + """
            SELECT e."Id",e."TaskId",e."EffectiveAt",e."TimeZoneId",COALESCE(e."Payload"->'after'->>'Title',e."Payload"->'after'->>'title') AS "Title",
                NULLIF(COALESCE(e."Payload"->'after'->>'ParentTaskId',e."Payload"->'after'->>'parentTaskId'),'')::uuid AS "ParentTaskId",e."Sequence"
            FROM days d JOIN task_events e ON e."UserId"=@user AND e."TimeZoneId"=d."Zone"
                AND e."EffectiveAt">=d."Start" AND e."EffectiveAt"<d."End" AND e."EffectiveAt"<=@now WHERE
            """ + CompletionTransition;
        var completionTotal = await db.Database.SqlQueryRaw<int>("SELECT COUNT(*)::int AS \"Value\" FROM (" + completionSql + ") q", Parameters(userId, context.Windows, now)).SingleAsync(ct);
        var completions = await db.Database.SqlQueryRaw<CalendarCompletionRow>(completionSql + " ORDER BY e.\"EffectiveAt\",e.\"TaskId\",e.\"Sequence\" OFFSET @offset LIMIT @limit",
            Parameters(userId, context.Windows, now, query.CompletionOffset, query.CompletionLimit)).ToArrayAsync(ct);
        var keys = plan.Where(x => x.Schedule.TaskId.HasValue).Select(x => (TaskId: x.Schedule.TaskId!.Value, Zone: summary.TimeZoneId))
            .Concat(actual.Where(x => x.TaskId.HasValue).Select(x => (TaskId: x.TaskId!.Value, Zone: x.TimeZoneId))).Distinct().ToArray();
        var history = await HistoricalStates(userId, date, now, keys, ct);
        HistoricalTaskState? State(Guid? id, string zone) => id.HasValue ? history[(id.Value, zone)] : null;
        return new(summary, now,
            new(plan.Select(x => new CalendarPlannedItem(x.Id, x.Schedule, State(x.Schedule.TaskId, summary.TimeZoneId))).ToArray(), query.PlanOffset, query.PlanLimit, planTotal, revision),
            new(actual.Select(x => new CalendarActualItem(x.SessionId, x.SegmentId, x.TaskId, x.TimeZoneId, x.StartsAt, x.EndsAt, x.SourceStartedAt, x.SourceEndedAt,
                CalendarTime.IntersectSeconds(x.StartsAt, x.EndsAt, new(date, x.TimeZoneId, x.StartsAt, x.EndsAt)), x.Running, Read<TaskAtStart>(x.Snapshot), State(x.TaskId, x.TimeZoneId))).ToArray(), query.ActualOffset, query.ActualLimit, summary.ActualSegmentCount),
            new(completions.Select(x => new CalendarCompletionItem(x.Id, x.TaskId, x.EffectiveAt, x.TimeZoneId, x.Title, x.ParentTaskId, x.Sequence)).ToArray(), query.CompletionOffset, query.CompletionLimit, completionTotal), context.Range.LegacyZoneCompletionCount);
    }

    private async Task<Dictionary<(Guid, string), HistoricalTaskState>> HistoricalStates(Guid userId, DateOnly date, DateTimeOffset now, (Guid TaskId, string Zone)[] keys, CancellationToken ct)
    {
        if (keys.Length == 0) return [];
        var ends = keys.Select(x => PlanTime.DayStart(date.AddDays(1), x.Zone)).ToArray();
        var rows = await db.Database.SqlQueryRaw<CalendarHistoryRow>("""
            SELECT k."TaskId",k."Zone",COALESCE(e."Payload"->'after'->>'State',e."Payload"->'after'->>'state') AS "State",e."Sequence",e."EffectiveAt"
            FROM unnest(@tasks::uuid[],@zones::text[],@cutoffs::timestamptz[],@inclusive::boolean[]) AS k("TaskId","Zone","Cutoff","Inclusive")
            LEFT JOIN LATERAL (SELECT * FROM task_events t WHERE t."UserId"=@user AND t."TaskId"=k."TaskId"
                AND (t."EffectiveAt"<k."Cutoff" OR (k."Inclusive" AND t."EffectiveAt"=k."Cutoff")) ORDER BY t."Sequence" DESC LIMIT 1) e ON true
            """, new NpgsqlParameter("user", userId), new NpgsqlParameter("tasks", NpgsqlDbType.Array | NpgsqlDbType.Uuid) { Value = keys.Select(x => x.TaskId).ToArray() },
            new NpgsqlParameter("zones", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = keys.Select(x => x.Zone).ToArray() },
            new NpgsqlParameter("cutoffs", NpgsqlDbType.Array | NpgsqlDbType.TimestampTz) { Value = ends.Select(x => now < x ? now : x).ToArray() },
            new NpgsqlParameter("inclusive", NpgsqlDbType.Array | NpgsqlDbType.Boolean) { Value = ends.Select(x => now < x).ToArray() }).ToArrayAsync(ct);
        return rows.ToDictionary(x => (x.TaskId, x.Zone), x =>
        {
            var known = Enum.TryParse<TaskState>(x.State, out var value);
            return new HistoricalTaskState(x.TaskId, known ? value : null, x.Sequence, x.EffectiveAt, known);
        });
    }
}

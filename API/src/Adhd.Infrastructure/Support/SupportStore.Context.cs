using Adhd.Application.Support;
using Adhd.Domain.Planning;
using Adhd.Domain.Support;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Tasks;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace Adhd.Infrastructure.Support;

internal sealed class CompletionContextRow { public Guid TaskId { get; set; } public DateTimeOffset EffectiveAt { get; set; } public long Sequence { get; set; } }
public sealed partial class SupportStore
{
    public async Task<ReturnContext> ReturnAsync(Guid userId, Guid taskId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var subtree = await TaskSubtreeReader.Read(db, userId, taskId, ct); var ids = subtree.Select(x => x.Id).ToArray(); var now = clock.GetUtcNow();
        var version = await db.PlanningStates.Where(x => x.UserId == userId).Select(x => x.PlanningVersion).SingleAsync(ct);
        var lastWork = await (from w in db.WorkSessions.AsNoTracking() join s in db.WorkSegments.AsNoTracking() on new { w.UserId, Id = w.Id } equals new { s.UserId, Id = s.SessionId }
            where w.UserId == userId && w.TaskId.HasValue && ids.Contains(w.TaskId.Value) && !s.IsVoided && (s.EndedAt == null || s.EndedAt > s.StartedAt)
            orderby s.EndedAt ?? now descending, s.StartedAt descending, s.Id descending
            select new LastWorkContext(w.Id, w.TaskId!.Value, s.Id, s.StartedAt, s.EndedAt)).FirstOrDefaultAsync(ct);
        if (lastWork is not null && (lastWork.StartedAt > now || lastWork.EndedAt > now)) throw Conflict("server_clock_conflict", "Sunucu zamanı gerçek çalışma kaydından geride.");
        var notes = db.Notes.AsNoTracking().Where(x => x.UserId == userId && x.DeletedAt == null && x.TaskId.HasValue && ids.Contains(x.TaskId.Value));
        var lastNote = await notes.OrderByDescending(x => x.UpdatedAt).ThenByDescending(x => x.Id).FirstOrDefaultAsync(ct);
        var nextNote = await notes.Where(x => x.Kind == NoteKind.NextStep).OrderByDescending(x => x.UpdatedAt).ThenByDescending(x => x.Id).FirstOrDefaultAsync(ct);
        var completion = await db.Database.SqlQuery<CompletionContextRow>($"""
            SELECT "TaskId","EffectiveAt","Sequence" FROM task_events
            WHERE "UserId"={userId} AND "TaskId"=ANY({ids}) AND "EffectiveAt"<={now}
                AND COALESCE("Payload"->'after'->>'State',"Payload"->'after'->>'state')='Completed'
                AND COALESCE("Payload"->'before'->>'State',"Payload"->'before'->>'state','')<>'Completed'
            ORDER BY "EffectiveAt" DESC,"TaskId","Sequence" DESC LIMIT 1
            """).SingleOrDefaultAsync(ct);
        var all = await db.Tasks.AsNoTracking().Where(x => x.UserId == userId).ToArrayAsync(ct); var deps = await db.TaskDependencies.AsNoTracking().Where(x => x.UserId == userId).ToArrayAsync(ct);
        var open = subtree.Where(SupportRules.Open).ToArray(); var suggested = open.OrderByDescending(x => x.Id == lastWork?.TaskId)
            .ThenBy(x => x.DirectEstimatedSeconds ?? long.MaxValue).ThenBy(x => x.SortOrder).ThenBy(x => x.Id).FirstOrDefault(x => TaskGraphRules.CanStart(x, all, deps).CanStart);
        return new(taskId, version, lastWork, lastNote is null ? null : View(lastNote), nextNote is null ? null : View(nextNote), completion is null ? null : new(completion.TaskId, completion.EffectiveAt, completion.Sequence), suggested is null ? null : TaskStore.View(suggested), open.Length, now);
    }
    public async Task<DayEndCandidates> CandidatesAsync(Guid userId, DateOnly date, int offset, int limit, CancellationToken ct)
    {
        Date(date); Page(offset, limit); await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var version = await db.PlanningStates.Where(x => x.UserId == userId).Select(x => x.PlanningVersion).SingleAsync(ct); var now = clock.GetUtcNow();
        var planned = await db.Database.SqlQuery<Guid>($"""
            SELECT DISTINCT (i."Snapshot"->>'taskId')::uuid AS "Value" FROM plan_revision_items i JOIN plan_revisions r ON r."Id"=i."RevisionId" AND r."UserId"=i."UserId"
            JOIN daily_plans p ON p."Id"=r."DailyPlanId" AND p."UserId"=r."UserId" WHERE p."UserId"={userId} AND p."LocalDate"={date} AND i."Snapshot"->>'taskId' IS NOT NULL
            """).ToArrayAsync(ct);
        var zones = await db.WorkSessions.Where(x => x.UserId == userId).Select(x => x.TimeZoneId).Distinct().ToArrayAsync(ct); var windows = CalendarTime.Windows(date, date, zones);
        var worked = await db.Database.SqlQueryRaw<Guid>("""
            SELECT DISTINCT w."TaskId" AS "Value" FROM unnest(@zones::text[],@starts::timestamptz[],@ends::timestamptz[]) AS d("Zone","Start","End")
            JOIN work_sessions w ON w."UserId"=@user AND w."TimeZoneId"=d."Zone" AND w."TaskId" IS NOT NULL
            JOIN work_session_segments s ON s."UserId"=w."UserId" AND s."SessionId"=w."Id" AND NOT s."IsVoided" AND s."StartedAt"<d."End" AND COALESCE(s."EndedAt",@now)>d."Start"
            """, new NpgsqlParameter("user", userId), new NpgsqlParameter("now", now),
            new NpgsqlParameter("zones", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = windows.Select(x => x.TimeZoneId).ToArray() },
            new NpgsqlParameter("starts", NpgsqlDbType.Array | NpgsqlDbType.TimestampTz) { Value = windows.Select(x => x.StartsAt).ToArray() },
            new NpgsqlParameter("ends", NpgsqlDbType.Array | NpgsqlDbType.TimestampTz) { Value = windows.Select(x => x.EndsAt).ToArray() }).ToArrayAsync(ct);
        var critical = await db.CriticalTasks.Where(x => x.UserId == userId && x.LocalDate == date).Select(x => x.TaskId).ToArrayAsync(ct); var ids = planned.Concat(worked).Concat(critical).Distinct().ToArray();
        var tasks = db.Tasks.FromSqlInterpolated($"""
            WITH RECURSIVE candidates AS (
                SELECT * FROM tasks WHERE "UserId"={userId} AND "Id"=ANY({ids})
                UNION SELECT t.* FROM tasks t JOIN candidates p ON t."ParentTaskId"=p."Id" AND t."UserId"=p."UserId"
            ) SELECT * FROM candidates
            """).AsNoTracking().Where(x => x.ArchivedAt == null && x.HasDirectWork && !x.DirectWorkCompleted && (x.State == TaskState.Pending || x.State == TaskState.InProgress || x.State == TaskState.Paused));
        var total = await tasks.CountAsync(ct); var rows = await tasks.OrderBy(x => x.SortOrder).ThenBy(x => x.Id).Skip(offset).Take(limit).ToArrayAsync(ct); return new(date, rows.Select(TaskStore.View).ToArray(), offset, limit, total, version);
    }
}

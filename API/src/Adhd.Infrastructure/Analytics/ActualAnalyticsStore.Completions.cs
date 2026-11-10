using System.Text.Json;
using Adhd.Application.Analytics;
using Adhd.Application.Work;
using Adhd.Domain.Planning;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;
namespace Adhd.Infrastructure.Analytics;
public sealed partial class ActualAnalyticsStore
{
    private async Task<WorkPiece[]> EstimatedCompletions(Guid userId, ActualAnalyticsQuery q, DateTimeOffset now, CancellationToken ct)
    {
        // Snapshot estimates and source timezone are already stored by task history. Real work remains unchanged.
        var from = new DateTimeOffset(q.FromDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)).AddDays(-1);
        var to = new DateTimeOffset(q.ToDate.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)).AddDays(1);
        var rows = await db.TaskEvents.FromSqlInterpolated($"""
            SELECT e.* FROM task_events e JOIN tasks t ON t."UserId"=e."UserId" AND t."Id"=e."TaskId"
            WHERE e."UserId"={userId} AND t."State"='Completed' AND t."DeletedAt" IS NULL
              AND e."EffectiveAt"<={now} AND e."EffectiveAt">={from} AND e."EffectiveAt"<{to}
              AND COALESCE(e."Payload"->'after'->>'State',e."Payload"->'after'->>'state')='Completed'
              AND COALESCE(e."Payload"->'before'->>'State',e."Payload"->'before'->>'state','')<>'Completed'
              AND COALESCE(e."Payload"->'after'->>'CompletedAt',e."Payload"->'after'->>'completedAt')::timestamptz=t."CompletedAt"
              AND NOT EXISTS (SELECT 1 FROM work_sessions w JOIN work_session_segments s ON s."SessionId"=w."Id" AND s."UserId"=w."UserId"
                WHERE w."UserId"=e."UserId" AND w."TaskId"=e."TaskId" AND NOT s."IsVoided" AND COALESCE(s."EndedAt",{now})>s."StartedAt")
            ORDER BY e."Sequence" DESC LIMIT 50001
            """).AsNoTracking().ToArrayAsync(ct);
        Bound(rows.Length); var result = new List<WorkPiece>();
        foreach (var row in rows.DistinctBy(x=>x.TaskId)) {
            var task = AnalyticsHistory.After(row.Payload);
            if (task is null || !task.HasDirectWork || task.DirectEstimatedSeconds is not > 0 || row.TimeZoneId is null) continue;
            var date = PlanTime.Date(row.EffectiveAt, row.TimeZoneId);
            if (date < q.FromDate || date > q.ToDate) continue;
            TaskAtStart? snapshot = null; using var doc = JsonDocument.Parse(row.Payload);
            if (doc.RootElement.TryGetProperty("data",out var data) && data.ValueKind==JsonValueKind.Object && data.TryGetProperty("completionSnapshot",out var value) && value.ValueKind==JsonValueKind.Object)
                snapshot=value.Deserialize<TaskAtStart>(RevisionWriter.Json);
            snapshot ??= new(2, task.Id, task.Version, task.Title, [], task.ProjectId is {} project ? new(project,"Geçmiş proje adı bilinmiyor") : null, null,
                task.CategoryId is {} category ? new(category,"Geçmiş kategori adı bilinmiyor") : null, [], 0, row.EffectiveAt);
            result.Add(new(Guid.Empty, Guid.Empty, date, row.TimeZoneId, task.DirectEstimatedSeconds.Value, false, task.Id, snapshot, true));
        }
        return result.ToArray();
    }
}

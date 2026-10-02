using System.Text.Json;
using Adhd.Application.Tasks;
using Adhd.Domain.Planning;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;

namespace Adhd.Infrastructure.Analytics;

internal sealed record HistoryKey(Guid TaskId, DateOnly EndDate, string Zone);
internal sealed class AnalyticsHistoryRow { public long Ordinal { get; set; } public string? Payload { get; set; } }
internal static class AnalyticsHistory
{
    internal static async Task<Dictionary<HistoryKey, TaskView?>> Read(PlannerDbContext db, Guid user, IEnumerable<HistoryKey> requested, DateTimeOffset now, CancellationToken ct)
    {
        var keys = requested.Distinct().ToArray(); if (keys.Length == 0) return [];
        var ends = keys.Select(x => PlanTime.DayStart(x.EndDate.AddDays(1), x.Zone)).ToArray();
        var rows = await db.Database.SqlQueryRaw<AnalyticsHistoryRow>("""
            SELECT k.ordinality AS "Ordinal",e."Payload"::text AS "Payload"
            FROM unnest(@tasks::uuid[],@cutoffs::timestamptz[],@inclusive::boolean[]) WITH ORDINALITY AS k(task,cutoff,inclusive,ordinality)
            LEFT JOIN LATERAL (SELECT t."Payload" FROM task_events t WHERE t."UserId"=@user AND t."TaskId"=k.task
                AND (t."EffectiveAt"<k.cutoff OR (k.inclusive AND t."EffectiveAt"=k.cutoff)) ORDER BY t."Sequence" DESC LIMIT 1) e ON true
            """, new NpgsqlParameter("user", user), new NpgsqlParameter("tasks", NpgsqlDbType.Array | NpgsqlDbType.Uuid) { Value = keys.Select(x => x.TaskId).ToArray() },
            new NpgsqlParameter("cutoffs", NpgsqlDbType.Array | NpgsqlDbType.TimestampTz) { Value = ends.Select(x => now < x ? now : x).ToArray() },
            new NpgsqlParameter("inclusive", NpgsqlDbType.Array | NpgsqlDbType.Boolean) { Value = ends.Select(x => now < x).ToArray() }).ToArrayAsync(ct);
        return rows.ToDictionary(x => keys[(int)x.Ordinal - 1], x => After(x.Payload));
    }
    internal static TaskView? After(string? payload) => Snapshot(payload, "after");
    internal static TaskView? Before(string? payload) => Snapshot(payload, "before");
    private static TaskView? Snapshot(string? payload, string property)
    {
        if (payload is null) return null; using var doc = JsonDocument.Parse(payload);
        if (!doc.RootElement.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.Object ||
            (!value.TryGetProperty("DirectWorkCompleted", out _) && !value.TryGetProperty("directWorkCompleted", out _))) return null;
        return value.Deserialize<TaskView>(RevisionWriter.Json);
    }
    internal static string? Reason(string payload)
    {
        using var doc = JsonDocument.Parse(payload);
        return doc.RootElement.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Object && data.TryGetProperty("reason", out var reason) && reason.ValueKind == JsonValueKind.String ? reason.GetString() : null;
    }
}

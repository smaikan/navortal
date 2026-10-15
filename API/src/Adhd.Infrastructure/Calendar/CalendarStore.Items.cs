using System.Data;
using Adhd.Application.Calendar;
using Adhd.Application.Common;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Adhd.Infrastructure.Calendar;

public sealed partial class CalendarStore
{
    // Filtre ve sıra ortak. Görev ve üst bilgilerini eklemeden önce sayfayı al.
    private const string CurrentItemsSql = """
        WITH RECURSIVE items AS (
            SELECT 'Timed'::text AS "Kind",s."Id",p."LocalDate",t."Id" AS "TaskId",
                s."StartsAt",s."EndsAt",s."CompletedAt",0 AS "KindOrder",0::numeric AS "SortOrder"
            FROM task_schedules s
            JOIN daily_plans p ON p."UserId"=s."UserId" AND p."Id"=s."DailyPlanId"
            JOIN tasks t ON t."UserId"=s."UserId" AND t."Id"=s."TaskId"
            WHERE s."UserId"=@user AND s."State"='Planned' AND s."Kind"='Work'
                AND p."LocalDate" BETWEEN @from AND @to AND t."DeletedAt" IS NULL
            UNION ALL
            SELECT 'Untimed',d."Id",d."LocalDate",t."Id",d."StartsAt",d."EndsAt",
                d."CompletedAt",1,d."SortOrder"
            FROM day_items d JOIN tasks t ON t."UserId"=d."UserId" AND t."Id"=d."TaskId"
            WHERE d."UserId"=@user AND d."State"='Planned' AND d."LocalDate" BETWEEN @from AND @to
                AND t."DeletedAt" IS NULL AND t."ArchivedAt" IS NULL
        )
        """;
    private sealed record ItemRow(string Kind, Guid Id, DateOnly LocalDate, Guid TaskId,
        DateTimeOffset? StartsAt, DateTimeOffset? EndsAt, DateTimeOffset? CompletedAt);
    private sealed record TaskNode(Guid Id, string Title, Guid? ParentTaskId, string State);
    private static NpgsqlParameter[] ItemParameters(Guid user, DateOnly from, DateOnly to) =>
        [new("user",user),new("from",from),new("to",to)];
    public async Task<CalendarItemPage> ItemsAsync(Guid userId, DateOnly fromDate, DateOnly toDate, int offset, int limit, CancellationToken ct)
    {
        Validate(fromDate,toDate);
        if (offset is < 0 or > 100000 || limit is < 1 or > 500)
            throw new UseCaseException(ErrorKind.Validation,"pagination_invalid","Offset 0–100000, limit 1–500 olmalı.");
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead,ct);
        var total = await db.Database.SqlQueryRaw<int>(CurrentItemsSql + """ 
            SELECT COUNT(*)::int AS "Value" FROM items
            """,ItemParameters(userId,fromDate,toDate)).SingleAsync(ct);
        var rows = await db.Database.SqlQueryRaw<ItemRow>(CurrentItemsSql + """
            SELECT "Kind","Id","LocalDate","TaskId","StartsAt","EndsAt","CompletedAt" FROM items
            ORDER BY "LocalDate","KindOrder","StartsAt" NULLS LAST,"SortOrder","Id" OFFSET @offset LIMIT @limit
            """, [..ItemParameters(userId,fromDate,toDate),new NpgsqlParameter("offset",offset),new NpgsqlParameter("limit",limit)]).ToArrayAsync(ct);
        var ids = rows.Select(x=>x.TaskId).Distinct().ToArray();
        var nodes = ids.Length == 0 ? [] : await db.Database.SqlQuery<TaskNode>($"""
            WITH RECURSIVE ancestors AS (
                SELECT t."Id",t."Title",t."ParentTaskId",t."State",ARRAY[t."Id"] AS path FROM tasks t
                WHERE t."UserId"={userId} AND t."Id"=ANY({ids})
                UNION ALL
                SELECT t."Id",t."Title",t."ParentTaskId",t."State",a.path||t."Id" FROM ancestors a
                JOIN tasks t ON t."UserId"={userId} AND t."Id"=a."ParentTaskId"
                WHERE NOT t."Id"=ANY(a.path)
            ) SELECT DISTINCT "Id","Title","ParentTaskId","State" FROM ancestors
            """).ToArrayAsync(ct);
        var lookup=nodes.ToDictionary(x=>x.Id);
        CalendarItem Make(ItemRow row) {
            var task=lookup[row.TaskId];var root=task;var seen=new HashSet<Guid>();
            while(root.ParentTaskId is {} parent && lookup.TryGetValue(parent,out var next) && seen.Add(root.Id)) root=next;
            TaskNode? parentNode=task.ParentTaskId is {} p && lookup.TryGetValue(p,out var found) ? found : null;
            return new(Enum.Parse<CalendarItemKind>(row.Kind),row.Id,row.LocalDate,task.Id,task.Title,
                parentNode?.Id,parentNode?.Title,root.Id,root.Title,row.StartsAt,row.EndsAt,row.CompletedAt,Enum.Parse<TaskState>(task.State));
        }
        var result=new CalendarItemPage(fromDate,toDate,rows.Select(Make).ToArray(),offset,limit,total);
        await tx.CommitAsync(ct);return result;
    }
}


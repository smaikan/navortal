using System.Data;
using Adhd.Application.Calendar;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Calendar;

public sealed partial class CalendarStore
{
    private sealed record OverviewRow(DateOnly LocalDate, int ItemCount, int CompletedItemCount, int RootGroupCount,
        Guid? RootTaskId, string? RootTitle, int? GroupItemCount, int? GroupCompletedItemCount, bool? Done);
    public async Task<CalendarOverviewView> OverviewAsync(Guid userId,DateOnly fromDate,DateOnly toDate,CancellationToken ct)
    {
        Validate(fromDate,toDate);
        await using var tx=await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead,ct);
        var version=await db.PlanningStates.AsNoTracking().Where(x=>x.UserId==userId).Select(x=>x.PlanningVersion).SingleAsync(ct);
        var prefs=await preferences.ReadAsync(userId,ct);var now=clock.GetUtcNow();
        var zones=await db.DailyPlans.AsNoTracking().Where(x=>x.UserId==userId && x.LocalDate>=fromDate && x.LocalDate<=toDate)
            .Select(x=>new { x.LocalDate,x.TimeZoneId }).ToDictionaryAsync(x=>x.LocalDate,x=>x.TimeZoneId,ct);
        var rows=await db.Database.SqlQueryRaw<OverviewRow>(CurrentItemsSql+"""
            , paths AS (
                SELECT t."Id" AS origin,t."Id",t."Title",t."ParentTaskId",0 AS depth,ARRAY[t."Id"] AS path
                FROM tasks t JOIN (SELECT DISTINCT "TaskId" FROM items) i ON i."TaskId"=t."Id" WHERE t."UserId"=@user
                UNION ALL
                SELECT p.origin,t."Id",t."Title",t."ParentTaskId",p.depth+1,p.path||t."Id"
                FROM paths p JOIN tasks t ON t."UserId"=@user AND t."Id"=p."ParentTaskId"
                WHERE NOT t."Id"=ANY(p.path)
            ), roots AS (
                SELECT DISTINCT ON(origin) origin,"Id","Title" FROM paths ORDER BY origin,depth DESC
            ), ordered AS (
                SELECT i.*,r."Id" AS root,r."Title" AS title,
                    row_number() OVER(PARTITION BY i."LocalDate" ORDER BY i."KindOrder",i."StartsAt" NULLS LAST,i."SortOrder",i."Id") AS position
                FROM items i JOIN roots r ON r.origin=i."TaskId"
            ), groups AS (
                SELECT "LocalDate",root,title,COUNT(*)::int AS count,
                    COUNT("CompletedAt")::int AS completed,bool_and("CompletedAt" IS NOT NULL) AS done,MIN(position) AS first
                FROM ordered GROUP BY "LocalDate",root,title
            ), ranked AS (
                SELECT *,row_number() OVER(PARTITION BY "LocalDate" ORDER BY first,root) AS rank FROM groups
            ), totals AS (
                SELECT "LocalDate",COUNT(*)::int AS roots,SUM(count)::int AS items,SUM(completed)::int AS completed
                FROM groups GROUP BY "LocalDate"
            ), days AS (
                SELECT generate_series(@from::date,@to::date,interval '1 day')::date AS date
            )
            SELECT d.date AS "LocalDate",COALESCE(t.items,0) AS "ItemCount",COALESCE(t.completed,0) AS "CompletedItemCount",
                COALESCE(t.roots,0) AS "RootGroupCount",r.root AS "RootTaskId",r.title AS "RootTitle",
                r.count AS "GroupItemCount",r.completed AS "GroupCompletedItemCount",r.done AS "Done"
            FROM days d LEFT JOIN totals t ON t."LocalDate"=d.date
            LEFT JOIN ranked r ON r."LocalDate"=d.date AND r.rank<=3 ORDER BY d.date,r.rank
            """,ItemParameters(userId,fromDate,toDate)).ToArrayAsync(ct);
        var days=rows.GroupBy(x=>x.LocalDate).Select(g=> {
            var first=g.First();
            return new CalendarOverviewDay(g.Key,zones.GetValueOrDefault(g.Key,prefs.Values.TimeZoneId),first.ItemCount,
                first.CompletedItemCount,first.RootGroupCount,g.Where(x=>x.RootTaskId.HasValue).Select(x=>
                    new CalendarRootPreview(x.RootTaskId!.Value,x.RootTitle!,x.GroupItemCount!.Value,x.GroupCompletedItemCount!.Value,x.Done!.Value)).ToArray());
        }).ToArray();
        var result=new CalendarOverviewView(fromDate,toDate,now,version,days);
        await tx.CommitAsync(ct);return result;
    }
}


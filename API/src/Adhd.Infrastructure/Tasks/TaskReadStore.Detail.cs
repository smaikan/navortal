using System.Data;
using Adhd.Application.Common;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Tasks;

public sealed partial class TaskReadStore
{
    public async Task<TaskDetailView> DetailAsync(Guid userId,Guid taskId,CancellationToken ct)
    {
        await using var tx=await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead,ct);
        var source=await db.Tasks.AsNoTracking().Where(x=>x.UserId==userId && x.Id==taskId && x.DeletedAt==null)
            .Select(x=>new {Task=x,Urgent=db.DayItems.Where(d=>d.UserId==userId && d.TaskId==x.Id && d.IsUrgent && d.State==Adhd.Domain.Planning.DayItemState.Planned && d.CompletedAt==null).Max(d=>(DateOnly?)d.LocalDate)}).SingleOrDefaultAsync(ct)
            ?? throw new UseCaseException(ErrorKind.NotFound,"task_not_found","Görev bulunamadı.");
        var task=source.Task;
        var version=await db.PlanningStates.AsNoTracking().Where(x=>x.UserId==userId).Select(x=>x.PlanningVersion).SingleAsync(ct);
        var now=clock.GetUtcNow();
        // Ağacı bir kez gez. Açık iş yükünü buradan çıkar, geçmiş çalışma için arşivi de al.
        var all=await db.Tasks.FromSqlInterpolated($"""
            WITH RECURSIVE tree AS (
                SELECT t.*,ARRAY[t."Id"] AS path FROM tasks t WHERE t."UserId"={userId} AND t."Id"={taskId}
                UNION ALL SELECT t.*,p.path||t."Id" FROM tasks t JOIN tree p ON t."UserId"={userId} AND t."ParentTaskId"=p."Id"
                WHERE NOT t."Id"=ANY(p.path)
            ) SELECT * FROM tree
            """).AsNoTracking().ToArrayAsync(ct);
        var children=all.Where(x=>x.ParentTaskId.HasValue).ToLookup(x=>x.ParentTaskId!.Value);
        var active=new List<TaskItem>();var pending=new Queue<TaskItem>();pending.Enqueue(task);
        var seen=new HashSet<Guid>();
        while(pending.TryDequeue(out var item)) {
            if(!seen.Add(item.Id)) throw new UseCaseException(ErrorKind.Conflict,"task_tree_cycle","Görev ağacı döngü içeriyor.");
            active.Add(item);foreach(var child in children[item.Id].Where(x=>x.ArchivedAt==null)) pending.Enqueue(child);
        }
        var workload=WorkloadAccess.Calculate(active);
        TaskProgress progress;
        try {progress=TaskProgressCalculator.Calculate(active,taskId);}
        catch(OverflowException) {throw new UseCaseException(ErrorKind.Validation,"workload_overflow","Toplam süre desteklenen sayı aralığını aşıyor.");}
        var rowTasks=active.Where(x=>x.ArchivedAt==null).ToArray();
        var ranges=PlannedRanges.Effective(rowTasks);ranges.TryGetValue(taskId,out var range);
        var directChildren=children[taskId].Where(x=>x.ArchivedAt==null).ToArray();
        var sum=rowTasks.Any(x=>x.Id==taskId) ? workload.Summaries[taskId] : null;
        var urgent=source.Urgent;
        var row=new TreeRowSummary(taskId,directChildren.Length,directChildren.Count(x=>x.State==TaskState.Completed),
            sum?.KnownEstimatedSeconds,sum?.UnknownEstimateCount??0,range?.From,range?.To,
            directChildren.Any(x=>ranges.TryGetValue(x.Id,out var r) && r is not null),urgent);
        var ids=all.Select(x=>x.Id).ToArray();
        var segments=await (from s in db.WorkSegments.AsNoTracking() join w in db.WorkSessions.AsNoTracking()
            on new {s.UserId,Id=s.SessionId} equals new {w.UserId,w.Id}
            where s.UserId==userId && w.TaskId.HasValue && ids.Contains(w.TaskId.Value) && !s.IsVoided
            select new {TaskId=w.TaskId!.Value,Segment=s}).ToArrayAsync(ct);
        var time=TaskTimeProjection.Calculate(taskId,all,segments.Select(x=>(x.TaskId,x.Segment)),now);
        var tags=await db.TaskTagLinks.AsNoTracking().Where(x=>x.UserId==userId && x.TaskId==taskId).OrderBy(x=>x.TagId).Select(x=>x.TagId).ToArrayAsync(ct);
        var classification=new ClassificationView(taskId,task.Version,version,new(task.ProjectId,task.PoolId,task.CategoryId,tags));
        var labels=await db.Database.SqlQuery<TaskResourceLabel>($"""
            SELECT 'projects'::text AS "Kind",r."Id",r."Name",r."Version",r."ArchivedAt" FROM task_projects r WHERE r."UserId"={userId} AND r."Id"={task.ProjectId}
            UNION ALL SELECT 'pools',r."Id",r."Name",r."Version",r."ArchivedAt" FROM task_pools r WHERE r."UserId"={userId} AND r."Id"={task.PoolId}
            UNION ALL SELECT 'categories',r."Id",r."Name",r."Version",r."ArchivedAt" FROM task_categories r WHERE r."UserId"={userId} AND r."Id"={task.CategoryId}
            UNION ALL SELECT 'tags',r."Id",r."Name",r."Version",r."ArchivedAt" FROM task_tags r WHERE r."UserId"={userId} AND r."Id"=ANY({tags})
            """).ToArrayAsync(ct);
        var parent=task.ParentTaskId is {} parentId ? await db.Tasks.AsNoTracking().Where(x=>x.UserId==userId && x.Id==parentId && x.DeletedAt==null)
            .Select(x=>new TaskAncestorRow(x.Id,x.Title,x.ParentTaskId,x.Version)).SingleOrDefaultAsync(ct) : null;
        var result=new TaskDetailView(TaskStore.View(task),row,workload.Summaries[taskId],time,progress,classification,labels,parent,version,now);
        await tx.CommitAsync(ct);return result;
    }
}

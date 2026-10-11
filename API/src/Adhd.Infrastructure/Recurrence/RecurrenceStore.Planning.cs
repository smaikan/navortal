using System.Text.Json;
using Adhd.Application.Planning;
using Adhd.Application.Work;
using Adhd.Domain.Planning;
using Adhd.Domain.Recurrence;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Recurrence;

public sealed partial class RecurrenceStore
{
    // Rutin üreten işlemin hesap kilidiyle çalışır. Daha önceki plan bağları, kaldırılmış olsa bile,
    // kullanıcı kararıdır. Sonraki tarama bunları geri getirmesin.
    private async Task<int> AddAutomaticPlans(Guid userId, RecurrenceOccurrence[] occurrences, RecurrenceDefinition[] definitions, long inputVersion, DateTimeOffset now, CancellationToken ct)
    {
        occurrences=occurrences.Where(x=>Applicable(definitions,x.LocalDate) is {} definition && Read<RecurrenceRule>(definition.Rule).AutoAddToPlan).ToArray();
        var ids=occurrences.Where(x=>x.TaskId.HasValue && x.State==OccurrenceState.Materialized).Select(x=>x.TaskId!.Value).ToArray();
        if(ids.Length==0) return 0;
        await db.SaveChangesAsync(ct);
        var tasks=await db.Tasks.Where(x=>x.UserId==userId && ids.Contains(x.Id)).ToDictionaryAsync(x=>x.Id,ct);
        var linked=await db.DayItems.Where(x=>x.UserId==userId && ids.Contains(x.TaskId)).Select(x=>x.TaskId).ToArrayAsync(ct);
        var scheduled=await db.TaskSchedules.Where(x=>x.UserId==userId && x.TaskId.HasValue && ids.Contains(x.TaskId.Value)).Select(x=>x.TaskId!.Value).ToArrayAsync(ct);
        var worked=await db.WorkSessions.Where(x=>x.UserId==userId && x.TaskId.HasValue && ids.Contains(x.TaskId.Value)).Select(x=>x.TaskId!.Value).ToArrayAsync(ct);
        var children=await db.Tasks.Where(x=>x.UserId==userId && x.ParentTaskId.HasValue && ids.Contains(x.ParentTaskId.Value)).Select(x=>x.ParentTaskId!.Value).ToArrayAsync(ct);
        var blocked=linked.Concat(scheduled).Concat(worked).Concat(children).ToHashSet();
        var poolIds=tasks.Values.Where(x=>x.PoolId.HasValue).Select(x=>x.PoolId!.Value).Distinct().ToArray();
        var pools=await db.Pools.Where(x=>x.UserId==userId && poolIds.Contains(x.Id)).ToDictionaryAsync(x=>x.Id,x=>x.Name,ct);
        var changes=new List<PlanDelta>();var dayChanges=new List<DayDelta>();
        foreach(var occurrence in occurrences.Where(x=>x.TaskId.HasValue && x.State==OccurrenceState.Materialized))
        {
            var definition=Applicable(definitions,occurrence.LocalDate);if(definition is null) continue;
            var rule=Read<RecurrenceRule>(definition.Rule);var task=tasks[occurrence.TaskId!.Value];
            if(!rule.AutoAddToPlan || !RecurrenceRules.Matches(rule,occurrence.LocalDate) || occurrence.LocalDate<PlanTime.Date(now,rule.TimeZoneId)
                || blocked.Contains(task.Id) || task.Version!=occurrence.SyncedTaskVersion || task.State!=TaskState.Pending || task.ArchivedAt.HasValue || task.DeletedAt.HasValue || !task.HasDirectWork || task.DirectWorkCompleted) continue;
            var plan=await AutomaticPlan(userId,occurrence.LocalDate,rule.TimeZoneId,ct);
            var item=new DayItem {Id=Guid.CreateVersion7(),UserId=userId,TaskId=task.Id,LocalDate=occurrence.LocalDate,CreatedAt=now,UpdatedAt=now,
                SortOrder=(await db.DayItems.Where(x=>x.UserId==userId && x.LocalDate==occurrence.LocalDate).MaxAsync(x=>(int?)x.SortOrder,ct)??-1)+1};
            if(rule.StartTime.HasValue)
            {
                if(plan.TimeZoneId!=rule.TimeZoneId) item.TimingIssue="PlanTimeZoneMismatch";
                else try {
                    var candidate=RecurrenceRules.Resolve(rule with {DueTime=rule.StartTime},occurrence.LocalDate);
                    item.StartsAt=candidate.DueAt; if(candidate.Skipped) item.TimingIssue="LocalTimeUnavailable";
                } catch(RecurrenceTimeException) {item.TimingIssue="LocalTimeUnavailable";}
            }
            if(item.StartsAt is {} start && task.DirectEstimatedSeconds is >0 and <=604800)
            {
                var end=start.AddSeconds(task.DirectEstimatedSeconds.Value);
                var conflict=changes.Any(x=>x.Schedule.StartsAt<end && x.Schedule.EndsAt>start)
                    || await db.TaskSchedules.AnyAsync(x=>x.UserId==userId && x.State==ScheduleState.Planned && x.StartsAt<end && x.EndsAt>start,ct);
                var parts=PlanTime.Split(start,end,plan.TimeZoneId);
                var partPlans=new List<DailyPlan>(); foreach(var part in parts) partPlans.Add(await AutomaticPlan(userId,part.LocalDate,plan.TimeZoneId,ct));
                if(partPlans.Any(x=>x.TimeZoneId!=plan.TimeZoneId)) item.TimingIssue="PlanTimeZoneMismatch";
                else if(conflict) item.TimingIssue="ScheduleOverlap";
                else {
                    var pool=task.PoolId is {} p && pools.TryGetValue(p,out var name)?new NamedSnapshot(p,name):null;
                    var snapshot=new PlanningTaskSnapshot(new TaskAtStart(1,task.Id,task.Version,task.Title,[],null,pool,null,[],inputVersion,now),task.State,task.HasDirectWork,task.DirectWorkCompleted,task.RequiredForParent,task.DirectEstimatedSeconds,task.TargetBudgetSeconds,task.Priority,task.EnergyDemand);
                    var group=parts.Length>1?Guid.CreateVersion7():(Guid?)null;Guid? origin=null;
                    for(var i=0;i<parts.Length;i++) {
                        var part=parts[i];var block=new TaskSchedule {Id=Guid.CreateVersion7(),UserId=userId,DailyPlanId=partPlans[i].Id,TaskId=task.Id,Kind=ScheduleKind.Work,StartsAt=part.StartsAt,EndsAt=part.EndsAt,
                            IsAutomatic=true,SplitGroupId=group,OriginScheduleId=origin,TaskSnapshot=JsonSerializer.Serialize(snapshot,RevisionWriter.Json)};
                        origin??=block.Id;db.TaskSchedules.Add(block);changes.Add(new(block,null,"RecurrenceAdded"));
                    }
                    item.State=DayItemState.Scheduled;item.ScheduleId=origin;
                }
            }
            else if(item.StartsAt.HasValue && task.DirectEstimatedSeconds>604800) item.TimingIssue="EstimateTooLong";
            db.DayItems.Add(item);dayChanges.Add(new(item,null,"RecurrenceAdded",plan.Id));blocked.Add(task.Id);
        }
        await RevisionWriter.Write(db,userId,changes,now,"Recurrence","Tekrar gün planına eklendi",Guid.CreateVersion7(),false,ct,dayDeltas:dayChanges);
        return dayChanges.Count;
    }
    private async Task<DailyPlan> AutomaticPlan(Guid userId,DateOnly date,string zone,CancellationToken ct)
    {
        var plan=db.DailyPlans.Local.FirstOrDefault(x=>x.UserId==userId && x.LocalDate==date)??await db.DailyPlans.SingleOrDefaultAsync(x=>x.UserId==userId && x.LocalDate==date,ct);
        if(plan is not null) return plan;
        plan=new(){Id=Guid.CreateVersion7(),UserId=userId,LocalDate=date,TimeZoneId=zone};db.DailyPlans.Add(plan);return plan;
    }
}

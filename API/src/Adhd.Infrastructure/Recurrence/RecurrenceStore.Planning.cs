using System.Text.Json;
using Adhd.Application.Planning;
using Adhd.Application.Recurrence;
using Adhd.Application.Work;
using Adhd.Domain.Planning;
using Adhd.Domain.Recurrence;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Recurrence;

public sealed partial class RecurrenceStore
{
    private sealed record OwnedPlan(RecurrenceOccurrence Occurrence, DayItem Item, TaskItem Task, TaskSchedule[] Blocks);
    // Sistemin eklediği ve kullanıcının hiç dokunmadığı öğeler. Seri değişikliği yalnız bunları değiştirebilir.
    private async Task<OwnedPlan[]> OwnedPlans(Guid userId, RecurrenceOccurrence[] rows, CancellationToken ct)
    {
        var occurrences = rows.Where(x => x.State == OccurrenceState.Materialized && x.TaskId.HasValue).ToDictionary(x => x.Id); if (occurrences.Count == 0) return [];
        var ids = occurrences.Keys.ToArray();
        var items = await db.DayItems.Where(x => x.UserId == userId && x.RecurrenceOccurrenceId.HasValue && ids.Contains(x.RecurrenceOccurrenceId.Value) && x.SeriesRetractedAt == null && x.State != DayItemState.Removed).ToArrayAsync(ct);
        var taskIds = items.Select(x => x.TaskId).ToArray(); var tasks = await db.Tasks.Where(x => x.UserId == userId && taskIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var worked = (await db.WorkSessions.Where(x => x.UserId == userId && x.TaskId.HasValue && taskIds.Contains(x.TaskId.Value)).Select(x => x.TaskId!.Value).ToArrayAsync(ct)).ToHashSet();
        var parents = (await db.Tasks.Where(x => x.UserId == userId && x.ParentTaskId.HasValue && taskIds.Contains(x.ParentTaskId.Value)).Select(x => x.ParentTaskId!.Value).ToArrayAsync(ct)).ToHashSet();
        var blocks = (await db.TaskSchedules.Where(x => x.UserId == userId && x.TaskId.HasValue && taskIds.Contains(x.TaskId.Value) && x.State == ScheduleState.Planned).ToArrayAsync(ct)).ToLookup(x => x.TaskId!.Value);
        return items.Select(x => new OwnedPlan(occurrences[x.RecurrenceOccurrenceId!.Value], x, tasks[x.TaskId], blocks[x.TaskId].ToArray()))
            .Where(x => x.Item is { Version: 1, CompletedAt: null, IsUrgent: false } && x.Item.LocalDate == x.Occurrence.LocalDate
                && x.Task is { State: TaskState.Pending, ArchivedAt: null, DeletedAt: null, DirectWorkCompleted: false } && x.Task.Version == x.Occurrence.SyncedTaskVersion
                && !worked.Contains(x.Task.Id) && !parents.Contains(x.Task.Id) && x.Blocks.All(b => b is { IsAutomatic: true, Version: 1, CompletedAt: null })).ToArray();
    }
    // Plan biçimini değiştirmeyen düzenleme öğeleri yeniden kurmaz; yazma yükünü düşürür ve öğe kimliğini korur.
    private static OwnedPlan[] Stale(OwnedPlan[] owned, RecurrenceRule before, RecurringTaskDefaults fields, RecurrenceUpdate command)
    {
        var timing = before.StartTime != command.Rule.StartTime || before.TimeZoneId != command.Rule.TimeZoneId || fields.EstimatedSeconds != command.Task.EstimatedSeconds; var details = fields != command.Task;
        return owned.Where(x => timing || !command.Rule.AutoAddToPlan || !RecurrenceRules.Matches(command.Rule, x.Occurrence.LocalDate) || x.Blocks.Length > 0 && details).ToArray();
    }
    private async Task<int> Retract(Guid userId, OwnedPlan[] owned, string reason, DateTimeOffset now, CancellationToken ct)
    {
        if (owned.Length == 0) return 0;
        var dates = owned.Select(x => x.Item.LocalDate).Distinct().ToArray(); var plans = await db.DailyPlans.Where(x => x.UserId == userId && dates.Contains(x.LocalDate)).ToDictionaryAsync(x => x.LocalDate, ct);
        var changes = new List<PlanDelta>(); var dayChanges = new List<DayDelta>();
        foreach (var plan in owned)
        {
            var before = RevisionWriter.Snapshot(plan.Item); plan.Item.State = DayItemState.Removed; plan.Item.Version++; plan.Item.UpdatedAt = now; plan.Item.SeriesRetractedAt = now;
            dayChanges.Add(new(plan.Item, before, "RecurrenceRetracted", plans[plan.Item.LocalDate].Id));
            foreach (var block in plan.Blocks) { var view = RevisionWriter.View(block); block.State = ScheduleState.Removed; block.Version++; changes.Add(new(block, view, "RecurrenceRetracted")); }
        }
        await RevisionWriter.Write(db, userId, changes, now, "Recurrence", reason, Guid.CreateVersion7(), false, ct, dayDeltas: dayChanges); return owned.Length;
    }
    // Atlanan veya iptal edilen oluşum planda açık öğe bırakmaz. Bitmiş öğe geçmiş olarak kalır.
    private async Task<int> RemoveOpenItems(Guid userId, Guid taskId, DateTimeOffset now, CancellationToken ct)
    {
        var items = await db.DayItems.Where(x => x.UserId == userId && x.TaskId == taskId && x.State == DayItemState.Planned && x.CompletedAt == null).ToArrayAsync(ct); if (items.Length == 0) return 0;
        var dates = items.Select(x => x.LocalDate).ToArray(); var plans = await db.DailyPlans.Where(x => x.UserId == userId && dates.Contains(x.LocalDate)).ToDictionaryAsync(x => x.LocalDate, ct); var dayChanges = new List<DayDelta>();
        foreach (var item in items) { var before = RevisionWriter.Snapshot(item); item.State = DayItemState.Removed; item.Version++; item.UpdatedAt = now; dayChanges.Add(new(item, before, "RecurrenceSkipped", plans[item.LocalDate].Id)); }
        await RevisionWriter.Write(db, userId, [], now, "Recurrence", "Rutin günü atlandı", Guid.CreateVersion7(), false, ct, dayDeltas: dayChanges); return items.Length;
    }
    // Rutin üreten işlem hesap kilidini tutuyor. Kullanıcının çıkardığı öğeyi tarama geri koymaz.
    // Yalnız seri değişikliğinin kaldırdığı öğeyi yeniden kur. Okumaları tek tek yapma.
    private async Task<int> AddAutomaticPlans(Guid userId, RecurrenceOccurrence[] occurrences, RecurrenceDefinition[] definitions, long inputVersion, DateTimeOffset now, CancellationToken ct)
    {
        var rules=definitions.ToDictionary(x=>x.Id,x=>Read<RecurrenceRule>(x.Rule));
        occurrences=occurrences.Where(x=>x.TaskId.HasValue && x.State==OccurrenceState.Materialized && Applicable(definitions,x.LocalDate) is {} definition && rules[definition.Id].AutoAddToPlan).ToArray();
        var ids=occurrences.Select(x=>x.TaskId!.Value).ToArray();
        if(ids.Length==0) return 0;
        await db.SaveChangesAsync(ct);
        var tasks=await db.Tasks.Where(x=>x.UserId==userId && ids.Contains(x.Id)).ToDictionaryAsync(x=>x.Id,ct);
        var items=await db.DayItems.Where(x=>x.UserId==userId && ids.Contains(x.TaskId)).Select(x=>new {x.TaskId,x.SeriesRetractedAt}).ToArrayAsync(ct);
        var linked=items.Where(x=>x.SeriesRetractedAt==null).Select(x=>x.TaskId);var retracted=items.Where(x=>x.SeriesRetractedAt.HasValue).Select(x=>x.TaskId).ToArray();
        var scheduled=await db.TaskSchedules.Where(x=>x.UserId==userId && x.TaskId.HasValue && ids.Contains(x.TaskId.Value) && !(x.State==ScheduleState.Removed && retracted.Contains(x.TaskId.Value))).Select(x=>x.TaskId!.Value).ToArrayAsync(ct);
        var worked=await db.WorkSessions.Where(x=>x.UserId==userId && x.TaskId.HasValue && ids.Contains(x.TaskId.Value)).Select(x=>x.TaskId!.Value).ToArrayAsync(ct);
        var children=await db.Tasks.Where(x=>x.UserId==userId && x.ParentTaskId.HasValue && ids.Contains(x.ParentTaskId.Value)).Select(x=>x.ParentTaskId!.Value).ToArrayAsync(ct);
        var blocked=linked.Concat(scheduled).Concat(worked).Concat(children).ToHashSet();
        var poolIds=tasks.Values.Where(x=>x.PoolId.HasValue).Select(x=>x.PoolId!.Value).Distinct().ToArray();
        var pools=await db.Pools.Where(x=>x.UserId==userId && poolIds.Contains(x.Id)).ToDictionaryAsync(x=>x.Id,x=>x.Name,ct);
        var first=occurrences.Min(x=>x.LocalDate);var last=occurrences.Max(x=>x.LocalDate);var lastPlan=last.AddDays(8);
        var plans=await db.DailyPlans.Where(x=>x.UserId==userId && x.LocalDate>=first && x.LocalDate<=lastPlan).ToDictionaryAsync(x=>x.LocalDate,ct);
        var orders=(await db.DayItems.Where(x=>x.UserId==userId && x.LocalDate>=first && x.LocalDate<=last).GroupBy(x=>x.LocalDate).Select(g=>new {g.Key,Order=g.Max(x=>x.SortOrder)}).ToArrayAsync(ct)).ToDictionary(x=>x.Key,x=>x.Order);
        // Tahmin en çok 7 gün. Yerel gün farkı için sorguda biraz daha pay var.
        var lower=new DateTimeOffset(first.AddDays(-2).ToDateTime(TimeOnly.MinValue),TimeSpan.Zero);var upper=new DateTimeOffset(lastPlan.AddDays(2).ToDateTime(TimeOnly.MinValue),TimeSpan.Zero);
        var busy=(await db.TaskSchedules.AsNoTracking().Where(x=>x.UserId==userId && x.State==ScheduleState.Planned && x.StartsAt<upper && x.EndsAt>lower).Select(x=>new {x.StartsAt,x.EndsAt}).ToArrayAsync(ct)).Select(x=>(x.StartsAt,x.EndsAt)).ToList();
        DailyPlan PlanFor(DateOnly date,string zone)
        {
            if(plans.TryGetValue(date,out var plan)) return plan;
            plan=new(){Id=Guid.CreateVersion7(),UserId=userId,LocalDate=date,TimeZoneId=zone};db.DailyPlans.Add(plan);plans[date]=plan;return plan;
        }
        var changes=new List<PlanDelta>();var dayChanges=new List<DayDelta>();
        foreach(var occurrence in occurrences.OrderBy(x=>x.LocalDate))
        {
            var definition=Applicable(definitions,occurrence.LocalDate);if(definition is null) continue;
            var rule=rules[definition.Id];var task=tasks[occurrence.TaskId!.Value];
            if(!rule.AutoAddToPlan || !RecurrenceRules.Matches(rule,occurrence.LocalDate) || occurrence.LocalDate<PlanTime.Date(now,rule.TimeZoneId)
                || blocked.Contains(task.Id) || task.Version!=occurrence.SyncedTaskVersion || task.State!=TaskState.Pending || task.ArchivedAt.HasValue || task.DeletedAt.HasValue || !task.HasDirectWork || task.DirectWorkCompleted) continue;
            var plan=PlanFor(occurrence.LocalDate,rule.TimeZoneId);
            var order=orders.TryGetValue(occurrence.LocalDate,out var max)?max+1:0;orders[occurrence.LocalDate]=order;
            var item=new DayItem {Id=Guid.CreateVersion7(),UserId=userId,TaskId=task.Id,LocalDate=occurrence.LocalDate,CreatedAt=now,UpdatedAt=now,SortOrder=order,RecurrenceOccurrenceId=occurrence.Id};
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
                var conflict=busy.Any(x=>x.StartsAt<end && x.EndsAt>start);
                var parts=PlanTime.Split(start,end,plan.TimeZoneId);
                var partPlans=parts.Select(part=>PlanFor(part.LocalDate,plan.TimeZoneId)).ToArray();
                if(partPlans.Any(x=>x.TimeZoneId!=plan.TimeZoneId)) item.TimingIssue="PlanTimeZoneMismatch";
                else if(conflict) item.TimingIssue="ScheduleOverlap";
                else {
                    var pool=task.PoolId is {} p && pools.TryGetValue(p,out var name)?new NamedSnapshot(p,name):null;
                    var snapshot=new PlanningTaskSnapshot(new TaskAtStart(1,task.Id,task.Version,task.Title,[],null,pool,null,[],inputVersion,now),task.State,task.HasDirectWork,task.DirectWorkCompleted,task.RequiredForParent,task.DirectEstimatedSeconds,task.TargetBudgetSeconds,task.Priority,task.EnergyDemand);
                    var group=parts.Length>1?Guid.CreateVersion7():(Guid?)null;Guid? origin=null;
                    for(var i=0;i<parts.Length;i++) {
                        var part=parts[i];var block=new TaskSchedule {Id=Guid.CreateVersion7(),UserId=userId,DailyPlanId=partPlans[i].Id,TaskId=task.Id,Kind=ScheduleKind.Work,StartsAt=part.StartsAt,EndsAt=part.EndsAt,
                            IsAutomatic=true,SplitGroupId=group,OriginScheduleId=origin,TaskSnapshot=JsonSerializer.Serialize(snapshot,RevisionWriter.Json)};
                        origin??=block.Id;db.TaskSchedules.Add(block);changes.Add(new(block,null,"RecurrenceAdded"));busy.Add((block.StartsAt,block.EndsAt));
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
}

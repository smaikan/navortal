using System.Text.Json;
using Adhd.Application.Planning;
using Adhd.Application.Tasks;
using Adhd.Domain.Planning;
using Adhd.Domain.Recurrence;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Planning;

public sealed partial class PlanningStore
{
    public async Task<PlanEntryResult> AddEntryAsync(Guid userId, DateOnly date, AddPlanEntry command, string key, CancellationToken ct)
    {
        ValidateDate(date);
        if (string.IsNullOrWhiteSpace(key) || key.Length > 128) throw Invalid("idempotency_key_required", "Idempotency-Key gerekli; en çok128 karakter.");
        if (command.TaskId.HasValue == !string.IsNullOrWhiteSpace(command.Title) || !Enum.IsDefined(command.Priority)
            || command.EnergyDemand is {} energy && !Enum.IsDefined(energy)) throw Invalid("entry_invalid", "Görev veya yeni bir başlık seçin.");
        var payload = new {date,command}; var hash = Hash(payload);
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId,ct);
        var saved = await db.IdempotencyRecords.SingleOrDefaultAsync(x=>x.UserId==userId && x.Scope=="plan-entry-add" && x.Key==key,ct);
        if (saved is not null) {
            if(saved.RequestHash!=hash) throw Conflict("idempotency_conflict","Anahtar başka bir komutta kullanılmış.");
            return JsonSerializer.Deserialize<PlanEntryResult>(saved.Response,RevisionWriter.Json)! with {Replayed=true};
        }
        CheckVersion(state,command.ExpectedPlanningVersion); var now=clock.GetUtcNow();
        TaskItem task;
        if(command.TaskId is {} taskId) {
            task=await db.Tasks.SingleOrDefaultAsync(x=>x.UserId==userId && x.Id==taskId && x.DeletedAt==null,ct) ?? throw Missing("task_not_found","Görev bulunamadı.");
            Plannable(task);
        } else {
            var fields=TaskService.ValidateFields(new(command.Title!,Priority:command.Priority));
            task=new() {Id=Guid.CreateVersion7(),UserId=userId,Title=fields.Title,Priority=fields.Priority,EnergyDemand=command.EnergyDemand,CreatedAt=now,UpdatedAt=now,
                SortOrder=(await db.Tasks.Where(x=>x.UserId==userId && x.ParentTaskId==null && x.ArchivedAt==null).Select(x=>(decimal?)x.SortOrder).MaxAsync(ct)??0)+1024};
            db.Tasks.Add(task);TaskHistory.Append(db,task,"Created",null);
        }
        var plan=await Plan(userId,date,null,ct);
        var item=await db.DayItems.SingleOrDefaultAsync(x=>x.UserId==userId && x.LocalDate==date && x.TaskId==task.Id && x.State==DayItemState.Planned,ct);
        var before=item is null?null:RevisionWriter.Snapshot(item);
        if(item is not null && (!command.IsUrgent || item.CompletedAt is not null)) throw Conflict("day_item_exists","Bu görev bu günün planında zaten var.");
        if(item is null) {
            item=new() {Id=Guid.CreateVersion7(),UserId=userId,LocalDate=date,TaskId=task.Id,SortOrder=(await db.DayItems.Where(x=>x.UserId==userId && x.LocalDate==date).MaxAsync(x=>(int?)x.SortOrder,ct)??-1)+1,CreatedAt=now,UpdatedAt=now};
            db.DayItems.Add(item);
        } else {item.Version++;item.UpdatedAt=now;}
        if(command.IsUrgent) {
            var zone=TimeZoneInfo.FindSystemTimeZoneById(plan.TimeZoneId);var local=TimeZoneInfo.ConvertTime(now,zone);
            item.StartsAt=PlanTime.Date(now,plan.TimeZoneId)==date ? new DateTimeOffset(now.UtcTicks-now.UtcTicks%TimeSpan.TicksPerMinute,TimeSpan.Zero)
                : EntryStart(date,new TimeOnly(local.Hour,local.Minute),plan.TimeZoneId);
            item.EndsAt=null;item.IsUrgent=true;item.TimingIssue=null;
        }
        var changeSet=await History(userId,state,[new(item,before,"DayItemAdded",plan.Id)],now,command.IsUrgent?"Acil iş plana eklendi":"Plana eklendi",null,ct);
        var view=View(item,(task,null)) with {ChangeSetId=changeSet,PlanningVersion=state.PlanningVersion};
        if(task.ParentTaskId is not null) view=await Read(userId,item.Id,ct) with {ChangeSetId=changeSet,PlanningVersion=state.PlanningVersion};
        var result=new PlanEntryResult(view);
        db.IdempotencyRecords.Add(new() {UserId=userId,Scope="plan-entry-add",Key=key,RequestHash=hash,Response=JsonSerializer.Serialize(result,RevisionWriter.Json),CreatedAt=now});
        await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return result;
    }
    internal static DateTimeOffset EntryStart(DateOnly date,TimeOnly time,string zone) {
        try {return RecurrenceRules.Resolve(new(date,zone,DueTime:time,Gap:GapPolicy.Reject,Overlap:OverlapPolicy.Earlier),date).DueAt!.Value;}
        catch(RecurrenceTimeException) {throw Invalid("entry_time_invalid","Bu yerel saat kullanılamıyor. Başka saat seçin.");}
    }
    public async Task<DayItemView> SetItemTimeAsync(Guid userId,Guid id,UpdateDayItemTime command,CancellationToken ct)
    {
        await using var tx=await db.Database.BeginTransactionAsync(ct);var state=await Lock(userId,ct);CheckVersion(state,command.ExpectedPlanningVersion);
        var item=await Current(userId,id,command.Version,ct);var plan=await Plan(userId,item.LocalDate,null,ct);
        if(item.IsUrgent && command.StartsAt is null) throw Invalid("entry_start_required","Acil işin başlangıç saatini seçin.");
        if(command.EndsAt is {} end && (command.StartsAt is not {} start || end<=start || end-start>TimeSpan.FromDays(1))) throw Invalid("entry_range_invalid","Bitiş başlangıçtan sonra, en çok24 saat içinde olmalı.");
        if(command.StartsAt is {} first && PlanTime.Date(first,plan.TimeZoneId)!=item.LocalDate) throw Invalid("entry_day_mismatch","Başlangıç seçili günde olmalı.");
        if(!item.IsUrgent && command.EndsAt is not null) throw Invalid("entry_use_schedule","Tam saat aralığı için saatli plan bloğunu kullanın.");
        var before=RevisionWriter.Snapshot(item);item.StartsAt=command.StartsAt?.ToUniversalTime();item.EndsAt=command.EndsAt?.ToUniversalTime();item.TimingIssue=null;item.Version++;item.UpdatedAt=clock.GetUtcNow();
        var set=await History(userId,state,[new(item,before,"DayItemTimeChanged",plan.Id)],item.UpdatedAt,"Plan saati düzenlendi",null,ct);
        await tx.CommitAsync(ct);return await Read(userId,id,ct) with {ChangeSetId=set,PlanningVersion=state.PlanningVersion};
    }
}

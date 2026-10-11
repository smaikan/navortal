using System.Text.Json;
using Adhd.Application.Planning;
using Adhd.Domain.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Planning;
public sealed partial class PlanningStore
{
    public async Task<DayDeferralOutcome> DeferTasksAsync(Guid userId,DateOnly sourceDate,DeferTasksSelection command,string key,CancellationToken ct)
    {
        ValidateDate(sourceDate);
        if(string.IsNullOrWhiteSpace(key)||key.Length>128)throw Invalid("idempotency_key_required","Idempotency-Key gerekli; en çok128 karakter.");
        command=command with{Tasks=command.Tasks.OrderBy(x=>x.TaskId).ToArray()};
        foreach(var target in command.Tasks){ValidateDate(target.TargetDate);if(target.TargetDate<=sourceDate)throw Invalid("defer_target_invalid","Kaynak günden sonraki bir günü seçin.");}
        var hash=Hash(new{sourceDate,command});const string scope="task-defer";
        await using var tx=await db.Database.BeginTransactionAsync(ct);var state=await Lock(userId,ct);
        var receipt=await db.IdempotencyRecords.SingleOrDefaultAsync(x=>x.UserId==userId&&x.Scope==scope&&x.Key==key,ct);
        if(receipt is not null){if(receipt.RequestHash!=hash)throw Conflict("idempotency_conflict","Anahtar başka bir komutta kullanılmış.");return new(JsonSerializer.Deserialize<DayDeferralResult>(receipt.Response,RevisionWriter.Json)!,true);}
        CheckVersion(state,command.ExpectedPlanningVersion);
        var planId=await db.DailyPlans.Where(x=>x.UserId==userId&&x.LocalDate==sourceDate).Select(x=>(Guid?)x.Id).SingleOrDefaultAsync(ct);
        var taskIds=command.Tasks.Select(x=>x.TaskId).ToArray();
        var blocks=await db.TaskSchedules.AsNoTracking().Where(x=>x.UserId==userId&&x.DailyPlanId==planId&&x.TaskId.HasValue&&taskIds.Contains(x.TaskId.Value)&&x.Kind==ScheduleKind.Work&&x.State==ScheduleState.Planned&&x.CompletedAt==null).Take(501).ToArrayAsync(ct);
        var items=await db.DayItems.AsNoTracking().Where(x=>x.UserId==userId&&x.LocalDate==sourceDate&&taskIds.Contains(x.TaskId)&&x.State==DayItemState.Planned&&x.CompletedAt==null).Take(501).ToArrayAsync(ct);
        if(blocks.Length+items.Length>500)throw Invalid("defer_selection_invalid","Bir işlemde en fazla500 plan öğesi ertelenebilir.");
        var found=blocks.Select(x=>x.TaskId!.Value).Concat(items.Select(x=>x.TaskId)).ToHashSet();
        if(taskIds.Any(id=>!found.Contains(id)))throw Missing("task_not_found","Seçilen görevin bu günde bitmemiş plan öğesi bulunamadı.");
        var captures=new List<(DeferDaySelection Command,DeferralCapture Capture)>();
        foreach(var group in command.Tasks.GroupBy(x=>x.TargetDate).OrderBy(x=>x.Key))
        {
            var ids=group.Select(x=>x.TaskId).ToHashSet();
            var selection=new DeferDaySelection(group.Key,blocks.Where(x=>ids.Contains(x.TaskId!.Value)).Select(x=>new DayItemMoveEntry(x.Id,x.Version)).ToArray(),items.Where(x=>ids.Contains(x.TaskId)).Select(x=>new DayItemMoveEntry(x.Id,x.Version)).ToArray(),command.ExpectedPlanningVersion,false,"Görev ertele");
            var capture=await CaptureDeferral(userId,sourceDate,selection,ct);
            if(!capture.Preview.CanApply)throw Conflict(capture.Preview.Issues[0].Code,capture.Preview.Issues[0].Message);
            captures.Add((selection,capture));
        }
        var deltas=new List<PlanDelta>();var dayDeltas=new List<DayDelta>();var targetItems=new List<DayItem>();var changedBlocks=new List<TaskSchedule>();var now=clock.GetUtcNow();
        foreach(var (selection,capture) in captures)
        {
            var result=await ApplyDeferralTarget(userId,sourceDate,selection,capture,now,ct);
            deltas.AddRange(result.Deltas);dayDeltas.AddRange(result.DayDeltas);targetItems.AddRange(result.TargetItems);changedBlocks.AddRange(result.Blocks);
        }
        var changeSet=Guid.CreateVersion7();var revisions=await RevisionWriter.Write(db,userId,deltas,now,"Defer","Görev ertele",changeSet,false,ct,"defer-v1",dayDeltas:dayDeltas);
        state.PlanningVersion++;state.UpdatedAt=now;await db.SaveChangesAsync(ct);
        var views=new List<DayItemView>();foreach(var item in targetItems.OrderBy(x=>x.LocalDate).ThenBy(x=>x.SortOrder).ThenBy(x=>x.Id))views.Add(await Read(userId,item.Id,ct));
        var value=new DayDeferralResult(changeSet,state.PlanningVersion,changedBlocks.Select(RevisionWriter.View).ToArray(),views.ToArray(),revisions);
        db.IdempotencyRecords.Add(new(){UserId=userId,Scope=scope,Key=key,RequestHash=hash,Response=JsonSerializer.Serialize(value,RevisionWriter.Json),CreatedAt=now});await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return new(value,false);
    }
}

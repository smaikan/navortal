using System.Text.Json;
using Adhd.Application.Common;
using Adhd.Application.Jobs;
using Adhd.Application.Recurrence;
using Adhd.Domain.Jobs;
using Adhd.Domain.Planning;
using Adhd.Domain.Recurrence;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Jobs;

internal sealed record ResolvedRecurrence(Guid TemplateId, MaterializeRecurrence Command);
internal sealed record RecurrenceWindowPayload(Guid TemplateId, long Version, DateOnly FromDate, DateOnly ToDate);
public sealed partial class OutboxHandler
{
    private async Task<bool> Recurrence(OutboxClaim claim, CancellationToken ct)
    {
        JobEffectReceipt receipt; ResolvedRecurrence? input = null;
        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            await Lock(claim.UserId, ct); await Lease(claim, ct); var held = await db.JobEffects.SingleOrDefaultAsync(x => x.OutboxId == claim.Id && x.UserId == claim.UserId, ct);
            if (held is not null && held.State != JobEffectState.Prepared) return held.State == JobEffectState.Obsolete;
            receipt = held ?? new() { OutboxId = claim.Id, UserId = claim.UserId, CreatedAt = clock.GetUtcNow() }; if (held is null) db.JobEffects.Add(receipt);
            if (receipt.ResolvedInput is not null) input = JsonSerializer.Deserialize<ResolvedRecurrence>(receipt.ResolvedInput, RevisionWriter.Json)!;
            else
            {
                var template = await db.RecurrenceTemplates.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == claim.UserId && x.Id == claim.SourceId, ct);
                if (template is null || !template.Enabled || template.Version != claim.SourceVersion)
                {
                    receipt.State = JobEffectState.Obsolete; receipt.CompletedAt = clock.GetUtcNow(); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return true;
                }
                if (claim.Kind == "RecurrenceWindow")
                {
                    var payload = JsonSerializer.Deserialize<RecurrenceWindowPayload>(claim.Payload, RevisionWriter.Json)!;
                    var definition = await db.RecurrenceDefinitions.AsNoTracking().Where(x => x.UserId == claim.UserId && x.TemplateId == template.Id).OrderByDescending(x => x.Number).FirstAsync(ct); var rule = JsonSerializer.Deserialize<RecurrenceRule>(definition.Rule, RevisionWriter.Json)!;
                    if (payload.FromDate != PlanTime.Date(clock.GetUtcNow(), rule.TimeZoneId))
                    {
                        receipt.State = JobEffectState.Obsolete; receipt.CompletedAt = clock.GetUtcNow(); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return true;
                    }
                    input = new(template.Id, new(template.Version, payload.FromDate, payload.ToDate));
                }
                else
                {
                    var definition = await db.RecurrenceDefinitions.AsNoTracking().Where(x => x.UserId == claim.UserId && x.TemplateId == template.Id).OrderByDescending(x => x.Number).FirstAsync(ct); var rule = JsonSerializer.Deserialize<RecurrenceRule>(definition.Rule, RevisionWriter.Json)!;
                    var today = PlanTime.Date(clock.GetUtcNow(), rule.TimeZoneId); input = new(template.Id, new(template.Version, today, today.AddDays(RecurrenceRules.HorizonDays(rule))));
                }
                receipt.ResolvedInput = JsonSerializer.Serialize(input, RevisionWriter.Json); receipt.State = JobEffectState.Prepared;
            }
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        }
        bool obsolete = false;
        try { _ = await recurrence.MaterializeAsync(claim.UserId, input!.TemplateId, input.Command, $"job:{claim.Id}", ct); }
        catch (UseCaseException e) when (e.Code is "version_conflict" or "recurrence_disabled" or "recurrence_not_found") { obsolete = true; }
        // Makbuzla komut ayrı kaydedilir. Onaydan önce çökülürse aynı komut ve anahtarla dene.
        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            await Lock(claim.UserId, ct); var current = await db.JobEffects.SingleAsync(x => x.UserId == claim.UserId && x.OutboxId == claim.Id, ct);
            current.State = obsolete ? JobEffectState.Obsolete : JobEffectState.Completed; current.CompletedAt = clock.GetUtcNow(); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        }
        return obsolete;
    }
}

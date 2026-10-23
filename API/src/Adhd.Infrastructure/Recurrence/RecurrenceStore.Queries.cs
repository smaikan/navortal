using Adhd.Application.Recurrence;
using Adhd.Domain.Planning;
using Adhd.Domain.Recurrence;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Recurrence;

public sealed partial class RecurrenceStore
{
    public async Task<RecurrenceDefinitionPage> DefinitionsAsync(Guid userId, Guid id, int offset, int limit, CancellationToken ct)
    {
        Page(offset, limit); await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct); _ = await Find(userId, id, ct);
        var q = db.RecurrenceDefinitions.AsNoTracking().Where(x => x.UserId == userId && x.TemplateId == id); var total = await q.CountAsync(ct); var rows = await q.OrderByDescending(x => x.Number).Skip(offset).Take(limit).ToArrayAsync(ct);
        return new(rows.Select(x => new RecurrenceDefinitionView(x.Id, x.Number, x.EffectiveFrom, Read<Adhd.Domain.Recurrence.RecurrenceRule>(x.Rule), Read<RecurringTaskDefaults>(x.TaskDefaults), x.CreatedAt)).ToArray(), offset, limit, total);
    }
    // Henüz gerçek kaydı olmayan otomatik rutin günlerini okuma anında hesaplar, hiçbir şey yazmaz. Plan veya kapasite değildir.
    public async Task<RecurrenceProjectionView> ProjectionAsync(Guid userId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        Date(from); Date(to); if (to.DayNumber - from.DayNumber is < 0 or > 41) throw Invalid("recurrence_projection_window_invalid", "1–42 günlük açık tarih aralığı seçin.");
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var templates = await db.RecurrenceTemplates.AsNoTracking().Where(x => x.UserId == userId && x.Enabled).Select(x => new { x.Id, x.Version }).ToArrayAsync(ct); var ids = templates.Select(x => x.Id).ToArray();
        var definitions = (await db.RecurrenceDefinitions.AsNoTracking().Where(x => x.UserId == userId && ids.Contains(x.TemplateId) && x.EffectiveFrom <= to).ToArrayAsync(ct)).ToLookup(x => x.TemplateId);
        var marks = await db.RecurrenceOccurrences.AsNoTracking().Where(x => x.UserId == userId && ids.Contains(x.TemplateId) && x.LocalDate >= from && x.LocalDate <= to).Select(x => new { x.TemplateId, x.LocalDate, x.State, x.Reason, x.TaskId }).ToArrayAsync(ct);
        var held = marks.Where(x => !OccurrenceReason.Revivable(x.State, x.Reason, x.TaskId)).Select(x => (x.TemplateId, x.LocalDate)).ToHashSet(); var now = clock.GetUtcNow(); var items = new List<RecurrenceProjectionItem>();
        foreach (var template in templates)
        {
            var parsed = definitions[template.Id].OrderByDescending(x => x.Number).Select(x => (x.EffectiveFrom, Rule: Read<RecurrenceRule>(x.Rule), Task: Read<RecurringTaskDefaults>(x.TaskDefaults))).ToArray();
            for (var date = from; date <= to; date = date.AddDays(1))
            {
                var applied = parsed.FirstOrDefault(x => x.EffectiveFrom <= date); if (applied.Rule is not { AutoAddToPlan: true } rule || held.Contains((template.Id, date))) continue;
                if (date >= PlanTime.Date(now, rule.TimeZoneId) && RecurrenceRules.Matches(rule, date)) items.Add(new(template.Id, template.Version, date, applied.Task.Title, rule.StartTime, applied.Task.EstimatedSeconds));
            }
        }
        var result = new RecurrenceProjectionView(from, to, items.OrderBy(x => x.LocalDate).ThenBy(x => x.StartTime is null).ThenBy(x => x.StartTime).ThenBy(x => x.Title, StringComparer.Ordinal).ThenBy(x => x.TemplateId).ToArray());
        await tx.CommitAsync(ct); return result;
    }
    public async Task<RecurrenceTemplateView> GetAsync(Guid userId, Guid id, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct); return View(await Find(userId, id, ct), await Head(userId, id, ct));
    }
    public async Task<RecurrenceTemplatePage> ListAsync(Guid userId, int offset, int limit, CancellationToken ct)
    {
        Page(offset, limit); await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var q = db.RecurrenceTemplates.AsNoTracking().Where(x => x.UserId == userId); var total = await q.CountAsync(ct); var templates = await q.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).Skip(offset).Take(limit).ToArrayAsync(ct); var ids = templates.Select(x => x.Id).ToArray();
        var definitions = await db.RecurrenceDefinitions.AsNoTracking().Where(x => x.UserId == userId && ids.Contains(x.TemplateId)).GroupBy(x => x.TemplateId).Select(g => g.OrderByDescending(x => x.Number).First()).ToDictionaryAsync(x => x.TemplateId, ct);
        return new(templates.Select(t => View(t, definitions[t.Id])).ToArray(), offset, limit, total);
    }
    public async Task<OccurrencePage> OccurrencesAsync(Guid userId, Guid id, DateOnly from, DateOnly to, int offset, int limit, CancellationToken ct)
    {
        Window(from, to); Page(offset, limit); await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct); _ = await Find(userId, id, ct);
        var q = db.RecurrenceOccurrences.AsNoTracking().Where(x => x.UserId == userId && x.TemplateId == id && x.LocalDate >= from && x.LocalDate <= to); var total = await q.CountAsync(ct);
        var rows = await q.OrderBy(x => x.LocalDate).Skip(offset).Take(limit).ToArrayAsync(ct); return new(await Views(userId, rows, ct), offset, limit, total);
    }
    public async Task<OccurrenceView> ForTaskAsync(Guid userId, Guid taskId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var row = await db.RecurrenceOccurrences.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.TaskId == taskId, ct) ?? throw Missing("occurrence_not_found"); return (await Views(userId, [row], ct))[0];
    }
}

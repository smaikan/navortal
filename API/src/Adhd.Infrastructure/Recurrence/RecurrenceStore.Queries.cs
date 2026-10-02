using Adhd.Application.Recurrence;
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

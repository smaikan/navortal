using System.Data;
using System.Text.Json;
using Adhd.Application.Planning;
using Adhd.Domain.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Planning;

public sealed partial class PlanningStore
{
    public async Task<DailyPlanView> DayAsync(Guid userId, DateOnly date, CancellationToken ct)
    {
        ValidateDate(date); await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var version = await db.PlanningStates.Where(x => x.UserId == userId).Select(x => x.PlanningVersion).SingleAsync(ct);
        var plan = await db.DailyPlans.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.LocalDate == date, ct);
        return plan is null ? new(null, date, (await preferences.ReadAsync(userId, ct)).Values.TimeZoneId, null, null, 0, version)
            : new(plan.Id, date, plan.TimeZoneId, plan.CurrentRevisionId, plan.BaselineRevisionId, plan.Version, version);
    }
    public async Task<ScheduleView> GetAsync(Guid userId, Guid id, CancellationToken ct) => RevisionWriter.View(await Find(userId, id, ct));
    public async Task<SchedulePage> ListAsync(Guid userId, DateTimeOffset from, DateTimeOffset to, int offset, int limit, CancellationToken ct)
    {
        from = from.ToUniversalTime(); to = to.ToUniversalTime();
        if (from >= to || to - from > TimeSpan.FromDays(366)) throw Invalid("range_invalid", "Pozitif, en çok366 günlük tarih aralığı gerekli.");
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var query = db.TaskSchedules.AsNoTracking().Where(x => x.UserId == userId && x.State == ScheduleState.Planned && x.StartsAt < to && x.EndsAt > from);
        var total = await query.CountAsync(ct); var rows = await query.OrderBy(x => x.StartsAt).ThenBy(x => x.Id).Skip(offset).Take(limit).ToArrayAsync(ct);
        return new(rows.Select(RevisionWriter.View).ToArray(), offset, limit, total);
    }
    public async Task<RevisionPage> RevisionsAsync(Guid userId, DateOnly date, int offset, int limit, CancellationToken ct)
    {
        ValidateDate(date); await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var query = from r in db.PlanRevisions.AsNoTracking() join p in db.DailyPlans.AsNoTracking() on r.DailyPlanId equals p.Id where r.UserId == userId && p.UserId == userId && p.LocalDate == date select r;
        var total = await query.CountAsync(ct); var rows = await query.OrderByDescending(x => x.Number).Skip(offset).Take(limit).ToArrayAsync(ct);
        return new(rows.Select(RevisionWriter.View).ToArray(), offset, limit, total);
    }
    public async Task<RevisionView> RevisionAsync(Guid userId, Guid id, CancellationToken ct) => RevisionWriter.View(await db.PlanRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id, ct) ?? throw Missing("revision_not_found", "Revizyon bulunamadı."));
    public async Task<RevisionItemPage> ItemsAsync(Guid userId, Guid id, int offset, int limit, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct); _ = await RevisionAsync(userId, id, ct);
        var query = db.PlanRevisionItems.AsNoTracking().Where(x => x.UserId == userId && x.RevisionId == id); var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(x => x.ScheduleId).Skip(offset).Take(limit).ToArrayAsync(ct);
        return new(rows.Select(x => new RevisionItemView(x.Id, x.RevisionId, JsonSerializer.Deserialize<ScheduleView>(x.Snapshot, RevisionWriter.Json)!)).ToArray(), offset, limit, total);
    }
    public async Task<RevisionChangePage> ChangesAsync(Guid userId, Guid id, int offset, int limit, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct); _ = await RevisionAsync(userId, id, ct);
        var query = db.PlanRevisionChanges.AsNoTracking().Where(x => x.UserId == userId && x.RevisionId == id); var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(x => x.Id).Skip(offset).Take(limit).ToArrayAsync(ct);
        T? Read<T>(string? json) where T : class => json is null ? null : JsonSerializer.Deserialize<T>(json, RevisionWriter.Json);
        return new(rows.Select(x => x.DayItemId is null
            ? new RevisionChangeView(x.Id, x.ScheduleId, x.Type, Read<ScheduleView>(x.Before), Read<ScheduleView>(x.After), x.ConflictsAccepted)
            : new RevisionChangeView(x.Id, null, x.Type, null, null, false, x.DayItemId, Read<DayItemSnapshot>(x.Before), Read<DayItemSnapshot>(x.After))).ToArray(), offset, limit, total);
    }
}

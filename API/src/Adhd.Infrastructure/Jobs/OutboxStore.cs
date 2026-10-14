using Adhd.Application.Common;
using Adhd.Application.Jobs;
using Adhd.Domain.Jobs;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Jobs;

internal sealed class ClaimedRow
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Kind { get; set; } = "";
    public Guid SourceId { get; set; }
    public long SourceVersion { get; set; }
    public string Payload { get; set; } = "{}";
    public Guid LeaseId { get; set; }
    public DateTimeOffset LeaseUntil { get; set; }
    public int Attempts { get; set; }
}
public sealed class OutboxStore(PlannerDbContext db, TimeProvider clock) : IOutboxStore
{
    public async Task<OutboxClaim[]> ClaimAsync(int limit, CancellationToken ct)
    {
        if (limit is < 1 or > 100) throw Invalid(); var now = clock.GetUtcNow(); var lease = Guid.NewGuid(); var until = now.AddMinutes(2);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE outbox_messages SET "State"='Failed',"LeaseId"=NULL,"LeaseUntil"=NULL,"LastErrorCode"='lease_expired_at_limit',"Version"="Version"+1
            WHERE "State"='Processing' AND "LeaseUntil"<={now} AND "Attempts">={JobRetry.MaxAttempts}
            """, ct);
        var rows = await db.Database.SqlQuery<ClaimedRow>($"""
            WITH ranked AS MATERIALIZED (SELECT "Id","AvailableAt",
                ROW_NUMBER() OVER (PARTITION BY "UserId" ORDER BY "AvailableAt","Id") AS owner_slot
                FROM outbox_messages WHERE "Attempts"<{JobRetry.MaxAttempts}
                AND (("State"='Pending' AND "AvailableAt"<={now}) OR ("State"='Processing' AND "LeaseUntil"<={now}))
            ), picked AS (SELECT m."Id" FROM outbox_messages m JOIN ranked r ON r."Id"=m."Id"
                WHERE m."Attempts"<{JobRetry.MaxAttempts}
                AND ((m."State"='Pending' AND m."AvailableAt"<={now}) OR (m."State"='Processing' AND m."LeaseUntil"<={now}))
                ORDER BY r.owner_slot,r."AvailableAt",m."Id" FOR UPDATE OF m SKIP LOCKED LIMIT {limit})
            UPDATE outbox_messages m SET "State"='Processing',"Attempts"=m."Attempts"+1,"LeaseId"={lease},"LeaseUntil"={until},"Version"=m."Version"+1
            FROM picked p WHERE m."Id"=p."Id" RETURNING m."Id",m."UserId",m."Kind",m."SourceId",m."SourceVersion",m."Payload"::text AS "Payload",m."LeaseId",m."LeaseUntil",m."Attempts"
            """).ToArrayAsync(ct);
        return rows.Select(x => new OutboxClaim(x.Id, x.UserId, x.Kind, x.SourceId, x.SourceVersion, x.Payload, x.LeaseId, x.LeaseUntil, x.Attempts)).ToArray();
    }
    public async Task CompleteAsync(OutboxClaim claim, bool obsolete, CancellationToken ct)
    {
        var state = obsolete ? "Obsolete" : "Completed"; var now = clock.GetUtcNow();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE outbox_messages SET "State"={state},"CompletedAt"={now},"LeaseId"=NULL,"LeaseUntil"=NULL,"LastErrorCode"=NULL,"Version"="Version"+1
            WHERE "Id"={claim.Id} AND "UserId"={claim.UserId} AND "State"='Processing' AND "LeaseId"={claim.LeaseId}
            """, ct);
    }
    public async Task FailAsync(OutboxClaim claim, string code, CancellationToken ct)
    {
        var state = claim.Attempts >= JobRetry.MaxAttempts ? "Failed" : "Pending"; var next = clock.GetUtcNow().Add(JobRetry.Delay(claim.Attempts));
        if (code.Length > 100) code = code[..100];
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE outbox_messages SET "State"={state},"AvailableAt"={next},"LeaseId"=NULL,"LeaseUntil"=NULL,"LastErrorCode"={code},"Version"="Version"+1
            WHERE "Id"={claim.Id} AND "UserId"={claim.UserId} AND "State"='Processing' AND "LeaseId"={claim.LeaseId}
            """, ct);
    }
    public async Task DeferAsync(OutboxClaim claim, DateTimeOffset until, bool countAttempt, CancellationToken ct)
    {
        var state = countAttempt && claim.Attempts >= JobRetry.MaxAttempts ? "Failed" : "Pending";
        var attempts = countAttempt ? claim.Attempts : Math.Max(0, claim.Attempts - 1);
        var code = countAttempt ? "push_retry" : "policy_deferred";
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE outbox_messages SET "State"={state},"Attempts"={attempts},"AvailableAt"={until},"LeaseId"=NULL,"LeaseUntil"=NULL,"LastErrorCode"={code},"Version"="Version"+1
            WHERE "Id"={claim.Id} AND "UserId"={claim.UserId} AND "State"='Processing' AND "LeaseId"={claim.LeaseId}
            """, ct);
    }
    public async Task<OutboxPage> ListAsync(Guid userId, OutboxState? state, int offset, int limit, CancellationToken ct)
    {
        Page(offset, limit); if (state.HasValue && !Enum.IsDefined(state.Value)) throw Invalid(); await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var q = db.Outbox.AsNoTracking().Where(x => x.UserId == userId && (!state.HasValue || x.State == state)); var total = await q.CountAsync(ct); var rows = await q.OrderByDescending(x => x.OccurredAt).ThenByDescending(x => x.Id).Skip(offset).Take(limit).ToArrayAsync(ct); return new(rows.Select(View).ToArray(), offset, limit, total);
    }
    public async Task<OutboxView> RetryAsync(Guid userId, Guid id, long version, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); _ = await db.PlanningStates.FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\"={userId} FOR UPDATE").SingleAsync(ct);
        var row = await db.Outbox.FromSqlInterpolated($"SELECT * FROM outbox_messages WHERE \"UserId\"={userId} AND \"Id\"={id} FOR UPDATE").SingleOrDefaultAsync(ct) ?? throw new UseCaseException(ErrorKind.NotFound, "outbox_not_found", "İş kaydı bulunamadı.");
        if (row.Version != version || row.State != OutboxState.Failed) throw new UseCaseException(ErrorKind.Conflict, "job_retry_conflict", "Yalnız güncel başarısız işi yeniden deneyebilirsiniz.");
        row.State = OutboxState.Pending; row.Attempts = 0; row.AvailableAt = clock.GetUtcNow(); row.LastErrorCode = null; row.Version++; await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return View(row);
    }
    public async Task<ReminderPage> RemindersAsync(Guid userId, ReminderState? state, int offset, int limit, CancellationToken ct)
    {
        Page(offset, limit); if (state.HasValue && !Enum.IsDefined(state.Value)) throw Invalid(); await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var q = db.ReminderWork.AsNoTracking().Where(x => x.UserId == userId && (!state.HasValue || x.State == state)); var total = await q.CountAsync(ct); var rows = await q.OrderBy(x => x.DueAt).ThenBy(x => x.Id).Skip(offset).Take(limit).ToArrayAsync(ct);
        return new(rows.Select(x => new ReminderView(x.Id, x.Kind, x.SourceId, x.TaskId, x.DailyPlanId, x.RevisionId, x.DueAt, x.State, x.HandledAt)).ToArray(), offset, limit, total);
    }
    private static OutboxView View(OutboxMessage x) => new(x.Id, x.Kind, x.SourceId, x.SourceVersion, x.State, x.Attempts, x.OccurredAt, x.AvailableAt, x.LeaseUntil, x.LastErrorCode, x.CompletedAt, x.Version);
    private static void Page(int offset, int limit) { if (offset is < 0 or > 100000 || limit is < 1 or > 100) throw Invalid(); }
    private static UseCaseException Invalid() => new(ErrorKind.Validation, "job_query_invalid", "Geçerli iş türü ve limit1..100/offset0..100000 seçin.");
}

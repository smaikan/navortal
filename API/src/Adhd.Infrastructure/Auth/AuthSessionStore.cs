using Adhd.Application.Auth;
using Adhd.Domain.Users;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Npgsql;

namespace Adhd.Infrastructure.Auth;

// Oturumların süreçte kısa önbelleği var. Buradaki iptal kaydı hemen siler, bu sunucuda anında etkili olur.
public sealed class AuthSessionStore(PlannerDbContext db, IMemoryCache cache) : IAuthSessionStore
{
    public static readonly TimeSpan CacheFor = TimeSpan.FromSeconds(15);
    private static string Key(Guid sessionId) => $"auth-session:{sessionId:N}";
    internal static void Invalidate(IMemoryCache cache, Guid sessionId) => cache.Remove(Key(sessionId));

    public async Task<Guid?> CreateAsync(Guid userId, string userAgentFamily, string? adoptedTokenHash, DateTimeOffset now, CancellationToken ct, string? expectedPasswordHash = null)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var user = await db.Users.FromSqlInterpolated($"SELECT * FROM users WHERE \"Id\" = {userId} FOR UPDATE").AsNoTracking().SingleOrDefaultAsync(ct);
        if (user is null || user.PasswordHash != expectedPasswordHash) return null;
        var session = new AuthSession
        {
            Id = Guid.CreateVersion7(), UserId = userId, CreatedAt = now, LastSeenAt = now,
            UserAgentFamily = userAgentFamily, AdoptedTokenHash = adoptedTokenHash
        };
        db.AuthSessions.Add(session);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        { db.ChangeTracker.Clear(); return null; }
        await tx.CommitAsync(ct);
        return session.Id;
    }

    public async Task<SessionState?> FindAsync(Guid userId, Guid sessionId, CancellationToken ct)
    {
        if (!cache.TryGetValue(Key(sessionId), out SessionState? state))
        {
            state = await db.AuthSessions.AsNoTracking().Where(x => x.Id == sessionId)
                .Select(x => new SessionState(x.Id, x.UserId, x.LastSeenAt, x.RevokedAt)).SingleOrDefaultAsync(ct);
            if (state is not null) cache.Set(Key(sessionId), state, CacheFor);
        }
        return state?.UserId == userId ? state : null;
    }

    public async Task TouchAsync(Guid sessionId, DateTimeOffset now, CancellationToken ct)
    {
        await db.AuthSessions.Where(x => x.Id == sessionId && x.RevokedAt == null && x.LastSeenAt < now)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.LastSeenAt, now), ct);
        cache.Remove(Key(sessionId));
    }

    public async Task<bool> RevokeAsync(Guid userId, Guid sessionId, DateTimeOffset now, CancellationToken ct)
    {
        var changed = await db.AuthSessions.Where(x => x.Id == sessionId && x.UserId == userId && x.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, now), ct);
        cache.Remove(Key(sessionId));
        return changed == 1;
    }

    public Task<DateTimeOffset?> ValidAfterAsync(Guid userId, CancellationToken ct) =>
        db.AuthSessionCutoffs.AsNoTracking().Where(x => x.UserId == userId).Select(x => (DateTimeOffset?)x.ValidAfter).SingleOrDefaultAsync(ct);

    public async Task<int> RevokeAllAsync(Guid userId, DateTimeOffset now, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var ids = await db.AuthSessions.Where(x => x.UserId == userId && x.RevokedAt == null).Select(x => x.Id).ToArrayAsync(ct);
        var changed = await db.AuthSessions.Where(x => x.UserId == userId && x.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, now), ct);
        var cutoff = await db.AuthSessionCutoffs.SingleOrDefaultAsync(x => x.UserId == userId, ct);
        if (cutoff is null) db.AuthSessionCutoffs.Add(new() { UserId = userId, ValidAfter = now }); else cutoff.ValidAfter = now;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        foreach (var id in ids) cache.Remove(Key(id));
        return changed;
    }
}

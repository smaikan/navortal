using Adhd.Application.Auth;
using Adhd.Domain.Users;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Adhd.Infrastructure.Auth;

public sealed class PasswordChangeStore(PlannerDbContext db, IMemoryCache cache) : IPasswordChangeStore
{
    public async Task<(AppUser User, Guid SessionId)?> ChangeAsync(Guid userId, Guid sessionId, string? expectedHash, string passwordHash, string family, DateTimeOffset now, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var user = await db.Users.FromSqlInterpolated($"SELECT * FROM users WHERE \"Id\" = {userId} FOR UPDATE").AsNoTracking().SingleOrDefaultAsync(ct);
        if (user is null || user.PasswordHash != expectedHash || !await db.AuthSessions.AnyAsync(x => x.Id == sessionId && x.UserId == userId && x.RevokedAt == null, ct)) return null;
        var ids = await db.AuthSessions.Where(x => x.UserId == userId && x.RevokedAt == null).Select(x => x.Id).ToArrayAsync(ct);
        await db.Users.Where(x => x.Id == userId).ExecuteUpdateAsync(s => s.SetProperty(x => x.PasswordHash, passwordHash).SetProperty(x => x.Version, x => x.Version + 1), ct);
        await db.PasswordResets.Where(x => x.UserId == userId && x.UsedAt == null).ExecuteUpdateAsync(s => s.SetProperty(x => x.UsedAt, now), ct);
        await db.AuthSessions.Where(x => x.UserId == userId && x.RevokedAt == null).ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, now), ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO auth_session_cutoffs (\"UserId\", \"ValidAfter\") VALUES ({userId}, {now}) ON CONFLICT (\"UserId\") DO UPDATE SET \"ValidAfter\" = GREATEST(auth_session_cutoffs.\"ValidAfter\", EXCLUDED.\"ValidAfter\")", ct);
        var session = new AuthSession { Id = Guid.CreateVersion7(), UserId = userId, CreatedAt = now, LastSeenAt = now, UserAgentFamily = family };
        db.AuthSessions.Add(session);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        foreach (var id in ids) AuthSessionStore.Invalidate(cache, id);
        user.PasswordHash = passwordHash;
        user.Version++;
        return (user, session.Id);
    }
}

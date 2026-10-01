using Adhd.Application.Auth;
using Adhd.Domain.Users;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Auth;

public sealed class PasswordResetStore(PlannerDbContext db) : IPasswordResetStore
{
    public async Task AddAsync(PasswordResetRequest request, CancellationToken ct)
    { db.PasswordResets.Add(request); await db.SaveChangesAsync(ct); }
    public async Task DeleteAsync(Guid id, CancellationToken ct) =>
        await db.PasswordResets.Where(x => x.Id == id).ExecuteDeleteAsync(ct);
    public Task<AppUser?> FindUserAsync(string tokenHash, DateTimeOffset now, CancellationToken ct) =>
        (from reset in db.PasswordResets.AsNoTracking() join user in db.Users.AsNoTracking() on reset.UserId equals user.Id
         where reset.TokenHash == tokenHash && reset.UsedAt == null && reset.ExpiresAt > now select user).SingleOrDefaultAsync(ct);
    public async Task<bool> ConsumeAsync(Guid userId, string tokenHash, string passwordHash, DateTimeOffset now, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Aynı hesaba ait sıfırlamaları sıraya koy. Başka açık bağlantılardan gelenler de dahil
        await db.Users.FromSqlInterpolated($"SELECT * FROM users WHERE \"Id\" = {userId} FOR UPDATE").AsNoTracking().SingleAsync(ct);
        var claimed = await db.PasswordResets.Where(x => x.UserId == userId && x.TokenHash == tokenHash && x.UsedAt == null && x.ExpiresAt > now)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.UsedAt, now), ct);
        if (claimed != 1) return false;
        await db.Users.Where(x => x.Id == userId && x.PasswordHash != null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.PasswordHash, passwordHash).SetProperty(x => x.Version, x => x.Version + 1), ct);
        await db.PasswordResets.Where(x => x.UserId == userId && x.UsedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.UsedAt, now), ct);
        await tx.CommitAsync(ct);
        return true;
    }
}

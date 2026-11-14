using System.Security.Cryptography;
using System.Text;
using Adhd.Application.Common;
using Adhd.Application.Notifications;
using Adhd.Domain.Notifications;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Adhd.Infrastructure.Notifications;

public sealed partial class NotificationStore
{
    public async Task<SubscriptionView[]> SubscriptionsAsync(Guid user, CancellationToken ct) => (await db.PushSubscriptions.AsNoTracking().Where(x => x.UserId == user).OrderByDescending(x => x.Active).ThenByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).Take(100).ToArrayAsync(ct)).Select(View).ToArray();
    public async Task<SubscriptionView> SubscribeAsync(Guid user, RegisterSubscription command, CancellationToken ct)
    {
        Uri uri;
        try { uri = PushEndpoints.Parse(command.Endpoint); PushEndpoints.Keys(command.P256dh, command.Auth); }
        catch (Exception e) when (e is ArgumentException or FormatException or CryptographicException) { throw Invalid("push_subscription_invalid"); }
        if (command.Label is null || command.Label.Length > 100 || command.ExpiresAt <= clock.GetUtcNow()) throw Invalid("push_subscription_invalid");
        var endpoint = uri.AbsoluteUri; var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(endpoint)));
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(user, ct);
        var row = await db.PushSubscriptions.SingleOrDefaultAsync(x => x.EndpointHash == hash, ct);
        if (row is not null && row.UserId != user) throw new UseCaseException(ErrorKind.Conflict, "push_endpoint_owned", "Tarayıcı aboneliği önce önceki hesaptan kaldırılmalı ve yeniden oluşturulmalı.");
        if (row?.Active != true && await db.PushSubscriptions.CountAsync(x => x.UserId == user && x.Active, ct) >= 20)
            throw Invalid("push_subscription_limit");
        if (row is null)
        {
            row = new() { Id = Guid.CreateVersion7(), UserId = user, Endpoint = endpoint, EndpointHash = hash, CreatedAt = clock.GetUtcNow(), Version = 0 }; db.PushSubscriptions.Add(row);
        }
        row.P256dh = command.P256dh; row.Auth = command.Auth; row.Label = command.Label.Trim(); row.ExpiresAt = command.ExpiresAt?.ToUniversalTime(); row.Active = true; row.Version++;
        try { await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation }) { throw new UseCaseException(ErrorKind.Conflict, "push_endpoint_owned", "Tarayıcı aboneliği zaten kayıtlı."); }
        return View(row);
    }
    public async Task UnsubscribeAsync(Guid user, Guid id, long version, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(user, ct); var row = await db.PushSubscriptions.SingleOrDefaultAsync(x => x.UserId == user && x.Id == id, ct) ?? throw Missing(); Check(row.Version, version);
        row.Active = false; row.Version++; await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
    private static SubscriptionView View(PushSubscriptionRecord s) => new(s.Id, new Uri(s.Endpoint).Host, s.Label, s.Active, s.ExpiresAt, s.Version);
}

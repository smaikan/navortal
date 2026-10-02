using Adhd.Application.Common;
using Adhd.Application.Jobs;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Adhd.Infrastructure.Jobs;

public sealed class OutboxDispatcher(IOutboxStore store, IServiceScopeFactory scopes, ILogger<OutboxDispatcher> logger) : IOutboxDispatcher
{
    public async Task<int> RunOnceAsync(int limit, CancellationToken ct)
    {
        var claims = await store.ClaimAsync(limit, ct);
        foreach (var claim in claims)
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope(); var obsolete = await scope.ServiceProvider.GetRequiredService<IOutboxHandler>().HandleAsync(claim, ct);
                if (!obsolete) await scope.ServiceProvider.GetRequiredService<IRealtimePublisher>().PublishAsync(claim, ct);
                await store.CompleteAsync(claim, obsolete, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Adhd.Application.Notifications.JobDeferredException e) { await store.DeferAsync(claim, e.Until, e.CountAttempt, ct); }
            catch (Exception e)
            {
                var code = e is UseCaseException known ? known.Code : e.GetType().Name;
                logger.LogWarning("Background message {MessageId} failed with {ErrorCode} on attempt {Attempt}", claim.Id, code, claim.Attempts); await store.FailAsync(claim, code, ct);
            }
        }
        return claims.Length;
    }
}

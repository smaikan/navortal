using System.Security.Cryptography;
using System.Text;
using Adhd.Application.Common;
using Adhd.Application.Scheduling;
using Adhd.Application.Work;
using Microsoft.Extensions.Logging;

namespace Adhd.Infrastructure.Scheduling;

public sealed class ImmediateWorkCoordinator(IImmediateWorkStore work, ISchedulingCoordinator scheduling, ILogger<ImmediateWorkCoordinator> logger) : IImmediateWorkCoordinator
{
    public async Task<ImmediateWorkResult> StartNowAsync(Guid userId, StartNowCommand command, string key, CancellationToken ct)
    {
        var started = await work.StartNowAsync(userId, command, key, ct);
        try
        {
            var receipt = started.Values;
            var planKey = "now-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key)));
            var outcome = await scheduling.PlanAsync(userId, new(receipt.LocalDate, receipt.TaskIds, receipt.PlanningVersion), planKey, ct);
            return new(receipt, outcome.Values, outcome.Values.Applied is null ? "Preview" : "Applied", null, started.Replayed);
        }
        catch (UseCaseException ex) when (ex.Kind == ErrorKind.Conflict)
        {
            return new(started.Values, null, "NeedsPreview", ex.Code, started.Replayed);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Immediate work started, but remaining-day planning failed for user {UserId}", userId);
            return new(started.Values, null, "Unavailable", "planning_unavailable", started.Replayed);
        }
    }
}

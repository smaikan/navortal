using Adhd.Application.Scheduling;
using Adhd.Application.Support;
using Adhd.Domain.Planning;

namespace Adhd.Infrastructure.Scheduling;

public sealed partial class SchedulingCoordinator : ISupportPlanningCoordinator
{
    public async Task<SchedulingPlanOutcome> RescueAsync(Guid userId, SchedulingRequest request, string key, CancellationToken ct)
    {
        Key(key); if (key.Length > 100) throw new Adhd.Application.Common.UseCaseException(Adhd.Application.Common.ErrorKind.Validation, "idempotency_key_required", "Destek anahtarı en çok100 karakter olabilir."); key = "rescue:" + key;
        var payload = new { request.Date, taskIds = request.TaskIds?.Order().ToArray(), request.ExpectedPlanningVersion, newWorkNotBefore = request.NewWorkNotBefore?.ToUniversalTime() };
        var replay = await Replay<SchedulingPreviewView>(userId, "scheduling-plan", key, Hash(payload), ct); if (replay is not null) return new(replay, true);
        var prefs = await preferences.ReadAsync(userId, ct); if (!prefs.Values.SupportEnabled) throw Conflict("support_disabled", "İsteğe bağlı destekler kapalı.");
        if (request.Date != PlanTime.Date(clock.GetUtcNow(), prefs.Values.TimeZoneId)) throw new Adhd.Application.Common.UseCaseException(Adhd.Application.Common.ErrorKind.Validation, "rescue_today_required", "Günü kurtar yalnız bugünün kalan kısmını planlar.");
        return await PlanAsync(userId, request, key, ct);
    }
}

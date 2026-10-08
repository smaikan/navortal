using Adhd.Application.Jobs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Adhd.Api.Realtime;

[Authorize]
public sealed class PlannerHub : Hub
{
    public const string Path = "/api/hubs/planner";
    internal static string Group(Guid userId) => $"user:{userId:D}";
    public override async Task OnConnectedAsync()
    {
        var id = Guid.Parse(Context.User!.FindFirst("sub")!.Value);
        await Groups.AddToGroupAsync(Context.ConnectionId, Group(id));
        await base.OnConnectedAsync();
    }
}

public sealed class PlannerRealtimePublisher(IHubContext<PlannerHub> hub) : IRealtimePublisher
{
    public async Task PublishAsync(OutboxClaim claim, CancellationToken ct)
    {
        if (claim.Kind is not ("TaskChanged" or "PlanChanged" or "DayItemChanged" or "WorkChanged" or "FocusChanged" or "PreferencesChanged" or "RecurrenceChanged" or "NotificationReady" or "NotificationPreferencesChanged")) return;
        // Onay kaybolursa aynı olay tekrar gelebilir. İstemci sabit kimlikten ayıklar
        await hub.Clients.Group(PlannerHub.Group(claim.UserId)).SendAsync("changed",
            new PlannerChange(claim.Id, claim.Kind, claim.SourceId, claim.SourceVersion), ct);
    }
}
public sealed record PlannerChange(Guid EventId, string Kind, Guid SourceId, long SourceVersion);

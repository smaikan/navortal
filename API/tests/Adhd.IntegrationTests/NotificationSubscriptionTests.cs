using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Notifications;
using Adhd.Domain.Notifications;
using System.Security.Cryptography;
using System.Text;

namespace Adhd.IntegrationTests;

public sealed class NotificationSubscriptionTests
{
    [Fact]
    public async Task ActiveDevicesRemainVisibleWhenMoreThanOneHundredNewerInactiveRowsExist()
    {
        await using var scenario = await JobScenario.Create();
        var activeId = Guid.NewGuid();
        await using (var db = scenario.Context())
        {
            for (var i = 0; i < 106; i++)
            {
                var command = NotificationTests.Subscription($"https://push.example.test/history-{i}");
                db.PushSubscriptions.Add(new PushSubscriptionRecord
                {
                    Id = i == 0 ? activeId : Guid.NewGuid(), UserId = scenario.User.UserId,
                    Endpoint = command.Endpoint, EndpointHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(command.Endpoint))),
                    P256dh = command.P256dh, Auth = command.Auth, Label = "Tarayıcı geçmişi", Active = i == 0,
                    CreatedAt = scenario.App.Clock.Now.AddDays(-2).AddMinutes(i), Version = 1
                });
            }
            await db.SaveChangesAsync();
        }
        var rows = await TaskScenario.Read<SubscriptionView[]>(await scenario.User.Client.GetAsync("/api/notifications/subscriptions"));
        Assert.Equal(100, rows.Length);
        Assert.Equal(activeId, rows[0].Id);
        Assert.Equal(activeId, Assert.Single(rows, x => x.Active).Id);
    }

    [Fact]
    public async Task ReactivatingAnOldSubscriptionRespectsTheActiveDeviceLimitWhileExistingActiveDevicesCanRefresh()
    {
        await using var scenario = await JobScenario.Create();
        var inactiveCommand = NotificationTests.Subscription("https://push.example.test/inactive");
        var inactive = await TaskScenario.Read<SubscriptionView>(await scenario.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", inactiveCommand));
        Assert.Equal(HttpStatusCode.NoContent, (await scenario.User.Client.PostAsJsonAsync($"/api/notifications/subscriptions/{inactive.Id}/remove", new { version = inactive.Version })).StatusCode);
        var activeCommands = Enumerable.Range(0, 20).Select(i => NotificationTests.Subscription($"https://push.example.test/active-{i}")).ToArray();
        foreach (var command in activeCommands)
            Assert.True((await scenario.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", command)).IsSuccessStatusCode);

        var rejected = await scenario.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", inactiveCommand);
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        Assert.Contains("push_subscription_limit", await rejected.Content.ReadAsStringAsync());
        var refreshed = await TaskScenario.Read<SubscriptionView>(await scenario.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", activeCommands[0]));
        Assert.True(refreshed.Active);
        Assert.Equal(HttpStatusCode.NoContent, (await scenario.User.Client.PostAsJsonAsync($"/api/notifications/subscriptions/{refreshed.Id}/remove", new { version = refreshed.Version })).StatusCode);
        var restored = await TaskScenario.Read<SubscriptionView>(await scenario.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", inactiveCommand));
        Assert.Equal(inactive.Id, restored.Id);
        Assert.True(restored.Active);
        Assert.Equal(20, (await TaskScenario.Read<SubscriptionView[]>(await scenario.User.Client.GetAsync("/api/notifications/subscriptions"))).Count(x => x.Active));
    }
}

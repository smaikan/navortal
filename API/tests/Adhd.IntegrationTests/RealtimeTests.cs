using System.Collections.Concurrent;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Adhd.Application.Sync;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Adhd.IntegrationTests;

public sealed class RealtimeTests
{
    [Fact]
    public async Task RecoveryPrefersRunningOlderSessionOverNewerPausedSession()
    {
        await using var s = await JobScenario.Create(); var a = await s.User.Root(); var b = await s.User.Root(); var now = s.App.Clock.Now;
        var first = await WorkSessionTests.Started(s.User, a.Id); s.App.Clock.Now = now.AddMinutes(1); first = await WorkSessionTests.Change(s.User, first, "pause");
        s.App.Clock.Now = now.AddMinutes(2); var second = await WorkSessionTests.Started(s.User, b.Id); s.App.Clock.Now = now.AddMinutes(3); await WorkSessionTests.Change(s.User, second, "pause");
        s.App.Clock.Now = now.AddMinutes(4); first = await WorkSessionTests.Change(s.User, first, "resume");
        var sync = await TaskScenario.Read<SyncView>(await s.User.Client.GetAsync("/api/sync")); Assert.Equal(first.Id, sync.WorkSessionId);
    }
    [Fact]
    public async Task SameJwtConnectsOnlyToOwnGroupQueryCredentialsAreNotLoggedAndHttpRecoversAfterReconnect()
    {
        var logs = new CapturedLogs(); await using var s = await JobScenario.Create(services => services.AddSingleton<ILoggerProvider>(logs));
        var b = await TaskScenario.User(s.App); var token = s.User.Client.DefaultRequestHeaders.Authorization!.Parameter!;
        using var aSocket = await Connect(s.App, token); using var bSocket = await Connect(s.App, b.Client.DefaultRequestHeaders.Authorization!.Parameter!);
        // İstemci JoinGroup çağıramaz. Başka hesabın grup adını bilmek yetki vermez.
        await Send(bSocket, new { type = 1, invocationId = "join", target = "JoinGroup", arguments = new[] { $"user:{s.User.UserId:D}" } });
        var rejected = await Receive(bSocket); Assert.Equal(3, rejected.GetProperty("type").GetInt32()); Assert.True(rejected.TryGetProperty("error", out _));
        var aTask = await s.User.Root("Private A title"); await s.Pump(); var aChange = await Receive(aSocket); Assert.Equal(aTask.Id, aChange.GetProperty("arguments")[0].GetProperty("sourceId").GetGuid()); Assert.DoesNotContain("Private A", aChange.GetRawText());
        var bTask = await b.Root(); await s.Pump(); var bChange = await Receive(bSocket); Assert.Equal(bTask.Id, bChange.GetProperty("arguments")[0].GetProperty("sourceId").GetGuid());
        Assert.Equal(HttpStatusCode.Unauthorized, (await s.App.CreateClient().GetAsync($"/api/tasks?access_token={Uri.EscapeDataString(token)}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await s.App.CreateClient().PostAsync($"/api/hubs/planner/negotiate?negotiateVersion=1&access_token={Uri.EscapeDataString(token)}", null)).StatusCode);
        using var disconnected = await Connect(s.App, token); disconnected.Abort(); var f = await FocusTests.Start(s.User, settings: new(300)); s.App.Clock.Now = s.App.Clock.Now.AddMinutes(2);
        using var reconnected = await Connect(s.App, token); var recovery = await TaskScenario.Read<SyncView>(await s.User.Client.GetAsync("/api/sync")); Assert.Equal(f.Id, recovery.FocusSessionId); Assert.Equal(f.WorkSessionId, recovery.WorkSessionId); Assert.Equal(s.App.Clock.Now, recovery.ServerNow);
        Assert.DoesNotContain(logs.Messages, line => line.Contains(token, StringComparison.Ordinal));
    }
    [Fact]
    public async Task MissingOrMalformedJwtCannotOpenHubWebSocket()
    {
        await using var s = await JobScenario.Create(); var c = s.App.Server.CreateWebSocketClient();
        await Assert.ThrowsAnyAsync<Exception>(() => c.ConnectAsync(new Uri("ws://localhost/api/hubs/planner?access_token=invalid"), default));
        // Sorguda geçerli token bile olsa kullanma. Sorgudan giriş yapılmıyor.
        var s2 = await TaskScenario.User(s.App); var valid = s2.Client.DefaultRequestHeaders.Authorization!.Parameter!;
        await Assert.ThrowsAnyAsync<Exception>(() => c.ConnectAsync(new Uri($"ws://localhost/api/hubs/planner?access_token={Uri.EscapeDataString(valid)}"), default));
        await Assert.ThrowsAnyAsync<Exception>(() => c.ConnectAsync(new Uri("ws://localhost/api/hubs/planner"), default));
    }
    private static async Task<WebSocket> Connect(PlannerFactory app, string token)
    {
        // Tarayıcı hub'a HttpOnly cookie ile girer. Tokenı URL'ye koyma
        var client = app.Server.CreateWebSocketClient(); client.ConfigureRequest = r => r.Headers.Cookie = $"adhd_session={token}";
        var socket = await client.ConnectAsync(new Uri("ws://localhost/api/hubs/planner"), default);
        await Send(socket, new { protocol = "json", version = 1 }); var handshake = await Receive(socket); Assert.Equal("{}", handshake.GetRawText()); return socket;
    }
    private static Task Send(WebSocket socket, object value) => socket.SendAsync(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value) + '\u001e'), WebSocketMessageType.Text, true, default);
    private static async Task<JsonElement> Receive(WebSocket socket)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10)); var bytes = new byte[16384]; var received = await socket.ReceiveAsync(bytes, timeout.Token);
        Assert.Equal(WebSocketMessageType.Text, received.MessageType); var text = Encoding.UTF8.GetString(bytes, 0, received.Count).Split('\u001e', StringSplitOptions.RemoveEmptyEntries)[0]; return JsonDocument.Parse(text).RootElement.Clone();
    }
    private sealed class CapturedLogs : ILoggerProvider
    {
        internal ConcurrentQueue<string> Messages { get; } = new();
        public ILogger CreateLogger(string categoryName) => new Capture(Messages);
        public void Dispose() { }
        private sealed class Capture(ConcurrentQueue<string> messages) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel logLevel) => true;
            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) => messages.Enqueue(formatter(state, exception));
        }
    }
}

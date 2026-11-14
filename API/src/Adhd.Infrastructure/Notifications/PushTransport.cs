using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text.Json;
using Adhd.Application.Notifications;
using Adhd.Domain.Notifications;
using Lib.Net.Http.WebPush;
using Lib.Net.Http.WebPush.Authentication;
using Microsoft.Extensions.Options;

namespace Adhd.Infrastructure.Notifications;

public sealed class PushSettings
{
    public bool Enabled { get; set; }
    // P2 gönderim kuralı P1 arayüzünden ayrı açılıp geri alınabilir.
    public bool SuppressReadDeliveries { get; set; }
    public string Subject { get; set; } = "";
    public string PublicKey { get; set; } = "";
    public string PrivateKey { get; set; } = "";
}
public sealed class WebPushTransport(HttpClient http, IOptions<PushSettings> settings) : IPushTransport, IDisposable
{
    public void Dispose() => http.Dispose();
    public async Task<PushSendResult> SendAsync(PushSubscriptionRecord subscription, PushEnvelope envelope, CancellationToken ct)
    {
        var options = settings.Value;
        using var authentication = new VapidAuthentication(options.PublicKey, options.PrivateKey) { Subject = options.Subject };
        var client = new PushServiceClient(http) { DefaultAuthentication = authentication, AutoRetryAfter = false, DefaultTimeToLive = 120 };
        var destination = new PushSubscription { Endpoint = subscription.Endpoint, Keys = new Dictionary<string, string> { ["p256dh"] = subscription.P256dh, ["auth"] = subscription.Auth } };
        try
        {
            await client.RequestPushMessageDeliveryAsync(destination, new PushMessage(JsonSerializer.Serialize(envelope, new JsonSerializerOptions(JsonSerializerDefaults.Web))) { TimeToLive = 120, Topic = envelope.NotificationId.ToString("N") }, ct);
            return new(201);
        }
        catch (PushServiceClientException e)
        {
            var retry = e.Headers?.RetryAfter; var wait = retry?.Delta ?? (retry?.Date is { } date ? date - DateTimeOffset.UtcNow : null);
            return new((int)e.StatusCode, wait);
        }
    }
}
internal static class PushEndpoints
{
    internal static Uri Parse(string? endpoint)
    {
        if (endpoint?.Length > 2048 || !Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) || uri.Scheme != "https" || uri.UserInfo.Length != 0 || uri.Fragment.Length != 0 || uri.Port != 443 || uri.IsLoopback)
            throw new ArgumentException("push_endpoint_invalid");
        if (IPAddress.TryParse(uri.Host, out var address) && !Public(address)) throw new ArgumentException("push_endpoint_invalid");
        return uri;
    }
    internal static bool Public(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4(); if (IPAddress.IsLoopback(address) || address.Equals(IPAddress.Any) || address.Equals(IPAddress.IPv6Any)) return false;
        var b = address.GetAddressBytes();
        if (address.AddressFamily == AddressFamily.InterNetwork) return b[0] is not (0 or 10 or 127) && b[0] < 224 && !(b[0] == 169 && b[1] == 254) && !(b[0] == 172 && b[1] is >= 16 and <= 31) && !(b[0] == 192 && b[1] == 168) && !(b[0] == 100 && b[1] is >= 64 and <= 127);
        return !address.IsIPv6LinkLocal && !address.IsIPv6SiteLocal && !address.IsIPv6Multicast && (b[0] & 0xfe) != 0xfc;
    }
    internal static async ValueTask<Stream> Connect(SocketsHttpConnectionContext context, CancellationToken ct)
    {
        var addresses = await Dns.GetHostAddressesAsync(context.DnsEndPoint.Host, ct);
        if (addresses.Length == 0 || addresses.Any(x => !Public(x))) throw new HttpRequestException("push_destination_unavailable");
        var socket = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
        try { await socket.ConnectAsync(addresses, context.DnsEndPoint.Port, ct); return new NetworkStream(socket, ownsSocket: true); }
        catch { socket.Dispose(); throw; }
    }
    internal static void Keys(string publicKey, string auth)
    {
        if (string.IsNullOrEmpty(publicKey) || publicKey.Length > 100 || string.IsNullOrEmpty(auth) || auth.Length > 50) throw new ArgumentException("push_keys_invalid");
        var bytes = Decode(publicKey); if (bytes.Length != 65 || bytes[0] != 4 || Decode(auth).Length != 16) throw new ArgumentException("push_keys_invalid");
        using var key = ECDiffieHellman.Create(new ECParameters { Curve = ECCurve.NamedCurves.nistP256, Q = new() { X = bytes[1..33], Y = bytes[33..65] } });
    }
    internal static byte[] Decode(string value) => Convert.FromBase64String(value.Replace('-', '+').Replace('_', '/') + new string('=', (4 - value.Length % 4) % 4));
}

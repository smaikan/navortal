using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Adhd.Application.Notifications;
using Adhd.Domain.Notifications;
using Adhd.Infrastructure.Notifications;
using Microsoft.Extensions.Options;

namespace Adhd.IntegrationTests;

public sealed class WebPushProtocolTests
{
    [Fact]
    public async Task RealTransportProducesDecryptableRfc8291PayloadAndValidVapidSignatureWithoutApplicationJwt()
    {
        using var receiver = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256); var receiverPublic = Point(receiver.ExportParameters(false).Q); var auth = RandomNumberGenerator.GetBytes(16);
        using var signing = ECDsa.Create(ECCurve.NamedCurves.nistP256); var keys = signing.ExportParameters(true);
        var push = new PushSettings { Enabled = true, PublicKey = NotificationTests.Base64(Point(keys.Q)), PrivateKey = NotificationTests.Base64(keys.D!), Subject = "mailto:planner@example.test" };
        var handler = new ReceiverHandler(); using var transport = new WebPushTransport(new HttpClient(handler), Options.Create(push));
        var notification = Guid.NewGuid(); var envelope = new PushEnvelope(notification, Guid.NewGuid(), $"notification:{notification:D}", "Navortal", "Bir hatırlatmanız var.", $"/notifications/{notification}", false, 3);
        var result = await transport.SendAsync(new PushSubscriptionRecord { Endpoint = "https://push.example.test/opaque", P256dh = NotificationTests.Base64(receiverPublic), Auth = NotificationTests.Base64(auth) }, envelope, default);
        Assert.Equal(201, result.StatusCode); Assert.Equal("aes128gcm", handler.Encoding); Assert.Equal("120", handler.Ttl); Assert.StartsWith("vapid ", handler.Authorization);
        var attributes = handler.Authorization![6..].Split(',').Select(x => x.Trim().Split('=', 2)).ToDictionary(x => x[0], x => x[1]); var jwt = attributes["t"].Split('.');
        Assert.Equal(push.PublicKey, attributes["k"]); Assert.True(signing.VerifyData(Encoding.ASCII.GetBytes(jwt[0] + "." + jwt[1]), Decode(jwt[2]), HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation));
        var claims = JsonDocument.Parse(Decode(jwt[1])).RootElement; Assert.Equal("https://push.example.test", claims.GetProperty("aud").GetString()); Assert.Equal(push.Subject, claims.GetProperty("sub").GetString()); Assert.True(claims.GetProperty("exp").GetInt64() > DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        var encoded = handler.Body!; var salt = encoded[..16]; var keyLength = encoded[20]; Assert.Equal(65, keyLength); var senderPublic = encoded[21..(21 + keyLength)];
        using var sender = ECDiffieHellman.Create(new ECParameters { Curve = ECCurve.NamedCurves.nistP256, Q = new() { X = senderPublic[1..33], Y = senderPublic[33..65] } });
        var secret = receiver.DeriveRawSecretAgreement(sender.PublicKey); var authPrk = HKDF.Extract(HashAlgorithmName.SHA256, secret, auth);
        var info = Encoding.ASCII.GetBytes("WebPush: info\0").Concat(receiverPublic).Concat(senderPublic).ToArray(); var ikm = HKDF.Expand(HashAlgorithmName.SHA256, authPrk, 32, info);
        var prk = HKDF.Extract(HashAlgorithmName.SHA256, ikm, salt); var key = HKDF.Expand(HashAlgorithmName.SHA256, prk, 16, Encoding.ASCII.GetBytes("Content-Encoding: aes128gcm\0"));
        var nonce = HKDF.Expand(HashAlgorithmName.SHA256, prk, 12, Encoding.ASCII.GetBytes("Content-Encoding: nonce\0")); var encrypted = encoded[(21 + keyLength)..]; var plain = new byte[encrypted.Length - 16];
        using var cipher = new AesGcm(key, 16); cipher.Decrypt(nonce, encrypted[..^16], encrypted[^16..], plain); Assert.Equal(2, plain[^1]);
        var decoded = JsonSerializer.Deserialize<PushEnvelope>(plain[..^1], new JsonSerializerOptions(JsonSerializerDefaults.Web)); Assert.Equal(envelope, decoded);
        handler.Response = HttpStatusCode.Gone; Assert.Equal(410, (await transport.SendAsync(new() { Endpoint = "https://push.example.test/opaque", P256dh = NotificationTests.Base64(receiverPublic), Auth = NotificationTests.Base64(auth) }, envelope, default)).StatusCode);
    }
    private static byte[] Point(ECPoint q) => new byte[] { 4 }.Concat(q.X!).Concat(q.Y!).ToArray();
    private static byte[] Decode(string s) => Convert.FromBase64String(s.Replace('-', '+').Replace('_', '/') + new string('=', (4 - s.Length % 4) % 4));
    private sealed class ReceiverHandler : HttpMessageHandler
    {
        internal byte[]? Body; internal string? Authorization; internal string? Encoding; internal string? Ttl; internal HttpStatusCode Response = HttpStatusCode.Created;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Body = await request.Content!.ReadAsByteArrayAsync(ct); Authorization = request.Headers.Authorization?.ToString(); Encoding = string.Join(",", request.Content.Headers.ContentEncoding); Ttl = string.Join(",", request.Headers.GetValues("TTL"));
            return new(Response) { Content = new StringContent("") };
        }
    }
}

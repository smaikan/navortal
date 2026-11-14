using System.Net;
using System.Text;
using System.Text.Json;
using Adhd.Infrastructure.Notifications;
using Adhd.Api.Auth;
using Adhd.Infrastructure.Auth;
using Microsoft.Extensions.Options;

namespace Adhd.IntegrationTests;

public sealed class FcmTransportTests
{
    [Fact]
    public void TokenEncryptionSurvivesServerInstanceReplacementAndRejectsTampering()
    {
        var options = Options.Create(new JwtSettings { SigningKey = PlannerFactory.SigningKey });
        using var first = new MobilePushTokenProtector(options); using var second = new MobilePushTokenProtector(options);
        var encoded = first.Protect("synthetic-device-token");
        Assert.Equal("synthetic-device-token", second.Unprotect(encoded));
        var bytes = Convert.FromBase64String(encoded[3..]); bytes[^1] ^= 1;
        Assert.ThrowsAny<System.Security.Cryptography.CryptographicException>(() => second.Unprotect("v1." + Convert.ToBase64String(bytes)));
    }
    private sealed class Credentials : IFcmAccessTokenSource
    {
        public bool Available => true;
        public Task<string> GetAsync(CancellationToken ct) => Task.FromResult("synthetic-test-access");
    }
    private sealed class Handler(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) => send(request);
    }
    [Fact]
    public async Task SendsOnlyDataToHttpV1WithFixedPackageAndBoundedTtl()
    {
        using var http = new HttpClient(new Handler(async request =>
        {
            Assert.Equal("https://fcm.googleapis.com/v1/projects/navortal/messages:send", request.RequestUri!.AbsoluteUri);
            Assert.Equal("Bearer", request.Headers.Authorization!.Scheme);
            using var json = JsonDocument.Parse(await request.Content!.ReadAsStringAsync());
            var message = json.RootElement.GetProperty("message"); Assert.False(message.TryGetProperty("notification", out _));
            Assert.False(message.GetProperty("android").TryGetProperty("notification", out _));
            Assert.Equal("120s", message.GetProperty("android").GetProperty("ttl").GetString());
            Assert.Equal("tr.com.navortal", message.GetProperty("android").GetProperty("restricted_package_name").GetString());
            return new(HttpStatusCode.OK);
        }));
        var transport = new FcmTransport(http, Options.Create(new FirebaseSettings()), new Credentials());
        Assert.Equal(200, (await transport.SendAsync("synthetic-device-token", new Dictionary<string, string> { ["type"] = "notification.ready" }, TimeSpan.FromMinutes(5), default)).StatusCode);
    }
    [Theory]
    [InlineData(404, "UNREGISTERED", false, true, true)]
    [InlineData(400, "INVALID_ARGUMENT", false, true, true)]
    [InlineData(400, "INVALID_ARGUMENT", true, false, true)]
    [InlineData(403, "SENDER_ID_MISMATCH", false, false, true)]
    [InlineData(429, "QUOTA_EXCEEDED", false, false, false)]
    [InlineData(503, "UNAVAILABLE", false, false, false)]
    public async Task ErrorDetailsDistinguishInvalidTokensFromPayloadAndTransientFailures(int status, string code, bool badPayload, bool invalidToken, bool rejected)
    {
        var details = new List<object> { new Dictionary<string, object> { ["@type"] = "type.googleapis.com/google.firebase.fcm.v1.FcmError", ["errorCode"] = code } };
        if (badPayload) details.Add(new Dictionary<string, object> { ["@type"] = "type.googleapis.com/google.rpc.BadRequest", ["fieldViolations"] = new[] { new { field = "message.data" } } });
        using var http = new HttpClient(new Handler(_ => Task.FromResult(new HttpResponseMessage((HttpStatusCode)status)
        { Content = new StringContent(JsonSerializer.Serialize(new { error = new { status = code, message = "untrusted error body must never be returned", details } }), Encoding.UTF8, "application/json") })));
        var transport = new FcmTransport(http, Options.Create(new FirebaseSettings()), new Credentials());
        var result = await transport.SendAsync("synthetic-device-token", new Dictionary<string, string>(), TimeSpan.FromMinutes(1), default);
        Assert.Equal(invalidToken, result.InvalidToken); Assert.Equal(rejected, result.DefinitelyRejected);
        Assert.DoesNotContain("untrusted", result.Code!);
    }
}

using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Adhd.Application.Notifications;
using Google.Apis.Auth.OAuth2;
using Microsoft.Extensions.Options;

namespace Adhd.Infrastructure.Notifications;

public sealed class FirebaseSettings
{
    public bool Enabled { get; set; }
    public string ProjectId { get; set; } = "navortal";
    public string ServiceAccountPath { get; set; } = "/opt/navortal/API/.local/firebase-service-account.json";
    public string AndroidPackageName { get; set; } = "tr.com.navortal";
    // Reserved only. No timer messages are implemented in stage 1.
    public bool TimerSyncEnabled { get; set; }
}
public interface IFcmAccessTokenSource
{
    bool Available { get; }
    Task<string> GetAsync(CancellationToken ct);
}
public sealed class FcmAccessTokenSource(IOptions<FirebaseSettings> settings) : IFcmAccessTokenSource
{
    private GoogleCredential? credential;
    private readonly SemaphoreSlim gate = new(1);
    public bool Available => settings.Value.Enabled && File.Exists(settings.Value.ServiceAccountPath)
        && settings.Value.ProjectId.Length is > 0 and <= 100 && settings.Value.ProjectId.All(c => char.IsAsciiLetterOrDigit(c) || c == '-')
        && settings.Value.AndroidPackageName == "tr.com.navortal";
    public async Task<string> GetAsync(CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            // The library reads the configured server-only file. Its contents never enter diagnostics or DTOs.
            credential ??= CredentialFactory.FromFile<ServiceAccountCredential>(settings.Value.ServiceAccountPath).ToGoogleCredential()
                .CreateScoped("https://www.googleapis.com/auth/firebase.messaging");
            return await credential.UnderlyingCredential.GetAccessTokenForRequestAsync(cancellationToken: ct);
        }
        finally { gate.Release(); }
    }
}
public sealed class FcmTransport(HttpClient http, IOptions<FirebaseSettings> settings, IFcmAccessTokenSource credentials) : IFcmTransport
{
    public bool Available => credentials.Available;
    public async Task<FcmSendResult> SendAsync(string token, IReadOnlyDictionary<string, string> data, TimeSpan ttl, CancellationToken ct)
    {
        if (!Available || ttl <= TimeSpan.Zero) return new(503, "fcm_unavailable", DefinitelyRejected: true);
        string access;
        try { access = await credentials.GetAsync(ct); }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception) { return new(503, "fcm_credentials_unavailable", DefinitelyRejected: true); }
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://fcm.googleapis.com/v1/projects/" + settings.Value.ProjectId + "/messages:send");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", access);
        request.Content = JsonContent.Create(new { message = new { token, data, android = new {
            priority = "HIGH", ttl = ((int)Math.Clamp(Math.Ceiling(ttl.TotalSeconds), 1, 120)).ToString(System.Globalization.CultureInfo.InvariantCulture) + "s",
            restricted_package_name = settings.Value.AndroidPackageName } } });
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        if (response.IsSuccessStatusCode) return new((int)response.StatusCode);
        var status = (int)response.StatusCode;
        var retry = response.Headers.RetryAfter;
        var delay = retry?.Delta ?? (retry?.Date is { } at ? at - DateTimeOffset.UtcNow : null);
        string? fcmCode = null; var badPayload = false;
        // Never return/log FCM error messages: they may echo the device token or payload.
        try
        {
            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var json = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            if (json.RootElement.TryGetProperty("error", out var error) && error.TryGetProperty("details", out var details) && details.ValueKind == JsonValueKind.Array)
                foreach (var item in details.EnumerateArray())
                {
                    if (!item.TryGetProperty("@type", out var type)) continue;
                    if (type.GetString() == "type.googleapis.com/google.rpc.BadRequest") badPayload = true;
                    if (type.GetString() == "type.googleapis.com/google.firebase.fcm.v1.FcmError" && item.TryGetProperty("errorCode", out var code))
                        fcmCode = code.GetString();
                }
        }
        catch (JsonException) { }
        var invalidToken = fcmCode == "UNREGISTERED" || fcmCode == "INVALID_ARGUMENT" && !badPayload;
        var safeCode = fcmCode switch { "UNREGISTERED" => "fcm_unregistered", "INVALID_ARGUMENT" => "fcm_invalid_argument",
            "SENDER_ID_MISMATCH" => "fcm_sender_mismatch", "QUOTA_EXCEEDED" => "fcm_quota", _ => "fcm_rejected" };
        return new(status, safeCode, invalidToken, status is >= 400 and < 500 && status != 429, delay);
    }
}

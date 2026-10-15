using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;

namespace Adhd.IntegrationTests;

// Belge çıktısı isteğe bağlı ve yalnız test DB'sinden. Production'a middleware eklenmez
public sealed class ApiTranscriptStartupFilter : IStartupFilter
{
    private static readonly SemaphoreSlim Writer = new(1, 1);
    private static readonly HashSet<string> Sensitive = new(StringComparer.OrdinalIgnoreCase)
    { "accessToken", "access_token", "idToken", "token", "password", "newPassword", "auth", "p256dh", "endpoint", "signingKey", "authorization" };
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
    {
        app.Use(async (context, continuation) =>
        {
            var path = Environment.GetEnvironmentVariable("ADHD_API_TRANSCRIPTS");
            if (string.IsNullOrWhiteSpace(path) || !context.Request.Path.StartsWithSegments("/api") || context.Request.Path.StartsWithSegments("/api/hubs")) { await continuation(); return; }
            context.Request.EnableBuffering(); using var reader = new StreamReader(context.Request.Body, leaveOpen: true); var request = await reader.ReadToEndAsync(); context.Request.Body.Position = 0;
            var original = context.Response.Body; await using var buffer = new MemoryStream(); context.Response.Body = buffer;
            try
            {
                await continuation(); buffer.Position = 0; using var responseReader = new StreamReader(buffer, leaveOpen: true); var response = await responseReader.ReadToEndAsync(); buffer.Position = 0; await buffer.CopyToAsync(original);
                var entry = new
                {
                    method = context.Request.Method, path = context.Request.Path.Value,
                    query = context.Request.Query.ToDictionary(x => x.Key, x => Sensitive.Contains(x.Key) ? "<REDACTED>" : x.Value.ToString()),
                    idempotencyKey = context.Request.Headers["Idempotency-Key"].FirstOrDefault(), authenticated = context.User.Identity?.IsAuthenticated == true,
                    requestBody = Clean(request), status = context.Response.StatusCode, responseBody = Clean(response), responseContentType = context.Response.ContentType,
                    location = context.Response.Headers.Location.FirstOrDefault(), idempotentReplay = context.Response.Headers["Idempotent-Replay"].FirstOrDefault()
                };
                var json = JsonSerializer.Serialize(entry); await Writer.WaitAsync();
                try { Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!); await File.AppendAllTextAsync(path, json + Environment.NewLine); }
                finally { Writer.Release(); }
            }
            finally { context.Response.Body = original; }
        });
        next(app);
    };
    private static readonly System.Text.RegularExpressions.Regex JwtShape = new(@"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+");
    internal static JsonNode? Clean(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        JsonNode? node; try { node = JsonNode.Parse(text); } catch (JsonException) { return JsonValue.Create("<non-JSON response>"); }
        void Visit(JsonNode? current)
        {
            if (current is JsonObject obj)
                foreach (var key in obj.Select(x => x.Key).ToArray())
                {
                    // Alan hatasında anahtar alanın adı, değer hata dizisi. Bunlar kimlik bilgisi değil.
                    if (Sensitive.Contains(key) && obj[key] is JsonValue) obj[key] = key.Equals("password", StringComparison.OrdinalIgnoreCase) || key.Equals("newPassword", StringComparison.OrdinalIgnoreCase) ? "123456" : $"<REPLACE_{key.ToUpperInvariant()}>";
                    // JWT'ye benzeyen değeri başka bir alanın içinde olsa da belgeye koyma.
                    else if (obj[key] is JsonValue value && value.TryGetValue<string>(out var s) && JwtShape.IsMatch(s)) obj[key] = JwtShape.Replace(s, "<REDACTED-JWT>");
                    else Visit(obj[key]);
                }
            else if (current is JsonArray array) foreach (var value in array) Visit(value);
        }
        Visit(node); return node;
    }
}

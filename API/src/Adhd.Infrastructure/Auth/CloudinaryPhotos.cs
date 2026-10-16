using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Adhd.Application.Auth;
using Adhd.Application.Common;
using Microsoft.Extensions.Options;

namespace Adhd.Infrastructure.Auth;

public sealed class CloudinarySettings
{
    public bool Enabled { get; set; }
    public string CloudName { get; set; } = "";
    public string ApiKey { get; set; } = "";
    public string ApiSecret { get; set; } = "";
}
public sealed class CloudinarySettingsValidator : IValidateOptions<CloudinarySettings>
{
    public ValidateOptionsResult Validate(string? name, CloudinarySettings value) => !value.Enabled ||
        (Regex.IsMatch(value.CloudName, "^[a-zA-Z0-9_-]{1,64}$") && Regex.IsMatch(value.ApiKey, "^[0-9]{5,32}$") &&
         value.ApiSecret.Length >= 16 && !value.ApiSecret.Any(char.IsWhiteSpace)) ? ValidateOptionsResult.Success :
        ValidateOptionsResult.Fail("Cloudinary configuration is incomplete or invalid.");
}

// Sadece sabit HTTPS hostları kullanılır. Dışarıdan URL, yönlendirme, istek kaydı veya URL içinde kimlik bilgisi yok.
public sealed class CloudinaryPhotos(HttpClient http, IOptions<CloudinarySettings> options) : IProfilePhotos, IDisposable
{
    public void Dispose() => http.Dispose();
    private CloudinarySettings Settings => options.Value;
    public bool Enabled => Settings.Enabled;
    public static string PublicId(Guid user, Guid photo) => $"p1/{user:D}/{photo:N}";
    private void RequireEnabled()
    {
        if (!Enabled) throw Unavailable();
    }
    private static UseCaseException Unavailable() => new(ErrorKind.Unavailable, "profile_photo_provider_unavailable", "Fotoğraf hizmetine ulaşılamadı. Yeniden denemeden önce güncel profili kontrol et.");
    private HttpRequestMessage Request(string operation, HttpContent content)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"https://api.cloudinary.com/v1_1/{Settings.CloudName}/image/{operation}") { Content = content };
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes($"{Settings.ApiKey}:{Settings.ApiSecret}")));
        return request;
    }
    public async Task<ProfilePhoto> UploadAsync(Guid user, Guid photo, byte[] bytes, string mediaType, CancellationToken ct)
    {
        RequireEnabled();
        using var form = new MultipartFormDataContent();
        using var file = new ByteArrayContent(bytes); file.Headers.ContentType = new MediaTypeHeaderValue(mediaType);
        form.Add(file, "file", "photo");
        // Sabit ve uyumlu dinamik modda folder ile public-id öneki aynı olsun.
        form.Add(new StringContent($"p1/{user:D}"), "folder");
        form.Add(new StringContent(photo.ToString("N")), "public_id");
        form.Add(new StringContent("authenticated"), "type");
        form.Add(new StringContent("false"), "overwrite");
        form.Add(new StringContent("jpg,png,webp"), "allowed_formats");
        form.Add(new StringContent("c_fill,g_auto,h_256,w_256/f_jpg,fl_strip_profile"), "transformation");
        using var request = Request("upload", form);
        try
        {
            using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            if (response.StatusCode == System.Net.HttpStatusCode.BadRequest)
                throw new UseCaseException(ErrorKind.Validation, "profile_photo_unreadable", "Fotoğraf okunamadı. Geçerli bir JPEG, PNG veya WebP dosyası seç.");
            if (!response.IsSuccessStatusCode) throw Unavailable();
            var raw = await ReadBounded(response, 64 * 1024, ct);
            using var result = JsonDocument.Parse(raw);
            var root = result.RootElement;
            if (root.GetProperty("public_id").GetString() != PublicId(user, photo) || root.GetProperty("type").GetString() != "authenticated" ||
                root.GetProperty("resource_type").GetString() != "image" || root.GetProperty("format").GetString() != "jpg" ||
                root.GetProperty("width").GetInt32() != 256 || root.GetProperty("height").GetInt32() != 256 ||
                !root.GetProperty("version").TryGetInt64(out var version) || version < 1) throw Unavailable();
            return new(version);
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException or KeyNotFoundException or InvalidOperationException)
        { throw Unavailable(); }
    }
    public string DeliveryUrl(Guid user, Guid photo, long version)
    {
        var path = $"v{version}/{PublicId(user, photo)}.jpg";
        var signature = Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(path + Settings.ApiSecret))).TrimEnd('=').Replace('+', '-').Replace('/', '_')[..8];
        return $"https://res.cloudinary.com/{Settings.CloudName}/image/authenticated/s--{signature}--/{path}";
    }
    public async Task<byte[]> ReadAsync(Guid user, Guid photo, long cloudVersion, CancellationToken ct)
    {
        RequireEnabled();
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, DeliveryUrl(user, photo, cloudVersion));
            using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!response.IsSuccessStatusCode || response.Content.Headers.ContentType?.MediaType != "image/jpeg") throw Unavailable();
            var bytes = await ReadBounded(response, 1024 * 1024, ct);
            if (bytes.Length < 3 || bytes[0] != 255 || bytes[1] != 216 || bytes[2] != 255) throw Unavailable();
            return bytes;
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException) { throw Unavailable(); }
    }
    public async Task DeleteAsync(Guid user, Guid photo, CancellationToken ct)
    {
        RequireEnabled();
        using var form = new FormUrlEncodedContent(new Dictionary<string, string> { ["public_id"] = PublicId(user, photo), ["type"] = "authenticated", ["invalidate"] = "true" });
        using var request = Request("destroy", form);
        try
        {
            using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!response.IsSuccessStatusCode) throw Unavailable();
            using var result = JsonDocument.Parse(await ReadBounded(response, 16 * 1024, ct));
            if (result.RootElement.GetProperty("result").GetString() is not ("ok" or "not found")) throw Unavailable();
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or JsonException or KeyNotFoundException) { throw Unavailable(); }
    }
    private static async Task<byte[]> ReadBounded(HttpResponseMessage response, int limit, CancellationToken ct)
    {
        if (response.Content.Headers.ContentLength > limit) throw Unavailable();
        await using var stream = await response.Content.ReadAsStreamAsync(ct); using var memory = new MemoryStream();
        var buffer = new byte[8192]; int length;
        while ((length = await stream.ReadAsync(buffer, ct)) > 0)
        { if (memory.Length + length > limit) throw Unavailable(); await memory.WriteAsync(buffer.AsMemory(0, length), ct); }
        return memory.ToArray();
    }
}

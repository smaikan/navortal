using System.Globalization;
using System.Security.Cryptography;
using Adhd.Application.Common;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.WebUtilities;

namespace Adhd.Api.Auth;

// Yalnız kısa ömürlü giriş challenge'ı; uygulama oturumu veya Google credential'ı tutulmaz.
public sealed class GoogleChallenge(IDataProtectionProvider protection, TimeProvider clock)
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);
    private readonly IDataProtector protector = protection.CreateProtector("Navortal.GoogleChallenge.v1");
    public static string Name(IHostEnvironment environment) => SessionCookie.IsLoopbackEnvironment(environment)
        ? "adhd_google_challenge" : "__Host-adhd_google_challenge";

    public string Create(HttpContext context)
    {
        var nonce = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        var value = protector.Protect($"{clock.GetUtcNow().ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture)}:{nonce}");
        context.Response.Cookies.Append(Name(Environment(context)), value, Options(context, Lifetime));
        return nonce;
    }

    public string Read(HttpContext context)
    {
        var cookie = context.Request.Cookies[Name(Environment(context))];
        if (string.IsNullOrEmpty(cookie) || cookie.Length > 2048) throw Invalid();
        try
        {
            var parts = protector.Unprotect(cookie).Split(':', 2);
            if (parts.Length != 2 || parts[1].Length != 43
                || !long.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var issued)) throw Invalid();
            var age = clock.GetUtcNow().ToUnixTimeSeconds() - issued;
            if (age < -30 || age >= (long)Lifetime.TotalSeconds) throw Invalid();
            return parts[1];
        }
        catch (Exception error) when (error is CryptographicException or FormatException) { throw Invalid(); }
    }

    public void Clear(HttpContext context) => context.Response.Cookies.Delete(Name(Environment(context)), Options(context, null));
    private static IHostEnvironment Environment(HttpContext context) => context.RequestServices.GetRequiredService<IHostEnvironment>();
    private static CookieOptions Options(HttpContext context, TimeSpan? lifetime) => new()
    {
        HttpOnly = true, Secure = !SessionCookie.IsLoopbackEnvironment(Environment(context)),
        SameSite = SameSiteMode.Strict, Path = "/", MaxAge = lifetime, IsEssential = true
    };
    private static UseCaseException Invalid() => new(ErrorKind.Unauthenticated, "google_challenge_invalid", "Google girişi için sayfayı yenileyip yeniden dene.");
}

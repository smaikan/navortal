namespace Adhd.Api.Auth;

// Tarayıcı oturumu HttpOnly, SameSite=Strict ve Path=/ kullanır. Yerel Development/Testing HTTP istisnası dışında __Host- ve Secure var. Ömrü yaklaşık 400 gün; me günde bir kaydırarak yeniler.
public static class SessionCookie
{
    public const string SecureName = "__Host-adhd_session";
    public const string LoopbackName = "adhd_session";
    public const string CsrfHeader = "X-ADHD-CSRF";
    public static readonly TimeSpan MaxAge = TimeSpan.FromDays(400);
    public static readonly TimeSpan RefreshAfter = TimeSpan.FromDays(1);
    // İstek Bearer yerine cookie ile doğrulandıysa HttpContext'e konan işaret.
    public const string FromCookieItem = "adhd.auth.cookie";

    public static bool IsLoopbackEnvironment(IHostEnvironment environment) =>
        environment.IsDevelopment() || environment.IsEnvironment("Testing");

    public static string Name(IHostEnvironment environment) => IsLoopbackEnvironment(environment) ? LoopbackName : SecureName;

    public static void Write(HttpContext context, string token)
    {
        var environment = context.RequestServices.GetRequiredService<IHostEnvironment>();
        context.Response.Cookies.Append(Name(environment), token, Options(environment, MaxAge));
    }

    public static void Delete(HttpContext context)
    {
        var environment = context.RequestServices.GetRequiredService<IHostEnvironment>();
        context.Response.Cookies.Delete(Name(environment), Options(environment, null));
    }

    public static string? Read(HttpContext context)
    {
        var environment = context.RequestServices.GetRequiredService<IHostEnvironment>();
        var value = context.Request.Cookies[Name(environment)];
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    private static CookieOptions Options(IHostEnvironment environment, TimeSpan? maxAge) => new()
    {
        HttpOnly = true,
        Secure = !IsLoopbackEnvironment(environment),
        SameSite = SameSiteMode.Strict,
        Path = "/",
        IsEssential = true,
        MaxAge = maxAge,
    };

    // Oturum listesi için kaba tarayıcı ailesi. Ham User-Agent veya kişiyi tanıtan bilgi tutulmaz.
    public static string BrowserFamily(string? userAgent)
    {
        if (string.IsNullOrEmpty(userAgent)) return "Other";
        if (userAgent.Contains("Edg/", StringComparison.Ordinal)) return "Edge";
        if (userAgent.Contains("Firefox/", StringComparison.Ordinal)) return "Firefox";
        if (userAgent.Contains("Chrome/", StringComparison.Ordinal) || userAgent.Contains("Chromium/", StringComparison.Ordinal)) return "Chrome";
        if (userAgent.Contains("Safari/", StringComparison.Ordinal)) return "Safari";
        return "Other";
    }
}

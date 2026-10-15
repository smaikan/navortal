using Microsoft.AspNetCore.Authorization;

namespace Adhd.Api.Auth;

// Cookie ile güvenli olmayan yazılarda CSRF kontrolü: SameSite=Strict, aynı-host Origin veya yoksa Referer ve X-ADHD-CSRF: 1 gerekir. Başka site bu başlığı CORS ön kontrolü olmadan gönderemez. Bearer kimliği kendiliğinden taşınmadığı için muaftır; yabancı Origin varsa bütün yazılar reddedilir.
public sealed class CsrfProtection(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (!HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method) && !HttpMethods.IsOptions(context.Request.Method)
            && context.Request.Path.StartsWithSegments("/api"))
        {
            var bearer = context.Request.Headers.Authorization.Any(x => x?.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) == true);
            var origin = Source(context);
            if (!bearer && origin is not null && !SameHost(context, origin))
            {
                await Refuse(context, "csrf_origin");
                return;
            }
            // CSRF işareti girişli kullanıcı adına çalışan uçlarda gerekiyor. Anonim kayıt, giriş ve sıfırlama
            // cookie kimliğini kullanmaz. Başka siteden gelen istek Origin ve SameSite=Strict ile engellenir.
            var endpoint = context.GetEndpoint();
            var actsAsUser = endpoint?.Metadata.GetMetadata<IAuthorizeData>() is not null && endpoint.Metadata.GetMetadata<IAllowAnonymous>() is null;
            if (actsAsUser && context.Items.ContainsKey(SessionCookie.FromCookieItem))
            {
                if (origin is null || context.Request.Headers[SessionCookie.CsrfHeader] != "1")
                {
                    await Refuse(context, "csrf_required");
                    return;
                }
            }
        }
        await next(context);
    }

    private static Uri? Source(HttpContext context)
    {
        var raw = context.Request.Headers.Origin.FirstOrDefault();
        // Sandbox veya dosyadan gelen null Origin'i aynı site sayma
        if (raw == "null") return new Uri("about:blank");
        if (string.IsNullOrEmpty(raw)) raw = context.Request.Headers.Referer.FirstOrDefault();
        return Uri.TryCreate(raw, UriKind.Absolute, out var uri) ? uri : null;
    }

    // Tarayıcının gördüğü host aynı kaynak UI proxy olabilir. Kendi host'unu X-Forwarded-Host ile iletir.
    private static bool SameHost(HttpContext context, Uri origin)
    {
        if (origin.Scheme is not ("http" or "https")) return false;
        var seen = origin.IsDefaultPort ? origin.Host : $"{origin.Host}:{origin.Port}";
        var hosts = new List<string> { context.Request.Host.Value ?? "" };
        hosts.AddRange(context.Request.Headers["X-Forwarded-Host"].SelectMany(x => (x ?? "").Split(',')).Select(x => x.Trim()));
        return hosts.Any(h => string.Equals(h, seen, StringComparison.OrdinalIgnoreCase)
            || origin.IsDefaultPort && string.Equals(h, $"{origin.Host}:{origin.Port}", StringComparison.OrdinalIgnoreCase));
    }

    private static Task Refuse(HttpContext context, string code) =>
        Results.Problem(statusCode: 403, title: "İstek bu sayfadan gönderilemedi. Sayfayı yenileyip yeniden dene.",
            extensions: new Dictionary<string, object?> { ["code"] = code, ["traceId"] = context.TraceIdentifier }).ExecuteAsync(context);
}

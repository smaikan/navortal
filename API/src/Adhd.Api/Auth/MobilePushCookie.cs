using Adhd.Application.Notifications;
using Adhd.Infrastructure.Persistence;
using System.Security.Cryptography;
using System.Text;
using Adhd.Infrastructure.Auth;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Api.Auth;

public sealed class MobilePushTokenProtector(IOptions<JwtSettings> settings) : IMobilePushTokenProtector, IDisposable
{
    // Domain-separated key derived from the existing server key; survives container replacement.
    private readonly byte[] key = HKDF.DeriveKey(HashAlgorithmName.SHA256, Encoding.UTF8.GetBytes(settings.Value.SigningKey), 32,
        info: Encoding.UTF8.GetBytes("Navortal.MobilePush.Token.v1"));
    public string Protect(string token)
    {
        var plain = Encoding.UTF8.GetBytes(token); var output = new byte[28 + plain.Length]; RandomNumberGenerator.Fill(output.AsSpan(0, 12));
        using var aes = new AesGcm(key, 16);
        aes.Encrypt(output.AsSpan(0, 12), plain, output.AsSpan(28), output.AsSpan(12, 16));
        CryptographicOperations.ZeroMemory(plain); return "v1." + Convert.ToBase64String(output);
    }
    public string Unprotect(string value)
    {
        byte[] input;
        try { input = value.StartsWith("v1.", StringComparison.Ordinal) ? Convert.FromBase64String(value[3..]) : []; }
        catch (FormatException) { throw new CryptographicException("Invalid mobile token envelope."); }
        if (input.Length <= 28) throw new CryptographicException("Invalid mobile token envelope.");
        var plain = new byte[input.Length - 28]; using var aes = new AesGcm(key, 16);
        aes.Decrypt(input.AsSpan(0, 12), input.AsSpan(28), input.AsSpan(12, 16), plain);
        var token = Encoding.UTF8.GetString(plain); CryptographicOperations.ZeroMemory(plain); return token;
    }
    public void Dispose() => CryptographicOperations.ZeroMemory(key);
}

public sealed class MobilePushCookieFilter(PlannerDbContext db) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var http = context.HttpContext;
        var user = http.User.FindFirst("sub")?.Value; var sid = http.User.FindFirst("sid")?.Value;
        if (!http.Items.ContainsKey(SessionCookie.FromCookieItem) || !Guid.TryParse(user, out var owner) || !Guid.TryParse(sid, out var session))
        { context.Result = Problem(http, "mobile_cookie_required"); return; }
        // No session-cache grace period for device management or display authorization after logout.
        if (!await db.AuthSessions.AsNoTracking().AnyAsync(x => x.Id == session && x.UserId == owner && x.RevokedAt == null, http.RequestAborted))
        { context.Result = Problem(http, "unauthorized"); return; }
        await next();
    }
    private static ObjectResult Problem(HttpContext http, string code) => new(new ProblemDetails
    { Status = 401, Title = "Geçerli uygulama oturum çerezi gerekli.", Extensions = { ["code"] = code, ["traceId"] = http.TraceIdentifier } }) { StatusCode = 401 };
}

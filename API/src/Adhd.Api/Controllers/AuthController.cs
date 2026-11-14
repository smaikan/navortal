using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using Adhd.Api.Auth;
using Adhd.Application.Auth;
using Adhd.Application.Common;
using Adhd.Infrastructure.Auth;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Adhd.Api.Controllers;

[ApiController, Route("api/auth")]
public sealed class AuthController(AuthService auth, IUserStore users, GoogleAuthService google, PasswordChangeService passwordChange, TimeProvider clock,
    IOptions<GoogleSettings> googleSettings, GoogleChallenge challenge) : ControllerBase
{
    [Authorize, HttpPost("change-password"), EnableRateLimiting("auth")]
    [ProducesResponseType(typeof(UserSummary), 200)]
    public async Task<UserSummary> ChangePassword(ChangePasswordRequest request, CancellationToken ct)
    {
        var sid = SessionId ?? throw new Adhd.Application.Common.UseCaseException(Adhd.Application.Common.ErrorKind.Unauthenticated, "unauthorized", "Yeniden giriş yap.");
        var signIn = await passwordChange.ChangeAsync(UserId, sid, request.ExpectedUserId, request.CurrentPassword, request.NewPassword, Family(), ct);
        SessionCookie.Write(HttpContext, signIn.Response.AccessToken);
        return signIn.Response.User;
    }
    [Authorize, HttpPost("set-password"), EnableRateLimiting("auth")]
    [ProducesResponseType(typeof(UserSummary), 200)]
    public async Task<UserSummary> SetPassword(SetPasswordRequest request, CancellationToken ct)
    {
        EnsureGoogleEnabled();
        if (request.ExpectedUserId != UserId)
            throw new UseCaseException(ErrorKind.Conflict, "account_changed", "Hesap değişti. Hesap ayarlarını yeniden aç.");
        var sid = SessionId ?? throw new UseCaseException(ErrorKind.Unauthenticated, "unauthorized", "Yeniden giriş yap.");
        var browser = HttpContext.Items.ContainsKey(SessionCookie.FromCookieItem);
        try
        {
            await google.VerifyOwnerAsync(UserId, request.IdToken, ct, browser ? challenge.Read(HttpContext) : null);
        }
        catch (UseCaseException error) when (error.Code is "google_invalid" or "google_challenge_invalid")
        {
            throw new UseCaseException(ErrorKind.Validation, error.Code, error.Message);
        }
        var signIn = await passwordChange.CreateAsync(UserId, sid, request.ExpectedUserId, request.NewPassword, Family(), ct);
        if (browser) challenge.Clear(HttpContext);
        SessionCookie.Write(HttpContext, signIn.Response.AccessToken);
        return signIn.Response.User;
    }

    // Tarayıcı yanıtı yalnız kullanıcı özeti taşır. Token HttpOnly cookie dışına çıkmaz.
    [HttpPost("session/register"), EnableRateLimiting("auth")]
    [ProducesResponseType(typeof(UserSummary), 201)]
    public async Task<ActionResult<UserSummary>> RegisterSession(RegisterRequest request, CancellationToken ct)
    {
        var signIn = await auth.RegisterAsync(request.Email, request.Password, request.DisplayName, Family(), ct);
        SessionCookie.Write(HttpContext, signIn.Response.AccessToken);
        return Created("/api/auth/me", signIn.Response.User);
    }
    [HttpPost("session/login"), EnableRateLimiting("auth")]
    public async Task<UserSummary> LoginSession(LoginRequest request, CancellationToken ct)
    {
        var signIn = await auth.LoginAsync(request.Email, request.Password, Family(), ct);
        SessionCookie.Write(HttpContext, signIn.Response.AccessToken);
        return signIn.Response.User;
    }

    [HttpPost("register"), EnableRateLimiting("auth")]
    [ProducesResponseType(typeof(AuthResponse), 201)]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request, CancellationToken ct)
    {
        var signIn = await auth.RegisterAsync(request.Email, request.Password, request.DisplayName, Family(), ct);
        SessionCookie.Write(HttpContext, signIn.Response.AccessToken);
        return Created("/api/auth/me", signIn.Response);
    }
    [HttpPost("login"), EnableRateLimiting("auth")]
    public async Task<AuthResponse> Login(LoginRequest request, CancellationToken ct)
    {
        var signIn = await auth.LoginAsync(request.Email, request.Password, Family(), ct);
        SessionCookie.Write(HttpContext, signIn.Response.AccessToken);
        return signIn.Response;
    }
    [Authorize, HttpGet("me")]
    public async Task<UserSummary> Me(CancellationToken ct)
    {
        var user = (await users.FindByIdAsync(UserId, ct))!;
        // Cookie bir günden eskiyse aynı oturum için yenile. Kullanan kişi girişte kalsın.
        if (HttpContext.Items.ContainsKey(SessionCookie.FromCookieItem) && SessionId is { } sid
            && long.TryParse(User.FindFirst(JwtRegisteredClaimNames.Iat)?.Value, out var iat)
            && clock.GetUtcNow() - DateTimeOffset.FromUnixTimeSeconds(iat) >= SessionCookie.RefreshAfter
            && await auth.RefreshAsync(user.Id, sid, ct) is { } token)
            SessionCookie.Write(HttpContext, token);
        return AuthService.Summary(user);
    }
    // Bu girişi sunucuda bitirip tarayıcı cookie'sini siler.
    [Authorize, HttpPost("logout")]
    [ProducesResponseType(204)]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        if (SessionId is { } sid) await auth.LogoutAsync(UserId, sid, ct);
        SessionCookie.Delete(HttpContext);
        return NoContent();
    }
    // Bu dahil hesabın bütün girişlerini kapatır. Push abonelikleri değişmez.
    [Authorize, HttpPost("logout-all")]
    [ProducesResponseType(204)]
    public async Task<IActionResult> LogoutAll(CancellationToken ct)
    {
        await auth.LogoutAllAsync(UserId, ct);
        SessionCookie.Delete(HttpContext);
        return NoContent();
    }
    // Cookie öncesi sid'siz Bearer tokenı bir kez oturum cookie'sine taşır.
    [Authorize, HttpPost("session/adopt"), EnableRateLimiting("auth")]
    [ProducesResponseType(typeof(UserSummary), 200)]
    public async Task<ActionResult<UserSummary>> Adopt(CancellationToken ct)
    {
        var header = Request.Headers.Authorization.ToString();
        if (SessionId is not null || !header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            || !long.TryParse(User.FindFirst(JwtRegisteredClaimNames.Iat)?.Value, out var iat))
            return Problem(statusCode: 400, title: "Bu giriş zaten bir oturum.", extensions: new Dictionary<string, object?> { ["code"] = "session_not_legacy" });
        var signIn = await auth.AdoptAsync(UserId, header["Bearer ".Length..].Trim(), DateTimeOffset.FromUnixTimeSeconds(iat), Family(), ct);
        SessionCookie.Write(HttpContext, signIn.Response.AccessToken);
        return signIn.Response.User;
    }
    [HttpPost("google"), EnableRateLimiting("auth")]
    public async Task<AuthResponse> Google(GoogleRequest request, CancellationToken ct)
    {
        var signIn = await google.LoginAsync(request.IdToken, Family(), ct);
        SessionCookie.Write(HttpContext, signIn.Response.AccessToken);
        return signIn.Response;
    }
    [Authorize, HttpPost("google/link"), EnableRateLimiting("auth")]
    [ProducesResponseType(204)]
    public async Task<IActionResult> LinkGoogle(GoogleRequest request, CancellationToken ct)
    {
        EnsureGoogleEnabled();
        var browser = HttpContext.Items.ContainsKey(SessionCookie.FromCookieItem);
        if ((browser || request.ExpectedUserId.HasValue) && request.ExpectedUserId != UserId)
            throw new UseCaseException(ErrorKind.NotFound, "google_owner_changed", "Hesap değişti. Girişini kontrol et.");
        try
        {
            await google.LinkAsync(UserId, request.IdToken, ct, browser ? challenge.Read(HttpContext) : null);
        }
        catch (UseCaseException error) when (error.Code is "google_invalid" or "google_challenge_invalid")
        {
            // Google kanıtı geçersizken mevcut uygulama oturumu hâlâ geçerlidir.
            throw new UseCaseException(ErrorKind.Validation, error.Code, error.Message);
        }
        if (browser) challenge.Clear(HttpContext);
        return NoContent();
    }

    [HttpGet("google/config")]
    public GoogleAuthConfigView GoogleConfig()
    {
        Response.Headers.CacheControl = "no-store, private";
        var enabled = googleSettings.Value.Enabled && !string.IsNullOrWhiteSpace(googleSettings.Value.ClientId);
        return enabled ? new(true, googleSettings.Value.ClientId, challenge.Create(HttpContext)) : new(false, null, null);
    }

    [HttpPost("session/google"), EnableRateLimiting("auth")]
    public async Task<UserSummary> GoogleSession(GoogleRequest request, CancellationToken ct)
    {
        EnsureGoogleEnabled();
        var nonce = challenge.Read(HttpContext);
        var signIn = await google.LoginAsync(request.IdToken, Family(), ct, nonce);
        SessionCookie.Write(HttpContext, signIn.Response.AccessToken);
        challenge.Clear(HttpContext);
        return signIn.Response.User;
    }

    private void EnsureGoogleEnabled()
    {
        if (!googleSettings.Value.Enabled) throw new UseCaseException(ErrorKind.Unavailable, "google_disabled", "Google girişi şu anda kapalı.");
        if (string.IsNullOrWhiteSpace(googleSettings.Value.ClientId)) throw new UseCaseException(ErrorKind.Unavailable, "google_not_configured", "Google girişi henüz yapılandırılmadı.");
    }

    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    private Guid? SessionId => Guid.TryParse(User.FindFirst(JwtRegisteredClaimNames.Sid)?.Value, out var sid) ? sid : null;
    private string Family() => SessionCookie.BrowserFamily(Request.Headers.UserAgent.ToString());
}

public sealed class RegisterRequest
{
    [Required, EmailAddress, StringLength(320)] public string Email { get; set; } = "";
    [Required(AllowEmptyStrings = true), MinLength(6)] public string Password { get; set; } = "";
    [StringLength(100)] public string? DisplayName { get; set; }
}
public sealed class LoginRequest
{
    [Required, EmailAddress, StringLength(320)] public string Email { get; set; } = "";
    [Required(AllowEmptyStrings = true)] public string Password { get; set; } = "";
}
public sealed class GoogleRequest
{
    [Required, StringLength(20000)] public string IdToken { get; set; } = "";
    public Guid? ExpectedUserId { get; set; }
}
public sealed record GoogleAuthConfigView(bool Enabled, string? ClientId, string? Nonce);
public sealed class ChangePasswordRequest
{
    [Required] public Guid ExpectedUserId { get; set; }
    [Required(AllowEmptyStrings = true)] public string CurrentPassword { get; set; } = "";
    [Required(AllowEmptyStrings = true), MinLength(6)] public string NewPassword { get; set; } = "";
}

public sealed class SetPasswordRequest
{
    [Required] public Guid ExpectedUserId { get; set; }
    [Required, StringLength(20000)] public string IdToken { get; set; } = "";
    [Required(AllowEmptyStrings = true), MinLength(6)] public string NewPassword { get; set; } = "";
}

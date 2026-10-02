using System.ComponentModel.DataAnnotations;
using Adhd.Application.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Adhd.Api.Controllers;

[ApiController, Route("api/auth")]
public sealed class AuthController(AuthService auth, IUserStore users, GoogleAuthService google) : ControllerBase
{
    [HttpPost("register"), EnableRateLimiting("auth")]
    [ProducesResponseType(typeof(AuthResponse), 201)]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request, CancellationToken ct)
    {
        var response = await auth.RegisterAsync(request.Email, request.Password, request.DisplayName, ct);
        return Created("/api/auth/me", response);
    }
    [HttpPost("login"), EnableRateLimiting("auth")]
    public Task<AuthResponse> Login(LoginRequest request, CancellationToken ct) => auth.LoginAsync(request.Email, request.Password, ct);
    [Authorize, HttpGet("me")]
    public async Task<UserSummary> Me(CancellationToken ct) => AuthService.Summary((await users.FindByIdAsync(Guid.Parse(User.FindFirst("sub")!.Value), ct))!);
    [Authorize, HttpPost("logout")]
    [ProducesResponseType(204)]
    public IActionResult Logout() => NoContent();
    [HttpPost("google"), EnableRateLimiting("auth")]
    public Task<AuthResponse> Google(GoogleRequest request, CancellationToken ct) => google.LoginAsync(request.IdToken, ct);
    [Authorize, HttpPost("google/link"), EnableRateLimiting("auth")]
    [ProducesResponseType(204)]
    public async Task<IActionResult> LinkGoogle(GoogleRequest request, CancellationToken ct)
    {
        await google.LinkAsync(Guid.Parse(User.FindFirst("sub")!.Value), request.IdToken, ct);
        return NoContent();
    }
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
}

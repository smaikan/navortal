using System.ComponentModel.DataAnnotations;
using Adhd.Application.Auth;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Adhd.Api.Controllers;

[ApiController, Route("api/auth"), EnableRateLimiting("auth")]
public sealed class PasswordResetController(PasswordResetService service) : ControllerBase
{
    [HttpPost("forgot-password")]
    [ProducesResponseType(typeof(ForgotPasswordResponse), 202)]
    public async Task<IActionResult> Forgot(ForgotPasswordRequest request, CancellationToken ct)
    {
        await service.ForgotAsync(request.Email, ct);
        return Accepted(new ForgotPasswordResponse("Hesabınız uygunsa şifre sıfırlama bağlantısı gönderilecek."));
    }
    [HttpPost("reset-password")]
    [ProducesResponseType(204)]
    public async Task<IActionResult> Reset(ResetPasswordRequest request, CancellationToken ct)
    {
        await service.ResetAsync(request.Token, request.NewPassword, ct);
        return NoContent();
    }
}
public sealed record ForgotPasswordResponse(string Message);
public sealed class ForgotPasswordRequest
{
    [Required, EmailAddress, StringLength(320)] public string Email { get; set; } = "";
}
public sealed class ResetPasswordRequest
{
    [Required, StringLength(64, MinimumLength = 64)] public string Token { get; set; } = "";
    [Required(AllowEmptyStrings = true), MinLength(6)] public string NewPassword { get; set; } = "";
}

using System.Security.Cryptography;
using System.Text;
using Adhd.Application.Common;
using Adhd.Domain.Users;

namespace Adhd.Application.Auth;

public interface IPasswordResetStore
{
    Task AddAsync(PasswordResetRequest request, CancellationToken ct);
    Task DeleteAsync(Guid id, CancellationToken ct);
    Task<AppUser?> FindUserAsync(string tokenHash, DateTimeOffset now, CancellationToken ct);
    Task<bool> ConsumeAsync(Guid userId, string tokenHash, string passwordHash, DateTimeOffset now, CancellationToken ct);
}
public interface IResetMailSender
{
    bool IsConfigured { get; }
    Task<bool> SendAsync(string email, string token, CancellationToken ct);
}

public sealed class PasswordResetService(IUserStore users, IPasswordResetStore resets, IPasswordService passwords, IResetMailSender mail, IAuthSessionStore sessions, TimeProvider clock)
{
    public async Task ForgotAsync(string email, CancellationToken ct)
    {
        if (!mail.IsConfigured) return;
        var user = await users.FindByEmailAsync(AuthService.NormalizeEmail(email), ct);
        if (user?.PasswordHash is null) return;
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var now = clock.GetUtcNow();
        var request = new PasswordResetRequest
        {
            Id = Guid.CreateVersion7(), UserId = user.Id, TokenHash = Hash(token),
            CreatedAt = now, ExpiresAt = now.AddMinutes(30)
        };
        await resets.AddAsync(request, ct);
        if (!await mail.SendAsync(user.Email, token, ct)) await resets.DeleteAsync(request.Id, ct);
    }
    public async Task ResetAsync(string token, string newPassword, CancellationToken ct)
    {
        if (newPassword.Length < 6)
            throw new UseCaseException(ErrorKind.Validation, "password_too_short", "Şifre en az 6 karakter olmalı.");
        var hash = Hash(token);
        var now = clock.GetUtcNow();
        var user = await resets.FindUserAsync(hash, now, ct);
        if (user?.PasswordHash is null || !await resets.ConsumeAsync(user.Id, hash, passwords.Hash(user, newPassword), now, ct))
            throw new UseCaseException(ErrorKind.Validation, "reset_invalid", "Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.");
        // Parola değişince eski token kopyaları dahil bütün girişleri kapat
        await sessions.RevokeAllAsync(user.Id, now, ct);
    }
    public static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}

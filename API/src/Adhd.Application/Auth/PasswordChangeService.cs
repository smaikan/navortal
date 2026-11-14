using Adhd.Application.Common;
using Adhd.Domain.Users;

namespace Adhd.Application.Auth;

public interface IPasswordChangeStore
{
    Task<(AppUser User, Guid SessionId)?> ChangeAsync(Guid userId, Guid sessionId, string? expectedHash, string passwordHash, string family, DateTimeOffset now, CancellationToken ct);
}

public sealed class PasswordChangeService(IUserStore users, IPasswordService passwords, IPasswordChangeStore store, IAccessTokenIssuer tokens, TimeProvider clock)
{
    public async Task<SignIn> CreateAsync(Guid userId, Guid sessionId, Guid expectedUserId, string newPassword, string family, CancellationToken ct)
    {
        if (userId != expectedUserId)
            throw new UseCaseException(ErrorKind.Conflict, "account_changed", "Hesap değişti. Hesap ayarlarını yeniden aç.");
        if (newPassword.Length < 6)
            throw new UseCaseException(ErrorKind.Validation, "password_too_short", "Parola en az 6 karakter olmalı.");
        var user = await users.FindByIdAsync(userId, ct)
            ?? throw new UseCaseException(ErrorKind.Unauthenticated, "unauthorized", "Yeniden giriş yap.");
        if (user.PasswordHash is not null)
            throw new UseCaseException(ErrorKind.Conflict, "password_already_set", "Bu hesapta zaten parola var. Parolayı değiştir seçeneğini kullan.");
        var result = await store.ChangeAsync(userId, sessionId, null, passwords.Hash(user, newPassword), family, clock.GetUtcNow(), ct)
            ?? throw new UseCaseException(ErrorKind.Conflict, "credentials_changed", "Parolan veya oturumun değişti. Yeniden giriş yap.");
        return new(new(tokens.Issue(result.User, result.SessionId), "Bearer", AuthService.Summary(result.User)), result.SessionId);
    }

    public async Task<SignIn> ChangeAsync(Guid userId, Guid sessionId, Guid expectedUserId, string currentPassword, string newPassword, string family, CancellationToken ct)
    {
        if (userId != expectedUserId)
            throw new UseCaseException(ErrorKind.Conflict, "account_changed", "Hesap değişti. Hesap ayarlarını yeniden aç.");
        if (newPassword.Length < 6)
            throw new UseCaseException(ErrorKind.Validation, "password_too_short", "Parola en az 6 karakter olmalı.");
        var user = await users.FindByIdAsync(userId, ct);
        if (user?.PasswordHash is null || !passwords.Verify(user, currentPassword))
            throw new UseCaseException(ErrorKind.Validation, "current_password_invalid", "Mevcut parolan doğru değil.");
        if (passwords.Verify(user, newPassword))
            throw new UseCaseException(ErrorKind.Validation, "password_unchanged", "Yeni parolan mevcut parolandan farklı olmalı.");
        var result = await store.ChangeAsync(userId, sessionId, user.PasswordHash, passwords.Hash(user, newPassword), family, clock.GetUtcNow(), ct)
            ?? throw new UseCaseException(ErrorKind.Conflict, "credentials_changed", "Parolan veya oturumun değişti. Yeniden giriş yap.");
        return new(new(tokens.Issue(result.User, result.SessionId), "Bearer", AuthService.Summary(result.User)), result.SessionId);
    }
}

using Adhd.Domain.Users;

namespace Adhd.Application.Auth;

public sealed record UserSummary(Guid Id, string Email, string DisplayName, long ProfileVersion = 1, Guid? PhotoVersion = null, string? GooglePictureUrl = null);
public sealed record AuthResponse(string AccessToken, string TokenType, UserSummary User);
// Giriş sonucu: dış yanıt ve tokenın bağlı olduğu oturum.
public sealed record SignIn(AuthResponse Response, Guid SessionId);
public sealed record SessionState(Guid Id, Guid UserId, DateTimeOffset LastSeenAt, DateTimeOffset? RevokedAt);
public interface IUserStore
{
    Task<AppUser?> FindByEmailAsync(string normalizedEmail, CancellationToken cancellationToken);
    Task<AppUser?> FindByIdAsync(Guid id, CancellationToken cancellationToken);
    Task<bool> TryAddAsync(AppUser user, CancellationToken cancellationToken);
}
public interface IPasswordService
{
    string Hash(AppUser user, string password);
    bool Verify(AppUser user, string password);
}
public interface IAccessTokenIssuer { string Issue(AppUser user, Guid sessionId); }
public interface IAuthSessionStore
{
    // Sadece adoptedTokenHash daha önce taşındıysa null döner. Bkz. adoptedTokenHash
    Task<Guid?> CreateAsync(Guid userId, string userAgentFamily, string? adoptedTokenHash, DateTimeOffset now, CancellationToken ct, string? expectedPasswordHash = null);
    // Sahiplik kontrol edilir, süreçte kısa önbellek var. Buradaki iptal önbelleği hemen temizler.
    Task<SessionState?> FindAsync(Guid userId, Guid sessionId, CancellationToken ct);
    Task TouchAsync(Guid sessionId, DateTimeOffset now, CancellationToken ct);
    Task<bool> RevokeAsync(Guid userId, Guid sessionId, DateTimeOffset now, CancellationToken ct);
    // Bütün oturumları kapatır, daha eski tokenların taşınmasını engeller.
    Task<int> RevokeAllAsync(Guid userId, DateTimeOffset now, CancellationToken ct);
    Task<DateTimeOffset?> ValidAfterAsync(Guid userId, CancellationToken ct);
}

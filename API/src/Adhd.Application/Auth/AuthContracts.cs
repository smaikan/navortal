using Adhd.Domain.Users;

namespace Adhd.Application.Auth;

public sealed record UserSummary(Guid Id, string Email, string DisplayName);
public sealed record AuthResponse(string AccessToken, string TokenType, UserSummary User);
// Giriş sonucunda dışarı dönen yanıt ve tokenın oturumu var.
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
    // adoptedTokenHash daha önce taşındıysa null döndür.
    Task<Guid?> CreateAsync(Guid userId, string userAgentFamily, string? adoptedTokenHash, DateTimeOffset now, CancellationToken ct);
    // Hesabı kontrol et. Bu süreçte kısa süre sakla, iptal olursa hemen temizle.
    Task<SessionState?> FindAsync(Guid userId, Guid sessionId, CancellationToken ct);
    Task TouchAsync(Guid sessionId, DateTimeOffset now, CancellationToken ct);
    Task<bool> RevokeAsync(Guid userId, Guid sessionId, DateTimeOffset now, CancellationToken ct);
    // Bütün oturumları kapat. Eski tokenları yeni oturuma alma.
    Task<int> RevokeAllAsync(Guid userId, DateTimeOffset now, CancellationToken ct);
    Task<DateTimeOffset?> ValidAfterAsync(Guid userId, CancellationToken ct);
}

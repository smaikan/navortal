using System.Security.Cryptography;
using System.Text;
using Adhd.Application.Common;
using Adhd.Domain.Users;

namespace Adhd.Application.Auth;

public sealed class AuthService(IUserStore users, IPasswordService passwords, IAccessTokenIssuer tokens, IAuthSessionStore sessions, TimeProvider clock)
{
    public static readonly TimeSpan TouchInterval = TimeSpan.FromHours(1);

    public async Task<SignIn> RegisterAsync(string email, string password, string? displayName, string userAgentFamily, CancellationToken ct)
    {
        var user = new AppUser
        {
            Id = Guid.CreateVersion7(), Email = email.Trim(), NormalizedEmail = NormalizeEmail(email),
            DisplayName = string.IsNullOrWhiteSpace(displayName) ? email.Trim() : displayName.Trim(),
            CreatedAt = clock.GetUtcNow()
        };
        user.PasswordHash = passwords.Hash(user, password);
        if (!await users.TryAddAsync(user, ct))
            throw new UseCaseException(ErrorKind.Conflict, "email_exists", "Bu e-posta zaten kullanılıyor.");
        return await StartAsync(user, userAgentFamily, ct);
    }
    public async Task<SignIn> LoginAsync(string email, string password, string userAgentFamily, CancellationToken ct)
    {
        var user = await users.FindByEmailAsync(NormalizeEmail(email), ct);
        if (user is null || !passwords.Verify(user, password))
            throw new UseCaseException(ErrorKind.Unauthenticated, "invalid_credentials", "E-posta veya parola hatalı.");
        return await StartAsync(user, userAgentFamily, ct);
    }
    public async Task<SignIn> StartAsync(AppUser user, string userAgentFamily, CancellationToken ct)
    {
        var sid = await sessions.CreateAsync(user.Id, userAgentFamily, null, clock.GetUtcNow(), ct)
            ?? throw new InvalidOperationException("A new session cannot collide with an adopted token.");
        return new(new(tokens.Issue(user, sid), "Bearer", Summary(user)), sid);
    }
    // Aktif oturumun cookie'sini yenilemek için aynı oturuma token üret.
    public async Task<string?> RefreshAsync(Guid userId, Guid sessionId, CancellationToken ct)
    {
        if (await sessions.FindAsync(userId, sessionId, ct) is not { RevokedAt: null }) return null;
        var user = await users.FindByIdAsync(userId, ct);
        return user is null ? null : tokens.Issue(user, sessionId);
    }
    // Sid'siz eski tokenı bir kere oturuma dönüştür.
    public async Task<SignIn> AdoptAsync(Guid userId, string legacyToken, DateTimeOffset issuedAt, string userAgentFamily, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(userId, ct)
            ?? throw new UseCaseException(ErrorKind.Unauthenticated, "adopt_refused", "Oturum taşınamadı. Yeniden giriş yap.");
        if (await sessions.ValidAfterAsync(user.Id, ct) is { } after && issuedAt < after)
            throw new UseCaseException(ErrorKind.Unauthenticated, "adopt_refused", "Oturum taşınamadı. Yeniden giriş yap.");
        var sid = await sessions.CreateAsync(user.Id, userAgentFamily, TokenHash(legacyToken), clock.GetUtcNow(), ct)
            ?? throw new UseCaseException(ErrorKind.Unauthenticated, "adopt_refused", "Oturum taşınamadı. Yeniden giriş yap.");
        return new(new(tokens.Issue(user, sid), "Bearer", Summary(user)), sid);
    }
    public Task<bool> LogoutAsync(Guid userId, Guid sessionId, CancellationToken ct) => sessions.RevokeAsync(userId, sessionId, clock.GetUtcNow(), ct);
    public Task<int> LogoutAllAsync(Guid userId, CancellationToken ct) => sessions.RevokeAllAsync(userId, clock.GetUtcNow(), ct);
    // Oturum açıksa true. LastSeenAt en sık TouchInterval aralığında yenilenir.
    public async Task<bool> ValidateAsync(Guid userId, Guid sessionId, CancellationToken ct)
    {
        var state = await sessions.FindAsync(userId, sessionId, ct);
        if (state is not { RevokedAt: null }) return false;
        var now = clock.GetUtcNow();
        if (now - state.LastSeenAt >= TouchInterval) await sessions.TouchAsync(sessionId, now, ct);
        return true;
    }
    public static string NormalizeEmail(string email) => email.Trim().ToUpperInvariant();
    public static UserSummary Summary(AppUser u) => new(u.Id, u.Email, u.DisplayName);
    public static string TokenHash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}

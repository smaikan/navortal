using Adhd.Application.Common;
using Adhd.Domain.Users;

namespace Adhd.Application.Auth;

public sealed class AuthService(IUserStore users, IPasswordService passwords, IAccessTokenIssuer tokens, TimeProvider clock)
{
    public async Task<AuthResponse> RegisterAsync(string email, string password, string? displayName, CancellationToken ct)
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
        return Response(user);
    }
    public async Task<AuthResponse> LoginAsync(string email, string password, CancellationToken ct)
    {
        var user = await users.FindByEmailAsync(NormalizeEmail(email), ct);
        if (user is null || !passwords.Verify(user, password))
            throw new UseCaseException(ErrorKind.Unauthenticated, "invalid_credentials", "E-posta veya parola hatalı.");
        return Response(user);
    }
    public static string NormalizeEmail(string email) => email.Trim().ToUpperInvariant();
    public static UserSummary Summary(AppUser u) => new(u.Id, u.Email, u.DisplayName);
    private AuthResponse Response(AppUser user) => new(tokens.Issue(user), "Bearer", Summary(user));
}

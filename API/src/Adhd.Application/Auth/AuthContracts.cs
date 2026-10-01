using Adhd.Domain.Users;

namespace Adhd.Application.Auth;

public sealed record UserSummary(Guid Id, string Email, string DisplayName);
public sealed record AuthResponse(string AccessToken, string TokenType, UserSummary User);
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
public interface IAccessTokenIssuer { string Issue(AppUser user); }

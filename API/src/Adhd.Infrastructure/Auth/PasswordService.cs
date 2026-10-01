using Adhd.Application.Auth;
using Adhd.Domain.Users;
using Microsoft.AspNetCore.Identity;

namespace Adhd.Infrastructure.Auth;

public sealed class PasswordService : IPasswordService
{
    private readonly PasswordHasher<AppUser> hasher = new();
    public string Hash(AppUser user, string password) => hasher.HashPassword(user, password);
    public bool Verify(AppUser user, string password) => user.PasswordHash is not null
        && hasher.VerifyHashedPassword(user, user.PasswordHash, password) != PasswordVerificationResult.Failed;
}

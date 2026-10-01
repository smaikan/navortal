using Adhd.Application.Common;
using Adhd.Domain.Users;

namespace Adhd.Application.Auth;

public sealed record GoogleIdentity(string Subject, string Email, string? Name, bool EmailVerified);
public interface IGoogleTokenVerifier { Task<GoogleIdentity> VerifyAsync(string credential, CancellationToken ct); }
public interface IGoogleAccountStore
{
    Task<AppUser?> FindAsync(string subject, CancellationToken ct);
    Task<bool> TryCreateAsync(AppUser user, string subject, CancellationToken ct);
    Task<bool> TryLinkAsync(Guid userId, string subject, CancellationToken ct);
}

public sealed class GoogleAuthService(IGoogleTokenVerifier verifier, IGoogleAccountStore accounts, IUserStore users, IAccessTokenIssuer tokens, TimeProvider clock)
{
    public async Task<AuthResponse> LoginAsync(string credential, CancellationToken ct)
    {
        var proof = await Verify(credential, ct);
        var existing = await accounts.FindAsync(proof.Subject, ct);
        if (existing is not null) return Respond(existing);
        if (await users.FindByEmailAsync(AuthService.NormalizeEmail(proof.Email), ct) is not null) throw LinkRequired();
        var user = new AppUser
        {
            Id = Guid.CreateVersion7(), Email = proof.Email, NormalizedEmail = AuthService.NormalizeEmail(proof.Email),
            DisplayName = string.IsNullOrWhiteSpace(proof.Name) ? proof.Email : proof.Name,
            CreatedAt = clock.GetUtcNow()
        };
        if (await accounts.TryCreateAsync(user, proof.Subject, ct)) return Respond(user);
        existing = await accounts.FindAsync(proof.Subject, ct);
        return existing is not null ? Respond(existing) : throw LinkRequired();
    }
    public async Task LinkAsync(Guid userId, string credential, CancellationToken ct)
    {
        var proof = await Verify(credential, ct);
        var existing = await accounts.FindAsync(proof.Subject, ct);
        if (existing?.Id == userId) return;
        if (existing is not null) throw LinkedElsewhere();
        if (!await accounts.TryLinkAsync(userId, proof.Subject, ct))
        {
            existing = await accounts.FindAsync(proof.Subject, ct);
            if (existing?.Id != userId) throw LinkedElsewhere();
        }
    }
    private async Task<GoogleIdentity> Verify(string credential, CancellationToken ct)
    {
        var proof = await verifier.VerifyAsync(credential, ct);
        if (!proof.EmailVerified || string.IsNullOrWhiteSpace(proof.Subject) || string.IsNullOrWhiteSpace(proof.Email)
            || proof.Email.Length > 320 || proof.Subject.Length > 255 || proof.Name?.Length > 320)
            throw new UseCaseException(ErrorKind.Unauthenticated, "google_invalid", "Google kimliği doğrulanamadı.");
        return proof;
    }
    private AuthResponse Respond(AppUser user) => new(tokens.Issue(user), "Bearer", AuthService.Summary(user));
    private static UseCaseException LinkRequired() => new(ErrorKind.Conflict, "google_link_required", "Mevcut hesabınızla giriş yapıp Google hesabını bağlayın.");
    private static UseCaseException LinkedElsewhere() => new(ErrorKind.Conflict, "google_already_linked", "Google hesabı başka bir hesaba bağlı.");
}

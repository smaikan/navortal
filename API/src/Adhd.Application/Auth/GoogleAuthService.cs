using System.Globalization;
using System.Text;
using System.Security.Cryptography;
using Adhd.Application.Common;
using Adhd.Domain.Users;

namespace Adhd.Application.Auth;

public sealed record GoogleIdentity(
    string Subject,
    string Email,
    string? Name,
    bool EmailVerified,
    string? GivenName = null,
    string? FamilyName = null,
    string? Picture = null,
    string? HostedDomain = null,
    string? Nonce = null);

public sealed record GoogleProfileImport(string? FirstName, string? LastName, string? DisplayName, string? GooglePictureUrl);

public interface IGoogleTokenVerifier { Task<GoogleIdentity> VerifyAsync(string credential, CancellationToken ct); }
public interface IGoogleAccountStore
{
    Task<AppUser?> FindAsync(string subject, CancellationToken ct);
    Task<bool> TryCreateAsync(AppUser user, string subject, CancellationToken ct);
    Task<bool> TryLinkAsync(Guid userId, string subject, CancellationToken ct, GoogleProfileImport? import = null, long? expectedVersion = null);
}

public sealed class GoogleAuthService(IGoogleTokenVerifier verifier, IGoogleAccountStore accounts, IUserStore users, AuthService auth, TimeProvider clock)
{
    public async Task<SignIn> LoginAsync(string credential, string userAgentFamily, CancellationToken ct, string? expectedNonce = null)
    {
        var proof = await Verify(credential, ct, expectedNonce);

        // 1. sub lookup first
        var existing = await accounts.FindAsync(proof.Subject, ct);
        if (existing is not null) return await auth.StartAsync(existing, userAgentFamily, ct);

        // 2. lookup matching normalized email
        var normalizedEmail = AuthService.NormalizeEmail(proof.Email);
        var matched = await users.FindByEmailAsync(normalizedEmail, ct);
        if (matched is not null)
        {
            // Auto-link matching normalized email ONLY for verified Gmail or hd-backed Workspace
            if (!IsAuthoritativeGoogleEmail(proof))
                throw LinkRequired();

            var import = DetermineProfileImport(matched, proof);
            var linked = await accounts.TryLinkAsync(matched.Id, proof.Subject, ct, import, matched.Version);
            if (!linked)
            {
                existing = await accounts.FindAsync(proof.Subject, ct);
                if (existing is null || existing.Id != matched.Id)
                    throw LinkedElsewhere();
                return await auth.StartAsync(existing, userAgentFamily, ct);
            }

            var current = await users.FindByIdAsync(matched.Id, ct) ?? matched;
            return await auth.StartAsync(current, userAgentFamily, ct);
        }

        // 3. New account creation
        var (given, family, displayName) = ResolveNames(proof);
        var newUser = new AppUser
        {
            Id = Guid.CreateVersion7(),
            Email = proof.Email.Trim(),
            NormalizedEmail = normalizedEmail,
            DisplayName = displayName,
            FirstName = string.IsNullOrWhiteSpace(given) ? null : given,
            LastName = string.IsNullOrWhiteSpace(family) ? null : family,
            GooglePictureUrl = SanitizeGooglePictureUrl(proof.Picture),
            CreatedAt = clock.GetUtcNow(),
            Version = 1
        };

        if (await accounts.TryCreateAsync(newUser, proof.Subject, ct))
            return await auth.StartAsync(newUser, userAgentFamily, ct);

        // 4. Creation failed due to race condition (unique violation on subject or normalizedEmail)
        existing = await accounts.FindAsync(proof.Subject, ct);
        if (existing is not null)
            return await auth.StartAsync(existing, userAgentFamily, ct);

        var conflict = await users.FindByEmailAsync(normalizedEmail, ct);
        if (conflict is not null)
        {
            if (!IsAuthoritativeGoogleEmail(proof))
                throw LinkRequired();

            var import = DetermineProfileImport(conflict, proof);
            if (await accounts.TryLinkAsync(conflict.Id, proof.Subject, ct, import, conflict.Version))
            {
                var current = await users.FindByIdAsync(conflict.Id, ct) ?? conflict;
                return await auth.StartAsync(current, userAgentFamily, ct);
            }

            existing = await accounts.FindAsync(proof.Subject, ct);
            if (existing is not null && existing.Id == conflict.Id)
                return await auth.StartAsync(existing, userAgentFamily, ct);
        }

        throw LinkRequired();
    }

    public async Task LinkAsync(Guid userId, string credential, CancellationToken ct, string? expectedNonce = null)
    {
        var proof = await Verify(credential, ct, expectedNonce);
        var existing = await accounts.FindAsync(proof.Subject, ct);
        if (existing?.Id == userId) return;
        if (existing is not null) throw LinkedElsewhere();

        var targetUser = await users.FindByIdAsync(userId, ct)
            ?? throw new UseCaseException(ErrorKind.Unauthenticated, "unauthorized", "Kullanıcı bulunamadı.");

        var import = DetermineProfileImport(targetUser, proof);
        if (!await accounts.TryLinkAsync(userId, proof.Subject, ct, import, targetUser.Version))
        {
            existing = await accounts.FindAsync(proof.Subject, ct);
            if (existing?.Id != userId) throw LinkedElsewhere();
        }
    }

    public static string TruncateNamePart(string? value, int max = 50)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var sanitized = new string(value.Where(c => !char.IsControl(c)).ToArray()).Trim();
        if (sanitized.Length == 0) return "";
        if (sanitized.Length <= max) return sanitized;

        var enumerator = StringInfo.GetTextElementEnumerator(sanitized);
        var sb = new StringBuilder();
        var count = 0;
        while (enumerator.MoveNext())
        {
            var element = enumerator.GetTextElement();
            if (count + 1 > max || sb.Length + element.Length > max)
                break;
            sb.Append(element);
            count++;
        }
        return sb.ToString().Trim();
    }

    public static (string FirstName, string LastName, string DisplayName) ResolveNames(GoogleIdentity proof)
    {
        var given = TruncateNamePart(proof.GivenName);
        var family = TruncateNamePart(proof.FamilyName);

        if (string.IsNullOrWhiteSpace(given) && !string.IsNullOrWhiteSpace(proof.Name))
        {
            given = TruncateNamePart(proof.Name);
        }

        string displayName;
        if (!string.IsNullOrWhiteSpace(given))
        {
            displayName = string.IsNullOrWhiteSpace(family) ? given : $"{given} {family}";
        }
        else if (!string.IsNullOrWhiteSpace(proof.Name))
        {
            displayName = proof.Name.Trim();
        }
        else
        {
            displayName = proof.Email.Trim();
        }

        if (displayName.Length > 320)
            displayName = displayName[..320].Trim();

        return (given, family, displayName);
    }

    public static string? SanitizeGooglePictureUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url) || url.Length > 2048) return null;
        if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri)) return null;
        if (uri.Scheme != Uri.UriSchemeHttps) return null;
        if (!uri.IsDefaultPort && uri.Port != 443) return null;
        if (!string.IsNullOrEmpty(uri.UserInfo)) return null;
        var host = uri.IdnHost;
        var isGoogle = host.Equals("googleusercontent.com", StringComparison.OrdinalIgnoreCase)
            || (host.EndsWith(".googleusercontent.com", StringComparison.OrdinalIgnoreCase) && !host.StartsWith('.'));
        return isGoogle && uri.AbsoluteUri.Length <= 2048 ? uri.AbsoluteUri : null;
    }

    public static bool IsAuthoritativeGoogleEmail(GoogleIdentity proof)
    {
        if (!proof.EmailVerified) return false;
        if (!string.IsNullOrWhiteSpace(proof.HostedDomain)) return true;
        var email = proof.Email.Trim();
        return email.EndsWith("@gmail.com", StringComparison.OrdinalIgnoreCase);
    }

    public static GoogleProfileImport? DetermineProfileImport(AppUser user, GoogleIdentity proof)
    {
        var hasRealFirstName = !string.IsNullOrWhiteSpace(user.FirstName)
            || (!string.IsNullOrWhiteSpace(user.DisplayName) && !string.Equals(user.DisplayName, user.Email, StringComparison.OrdinalIgnoreCase));

        string? importFirst = null;
        string? importLast = null;
        string? importDisplay = null;

        if (!hasRealFirstName)
        {
            var (given, family, displayName) = ResolveNames(proof);
            if (!string.IsNullOrWhiteSpace(given))
            {
                importFirst = given;
                importLast = string.IsNullOrWhiteSpace(user.LastName) ? family : null;
                var last = importLast ?? user.LastName ?? "";
                importDisplay = string.IsNullOrWhiteSpace(last) ? importFirst : $"{importFirst} {last}";
            }
        }

        string? importPicture = null;
        if (user.GooglePictureUrl is null)
        {
            var safeUrl = SanitizeGooglePictureUrl(proof.Picture);
            if (safeUrl is not null)
                importPicture = safeUrl;
        }

        if (importFirst is null && importPicture is null)
            return null;

        return new GoogleProfileImport(importFirst, importLast, importDisplay, importPicture);
    }

    private async Task<GoogleIdentity> Verify(string credential, CancellationToken ct, string? expectedNonce)
    {
        var proof = await verifier.VerifyAsync(credential, ct);
        if (!proof.EmailVerified || string.IsNullOrWhiteSpace(proof.Subject) || string.IsNullOrWhiteSpace(proof.Email)
            || proof.Email.Length > 320 || proof.Subject.Length > 255 || proof.Name?.Length > 320
            || proof.GivenName?.Length > 320 || proof.FamilyName?.Length > 320
            || proof.HostedDomain?.Length > 255 || proof.Nonce?.Length > 255)
            throw new UseCaseException(ErrorKind.Unauthenticated, "google_invalid", "Google kimliği doğrulanamadı.");
        if (expectedNonce is not null && (proof.Nonce is null || !CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expectedNonce), Encoding.UTF8.GetBytes(proof.Nonce))))
            throw new UseCaseException(ErrorKind.Unauthenticated, "google_challenge_invalid", "Google girişi için sayfayı yenileyip yeniden dene.");
        return proof;
    }

    private static UseCaseException LinkRequired() => new(ErrorKind.Conflict, "google_link_required", "Mevcut hesabınızla giriş yapıp Google hesabını bağlayın.");
    private static UseCaseException LinkedElsewhere() => new(ErrorKind.Conflict, "google_already_linked", "Google hesabı başka bir hesaba bağlı.");
}

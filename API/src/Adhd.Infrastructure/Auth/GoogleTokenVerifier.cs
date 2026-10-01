using Adhd.Application.Auth;
using Adhd.Application.Common;
using Google.Apis.Auth;
using Microsoft.Extensions.Options;

namespace Adhd.Infrastructure.Auth;

public sealed class GoogleSettings
{
    public bool Enabled { get; set; }
    public string ClientId { get; set; } = "";
}

public sealed class GoogleTokenVerifier(IOptions<GoogleSettings> settings) : IGoogleTokenVerifier
{
    public async Task<GoogleIdentity> VerifyAsync(string credential, CancellationToken ct)
    {
        if (!settings.Value.Enabled)
            throw new UseCaseException(ErrorKind.Unavailable, "google_disabled", "Google girişi şu anda kapalı.");
        if (string.IsNullOrWhiteSpace(settings.Value.ClientId))
            throw new UseCaseException(ErrorKind.Unavailable, "google_not_configured", "Google girişi henüz yapılandırılmadı.");
        try
        {
            var proof = await GoogleJsonWebSignature.ValidateAsync(credential,
                new GoogleJsonWebSignature.ValidationSettings { Audience = [settings.Value.ClientId] }).WaitAsync(ct);
            return new GoogleIdentity(proof.Subject, proof.Email, proof.Name, proof.EmailVerified);
        }
        catch (InvalidJwtException)
        { throw new UseCaseException(ErrorKind.Unauthenticated, "google_invalid", "Google kimliği doğrulanamadı."); }
    }
}

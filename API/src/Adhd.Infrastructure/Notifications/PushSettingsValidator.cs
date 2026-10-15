using System.Net.Mail;
using System.Security.Cryptography;
using Microsoft.Extensions.Options;

namespace Adhd.Infrastructure.Notifications;

// Abonelik sunulmadan veya dış gönderimden önce açık push ayarı kontrol edilir. Değerler hata içine girmez.
public sealed class PushSettingsValidator : IValidateOptions<PushSettings>
{
    public ValidateOptionsResult Validate(string? name, PushSettings options)
    {
        if (!options.Enabled) return ValidateOptionsResult.Success;
        var errors = new List<string>();
        if (!Contact(options.Subject)) errors.Add("Push:Subject must be a mailto mailbox or an HTTPS contact URI without credentials or a fragment.");
        try
        {
            var publicBytes = Key(options.PublicKey, 65); var privateBytes = Key(options.PrivateKey, 32);
            if (publicBytes[0] != 4) throw new CryptographicException();
            var point = new ECPoint { X = publicBytes[1..33], Y = publicBytes[33..65] };
            using var signing = ECDsa.Create(new ECParameters { Curve = ECCurve.NamedCurves.nistP256, Q = point, D = privateBytes });
            using var verification = ECDsa.Create(new ECParameters { Curve = ECCurve.NamedCurves.nistP256, Q = point });
            var challenge = "adhd.push.configuration-check"u8;
            if (!verification.VerifyData(challenge, signing.SignData(challenge, HashAlgorithmName.SHA256), HashAlgorithmName.SHA256)) throw new CryptographicException();
        }
        catch (Exception e) when (e is FormatException or ArgumentException or CryptographicException)
        {
            errors.Add("Push:PublicKey and Push:PrivateKey must be a matching base64url P-256 key pair.");
        }
        return errors.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(errors);
    }
    private static byte[] Key(string? value, int length)
    {
        if (string.IsNullOrEmpty(value) || value.Length > 100 || value.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('-' or '_'))) throw new FormatException();
        var bytes = PushEndpoints.Decode(value); if (bytes.Length != length) throw new FormatException(); return bytes;
    }
    private static bool Contact(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 2048 || value.Any(char.IsControl) || !Uri.TryCreate(value, UriKind.Absolute, out var uri)) return false;
        if (uri.Scheme == Uri.UriSchemeHttps) return uri.Host.Length > 0 && uri.UserInfo.Length == 0 && uri.Fragment.Length == 0;
        if (uri.Scheme != Uri.UriSchemeMailto || uri.Query.Length > 0 || uri.Fragment.Length > 0) return false;
        var mailbox = value[7..];
        return MailAddress.TryCreate(mailbox, out var address) && address.Address == mailbox && address.Host.Contains('.');
    }
}

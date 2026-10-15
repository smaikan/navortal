using System.Net;
using Adhd.Infrastructure.Auth;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace Adhd.Api.Auth;

// Güvensiz ayarla kimlik veya sıfırlama kodu gönderilmeden hata veriyoruz.
public sealed class SmtpSettingsValidator(IHostEnvironment environment) : IValidateOptions<SmtpSettings>
{
    public ValidateOptionsResult Validate(string? name, SmtpSettings settings)
    {
        if (!settings.Enabled) return ValidateOptionsResult.Success;
        var errors = new List<string>();
        var localEnvironment = environment.IsDevelopment() || environment.IsEnvironment("Testing");
        var loopbackHost = string.Equals(settings.Host, "localhost", StringComparison.OrdinalIgnoreCase)
            || (IPAddress.TryParse(settings.Host, out var address) && IPAddress.IsLoopback(address));
        if (string.IsNullOrWhiteSpace(settings.Host) || Uri.CheckHostName(settings.Host) == UriHostNameType.Unknown)
            errors.Add("Smtp:Host must be a host name or IP address.");
        if (settings.Port is < 1 or > 65535) errors.Add("Smtp:Port must be between 1 and 65535.");
        if (settings.Security is not (SecureSocketOptions.StartTls or SecureSocketOptions.SslOnConnect)
            && !(settings.Security == SecureSocketOptions.None && localEnvironment && loopbackHost))
            errors.Add("Smtp:Security requires StartTls or SslOnConnect; None is permitted only for loopback in Development/Testing.");
        if (string.IsNullOrWhiteSpace(settings.From) || settings.From.Contains('\r') || settings.From.Contains('\n')
            || !MailboxAddress.TryParse(settings.From, out var mailbox) || !mailbox.Address.Contains('@'))
            errors.Add("Smtp:From must be a valid single mailbox.");
        if (!Uri.TryCreate(settings.ResetPageUrl, UriKind.Absolute, out var reset)
            || !(reset.Scheme == Uri.UriSchemeHttps || (reset.Scheme == Uri.UriSchemeHttp && localEnvironment && reset.IsLoopback))
            || !string.IsNullOrEmpty(reset.UserInfo) || !string.IsNullOrEmpty(reset.Query)
            || reset.Fragment is not ("" or "#"))
            errors.Add("Smtp:ResetPageUrl requires an absolute HTTPS URL without user info/query; an empty # fragment is allowed. HTTP is permitted only for loopback in Development/Testing.");
        // SMTP ayar hatasında değeri yazma. Alan adı ve kural yeterli
        return errors.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(errors);
    }
}

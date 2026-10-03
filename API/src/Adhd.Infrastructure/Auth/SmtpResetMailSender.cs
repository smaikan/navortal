using Adhd.Application.Auth;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;

namespace Adhd.Infrastructure.Auth;

public sealed class SmtpSettings
{
    public bool Enabled { get; set; }
    public string Host { get; set; } = "";
    public int Port { get; set; } = 587;
    public SecureSocketOptions Security { get; set; } = SecureSocketOptions.StartTls;
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    public string From { get; set; } = "";
    public string ResetPageUrl { get; set; } = "";
}

public sealed class SmtpResetMailSender(IOptions<SmtpSettings> settings, ILogger<SmtpResetMailSender> logger) : IResetMailSender
{
    public bool IsConfigured => settings.Value.Enabled;
    public async Task<bool> SendAsync(string email, string token, CancellationToken ct)
    {
        var c = settings.Value;
        try
        {
            var link = c.ResetPageUrl + (c.ResetPageUrl.Contains('?') ? "&" : "?") + "token=" + Uri.EscapeDataString(token);
            var message = new MimeMessage();
            message.From.Add(MailboxAddress.Parse(c.From));
            message.To.Add(MailboxAddress.Parse(email));
            message.Subject = "Şifrenizi sıfırlayın";
            message.Body = new TextPart("plain") { Text = $"Şifrenizi değiştirmek için bağlantıyı açın (30 dakika):\n{link}\nBu isteği siz yapmadıysanız dikkate almayın." };
            using var client = new SmtpClient();
            client.Timeout = 10000;
            await client.ConnectAsync(c.Host, c.Port, c.Security, ct);
            if (!string.IsNullOrWhiteSpace(c.Username)) await client.AuthenticateAsync(c.Username, c.Password, ct);
            await client.SendAsync(message, ct);
            await client.DisconnectAsync(true, ct);
            return true;
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            // SMTP hata metninde alıcı ya da içerik olabilir. Bu metni loga alma.
            logger.LogWarning("Password reset delivery failed ({ExceptionType}).", e.GetType().Name);
            return false;
        }
    }
}

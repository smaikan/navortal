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
            // Fragment stays in the browser: never put a reset code in an HTTP query.
            var link = new UriBuilder(c.ResetPageUrl) { Fragment = "?token=" + Uri.EscapeDataString(token) }.Uri.AbsoluteUri;
            var safeLink = System.Net.WebUtility.HtmlEncode(link);
            var message = new MimeMessage();
            message.From.Add(MailboxAddress.Parse(c.From));
            message.To.Add(MailboxAddress.Parse(email));
            message.Subject = "Navortal · Parolanı sıfırla";
            var body = new BodyBuilder
            {
                TextBody = $"Navortal\n\nMerhaba,\n\nNavortal hesabının parolasını yenilemek için bir istek aldık. Yeni parolanı belirlemek için bağlantıyı aç:\n\n{link}\n\nBu bağlantı 30 dakika boyunca geçerlidir ve yalnızca bir kez kullanılabilir.\n\nBu isteği sen yapmadıysan bu e-postayı yok sayabilirsin. Parolan değişmez. Bağlantıyı kimseyle paylaşma.\n\nNavortal ekibi\nBu e-posta otomatik gönderildi.",
                HtmlBody = $$"""
                    <!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                    <body style="margin:0;background:#f5f7f9;color:#243044;font-family:Arial,sans-serif;line-height:1.6">
                    <main style="max-width:520px;margin:32px auto;padding:32px;background:#ffffff;border-radius:16px">
                    <p style="margin-top:0;font-size:22px;font-weight:700;color:#215b56">Navortal</p>
                    <h1 style="font-size:24px;line-height:1.3">Parolanı sıfırla</h1>
                    <p>Merhaba,</p><p>Navortal hesabının parolasını yenilemek için bir istek aldık. Aşağıdaki düğmeyle yeni parolanı belirleyebilirsin.</p>
                    <p style="margin:28px 0"><a href="{{safeLink}}" style="display:inline-block;padding:12px 24px;background:#215b56;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700">Yeni parola belirle</a></p>
                    <p>Bu bağlantı <strong>30 dakika</strong> boyunca geçerlidir ve yalnızca bir kez kullanılabilir.</p>
                    <p>Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin. Parolan değişmez. Bağlantıyı kimseyle paylaşma.</p>
                    <p style="font-size:13px;color:#526174">Düğme açılmıyorsa bu bağlantıyı tarayıcına kopyala:<br><a href="{{safeLink}}" style="color:#215b56;word-break:break-all">{{safeLink}}</a></p>
                    <p style="margin-bottom:0">Navortal ekibi</p><p style="font-size:12px;color:#526174">Bu e-posta otomatik gönderildi.</p>
                    </main></body></html>
                    """
            };
            message.Body = body.ToMessageBody();
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
            // SMTP hata metninde alıcı ya da içerik olabilir. Bu metni loga alma
            logger.LogWarning("Password reset delivery failed ({ExceptionType}).", e.GetType().Name);
            return false;
        }
    }
}

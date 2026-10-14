using System.Text.RegularExpressions;
using Adhd.Application.Common;

namespace Adhd.Application.ClientErrors;

public enum ClientErrorKind { Error, UnhandledRejection, React }
public sealed record ClientErrorCommand(string Message, ClientErrorKind Kind, string Route, string BuildId, string BrowserFamily, DateTimeOffset OccurredAt);
public interface IClientErrorStore
{
    // Hesap dakika başına 10 veya UTC günü başına 500 sınırını aşarsa raporu saklama, false dön.
    Task<bool> AddAsync(Guid userId, ClientErrorCommand command, DateTimeOffset now, CancellationToken ct);
    Task<int> DeleteOlderThanAsync(DateTimeOffset cutoff, CancellationToken ct);
}

// Tarayıcı hatasını incelemek için al. Sırları ve e-postayı maskele, 30 gün sakla.
public sealed partial class ClientErrorService(IClientErrorStore store, TimeProvider clock)
{
    public static readonly TimeSpan Retention = TimeSpan.FromDays(30);
    public const int PerMinute = 10, PerDay = 500;

    public async Task<bool> ReportAsync(Guid userId, ClientErrorCommand command, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        if (!RoutePattern().IsMatch(command.Route)) throw Invalid("Yol yalnız sayfa yolu olabilir.");
        if (command.OccurredAt > now.AddMinutes(5) || command.OccurredAt < now - Retention) throw Invalid("Hata zamanı geçersiz.");
        var clean = command with { Message = Mask(command.Message), Route = Mask(command.Route), BuildId = Mask(command.BuildId), BrowserFamily = command.BrowserFamily.Trim() };
        return await store.AddAsync(userId, clean, now, ct);
    }

    // JWT, Bearer, uzun hex ya da base64 değerleri ve e-postaları maskele.
    public static string Mask(string value)
    {
        var text = Jwt().Replace(value, "[gizli]");
        text = Bearer().Replace(text, "Bearer [gizli]");
        text = Email().Replace(text, "[e-posta]");
        text = LongSecret().Replace(text, "[gizli]");
        return text.Length <= 500 ? text : text[..500];
    }

    [GeneratedRegex(@"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*")] private static partial Regex Jwt();
    [GeneratedRegex(@"Bearer\s+[A-Za-z0-9._~+/=-]+", RegexOptions.IgnoreCase)] private static partial Regex Bearer();
    [GeneratedRegex(@"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")] private static partial Regex Email();
    [GeneratedRegex(@"(?<![A-Za-z0-9])[A-Za-z0-9+/_=-]{24,}(?![A-Za-z0-9])")] private static partial Regex LongSecret();
    // Sadece adres yolunu tut. Şema, host, sorgu ve fragment'i at.
    [GeneratedRegex(@"^/[A-Za-z0-9/_.\-]{0,199}$")] private static partial Regex RoutePattern();
    private static UseCaseException Invalid(string message) => new(ErrorKind.Validation, "client_error_invalid", message);
}

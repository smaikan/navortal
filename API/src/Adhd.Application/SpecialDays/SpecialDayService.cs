using Adhd.Application.Common;
using Adhd.Domain.SpecialDays;

namespace Adhd.Application.SpecialDays;

public sealed record SpecialDayView(Guid Id, string Title, SpecialDayKind Kind, int Month, int Day, int? Year, SpecialDayRecurrence Recurrence,
    bool NonWorking, SpecialDayReminder Reminder, DateOnly? NextOccurrence, long Version, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset? DeletedAt);
public sealed record SpecialDayPage(SpecialDayView[] Items, int Offset, int Limit, int Total);
// Takvim ve Bugün için özel günün tekrarını sunucuda hesapla.
public sealed record SpecialDayOccurrence(Guid SpecialDayId, DateOnly Date, string Title, SpecialDayKind Kind, bool NonWorking, long Version);
public sealed record SpecialDayOccurrencePage(DateOnly FromDate, DateOnly ToDate, SpecialDayOccurrence[] Items, Adhd.Application.Sync.ReadCoverage? Coverage = null);
public sealed record SpecialDayCommand(string Title, SpecialDayKind Kind, int Month, int Day, int? Year, SpecialDayRecurrence Recurrence, bool NonWorking, SpecialDayReminder Reminder);

public interface ISpecialDayStore
{
    Task<SpecialDayPage> ListAsync(Guid userId, int offset, int limit, CancellationToken ct);
    Task<SpecialDayView> CreateAsync(Guid userId, SpecialDayCommand command, string key, CancellationToken ct);
    Task<SpecialDayView> UpdateAsync(Guid userId, Guid id, long version, SpecialDayCommand command, CancellationToken ct);
    Task<SpecialDayView> DeleteAsync(Guid userId, Guid id, long version, bool restore, CancellationToken ct);
    Task<SpecialDayOccurrencePage> OccurrencesAsync(Guid userId, DateOnly from, DateOnly to, CancellationToken ct);
}

public sealed class SpecialDayService(ISpecialDayStore store)
{
    public Task<SpecialDayPage> ListAsync(Guid userId, int offset, int limit, CancellationToken ct)
    {
        if (offset is < 0 or > 100_000 || limit is < 1 or > 100) throw Invalid("page_invalid", "Sayfa değerleri geçersiz.");
        return store.ListAsync(userId, offset, limit, ct);
    }
    public Task<SpecialDayView> CreateAsync(Guid userId, SpecialDayCommand command, string key, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 128) throw Invalid("idempotency_key_required", "Idempotency-Key gerekli; en çok 128 karakter.");
        return store.CreateAsync(userId, Checked(command), key, ct);
    }
    public Task<SpecialDayView> UpdateAsync(Guid userId, Guid id, long version, SpecialDayCommand command, CancellationToken ct) => store.UpdateAsync(userId, id, version, Checked(command), ct);
    public Task<SpecialDayView> DeleteAsync(Guid userId, Guid id, long version, bool restore, CancellationToken ct) => store.DeleteAsync(userId, id, version, restore, ct);
    public Task<SpecialDayOccurrencePage> OccurrencesAsync(Guid userId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        if (to < from || to.DayNumber - from.DayNumber > 365 || from.Year < 2 || to.Year > 9998) throw Invalid("range_invalid", "1–366 günlük bir aralık seçin.");
        return store.OccurrencesAsync(userId, from, to, ct);
    }
    private static SpecialDayCommand Checked(SpecialDayCommand command)
    {
        command = command with { Title = command.Title?.Trim() ?? "" };
        var error = SpecialDayRules.Validate(command.Title, command.Month, command.Day, command.Year, command.Recurrence);
        return error is null ? command : throw Invalid("special_day_invalid", error);
    }
    private static UseCaseException Invalid(string code, string message) => new(ErrorKind.Validation, code, message);
}

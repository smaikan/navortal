using Adhd.Application.ClientErrors;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.ClientErrors;

// Maskeli tarayıcı hatası. Günlük bakım 30 günden eskisini siler.
public sealed class ClientErrorReport
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Message { get; set; } = "";
    public ClientErrorKind Kind { get; set; }
    public string Route { get; set; } = "";
    public string BuildId { get; set; } = "";
    public string BrowserFamily { get; set; } = "";
    public DateTimeOffset OccurredAt { get; set; }
    public DateTimeOffset ReceivedAt { get; set; }
}

public sealed class ClientErrorStore(PlannerDbContext db) : IClientErrorStore
{
    public async Task<bool> AddAsync(Guid userId, ClientErrorCommand command, DateTimeOffset now, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Aynı hesabın raporlarını sıraya al. Paralel istekler dakika ve gün sınırını aşmasın.
        await db.PlanningStates.FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\" = {userId} FOR UPDATE").SingleAsync(ct);
        var dayStart = new DateTimeOffset(now.UtcDateTime.Date, TimeSpan.Zero);
        var minute = await db.ClientErrors.CountAsync(x => x.UserId == userId && x.ReceivedAt > now.AddMinutes(-1), ct);
        var day = await db.ClientErrors.CountAsync(x => x.UserId == userId && x.ReceivedAt >= dayStart, ct);
        if (minute >= ClientErrorService.PerMinute || day >= ClientErrorService.PerDay) return false;
        db.ClientErrors.Add(new() { Id = Guid.CreateVersion7(), UserId = userId, Message = command.Message, Kind = command.Kind, Route = command.Route,
            BuildId = command.BuildId, BrowserFamily = command.BrowserFamily, OccurredAt = command.OccurredAt, ReceivedAt = now });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return true;
    }

    public Task<int> DeleteOlderThanAsync(DateTimeOffset cutoff, CancellationToken ct) => db.ClientErrors.Where(x => x.ReceivedAt < cutoff).ExecuteDeleteAsync(ct);
}

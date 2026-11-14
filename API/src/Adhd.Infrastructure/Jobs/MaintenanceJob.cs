using Adhd.Application.ClientErrors;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.SpecialDays;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Quartz;

namespace Adhd.Infrastructure.Jobs;

// Bakım 30 günden eski hata raporlarını siler. Özel gün hatırlatmalarını kaynak anahtarıyla güvenli biçimde bir ufuk ilerisi için hazır tutar. Yıllık hatırlatma kullanıcı işlemine gerek duymadan sürer.
[DisallowConcurrentExecution, PersistJobDataAfterExecution]
public sealed class MaintenanceJob(PlannerDbContext db, IServiceScopeFactory scopes, TimeProvider clock) : IJob
{
    public async ValueTask Execute(IJobExecutionContext context, CancellationToken ct)
    {
        var cursor = FocusSweepJob.Cursor(context);
        context.JobDetail.JobDataMap["cursor"] = (await RunOnceAsync(cursor, ct)).ToString();
    }

    // Sınırlı tek geçiş. Özel gün listesi başa döndüyse boş, yoksa sonraki imleç döner.
    public async Task<Guid> RunOnceAsync(Guid cursor, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        await db.ClientErrors.Where(x => x.ReceivedAt < now - ClientErrorService.Retention).ExecuteDeleteAsync(ct);
        await db.IdempotencyRecords.Where(x => x.Scope.StartsWith("mobile-") && x.CreatedAt <= now.AddHours(-24)).ExecuteDeleteAsync(ct);
        var rows = await db.SpecialDays.FromSqlInterpolated($"SELECT * FROM special_days WHERE \"Id\">{cursor} AND \"DeletedAt\" IS NULL AND \"Reminder\"<>'None' ORDER BY \"Id\" LIMIT 50")
            .AsNoTracking().ToArrayAsync(ct);
        foreach (var row in rows)
        {
            await using var scope = scopes.CreateAsyncScope();
            var scoped = scope.ServiceProvider.GetRequiredService<PlannerDbContext>();
            var store = scope.ServiceProvider.GetRequiredService<SpecialDayStore>();
            await using var tx = await scoped.Database.BeginTransactionAsync(ct);
            var current = await scoped.SpecialDays.SingleOrDefaultAsync(x => x.Id == row.Id && x.Version == row.Version && x.DeletedAt == null, ct);
            if (current is not null && await store.Prepare(current.UserId, current, now, ct) > 0) await scoped.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        return rows.Length == 50 ? rows[^1].Id : Guid.Empty;
    }
}

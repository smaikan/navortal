using System.Collections.Concurrent;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Npgsql;

namespace Adhd.IntegrationTests;

// Aralıklı 500'ün nedenini tut. SQL, hata metni, başlık ve kimlik bilgisi loga girmesin.
internal sealed class PlanningRaceFailureProbe : IExceptionHandler
{
    internal ConcurrentQueue<string> Failures { get; } = new();
    public ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        if (context.Request.Path == "/api/schedules")
            for (Exception? cause = exception; cause is not null; cause = cause.InnerException)
                Failures.Enqueue(cause.GetType().Name + (cause is PostgresException pg ? $" SQLSTATE={pg.SqlState}" : ""));
        return ValueTask.FromResult(false);
    }
}

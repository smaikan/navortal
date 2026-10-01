using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Adhd.Api.Health;

public sealed class DatabaseReadiness(IServiceScopeFactory scopes) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<PlannerDbContext>();
            return await db.Metadata.AnyAsync(x => x.Key == "schema", cancellationToken)
                ? HealthCheckResult.Healthy() : HealthCheckResult.Unhealthy("Database schema is not ready.");
        }
        catch (Exception e) when (e is not OperationCanceledException)
        { return HealthCheckResult.Unhealthy("Database is unavailable or migrations are missing."); }
    }
}

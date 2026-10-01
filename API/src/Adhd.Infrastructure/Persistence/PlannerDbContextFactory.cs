using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Adhd.Infrastructure.Persistence;

public sealed class PlannerDbContextFactory : IDesignTimeDbContextFactory<PlannerDbContext>
{
    public PlannerDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Planner")
            ?? "Host=127.0.0.1;Port=55432;Database=adhd;Username=postgres";
        return new PlannerDbContext(new DbContextOptionsBuilder<PlannerDbContext>().UseNpgsql(connection).Options);
    }
}

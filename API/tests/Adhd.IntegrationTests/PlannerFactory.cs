using Adhd.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Adhd.Infrastructure.Auth;
using System.Security.Cryptography;
using Microsoft.Extensions.Configuration;
using Quartz;

namespace Adhd.IntegrationTests;

public sealed class PlannerFactory : WebApplicationFactory<Program>
{
    private readonly string connection; private readonly Action<IServiceCollection>? configure; private readonly bool runJobs;
    public PlannerFactory(string connection, Action<IServiceCollection>? configure = null, bool runJobs = false)
    {
        this.connection = connection; this.configure = configure; this.runJobs = runJobs;
        // API testleri Bearer ile girer. Cookie testi kendi cookie kabını açar
        ClientOptions.HandleCookies = false;
    }
    public static string SigningKey { get; } = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
    public MutableClock Clock { get; } = new();
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:Planner"] = connection, ["Jobs:Enabled"] = runJobs.ToString() }));
        builder.ConfigureTestServices(services =>
        {
            services.PostConfigure<JwtSettings>(o => o.SigningKey = SigningKey);
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(new Adhd.Application.Common.UtcTimeProvider(Clock));
            services.RemoveAll<DbContextOptions<PlannerDbContext>>();
            services.RemoveAll<PlannerDbContext>();
            services.AddDbContext<PlannerDbContext>(o => o.UseNpgsql(connection));
            services.AddControllers().AddApplicationPart(typeof(ProbeController).Assembly);
            if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ADHD_API_TRANSCRIPTS"))) services.AddTransient<IStartupFilter, ApiTranscriptStartupFilter>();
            configure?.Invoke(services);
            if (runJobs) services.AddQuartzHostedService(o => o.WaitForJobsToComplete = true);
        });
    }
}

public sealed class MutableClock : TimeProvider
{
    public DateTimeOffset Now { get; set; } = DateTimeOffset.UtcNow;
    public override DateTimeOffset GetUtcNow() => Now;
}

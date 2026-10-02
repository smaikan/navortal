using Adhd.Api.Errors;
using Adhd.Api.Auth;
using Adhd.Api.Health;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Jobs;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.HttpOverrides;
using System.Net;

var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole();
// İstek başlangıcı logu ham sorguyu alıyor. Bu sürümde hub bilgileri de oradan geçiyor.
builder.Logging.AddFilter("Microsoft.AspNetCore.Hosting.Diagnostics", LogLevel.Warning);
builder.Services.AddSingleton<TimeProvider>(new Adhd.Application.Common.UtcTimeProvider(TimeProvider.System));
builder.Services.AddDbContext<PlannerDbContext>(o => o.UseNpgsql(
    builder.Configuration.GetConnectionString("Planner") ?? throw new InvalidOperationException("Planner connection is required.")));
builder.Services.AddProblemDetails(o => o.CustomizeProblemDetails = c =>
    c.ProblemDetails.Extensions.TryAdd("traceId", c.HttpContext.TraceIdentifier));
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddControllers().AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter(allowIntegerValues: false))).ConfigureApiBehaviorOptions(o => o.InvalidModelStateResponseFactory = c =>
    new BadRequestObjectResult(new ValidationProblemDetails(c.ModelState)
    {
        Status = 400, Title = "Gönderilen alanları kontrol edin.",
        Extensions = { ["code"] = "validation_failed", ["traceId"] = c.HttpContext.TraceIdentifier }
    }));
builder.Services.AddPlannerAuth(builder.Configuration);
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto; o.ForwardLimit = 1;
    foreach (var proxy in builder.Configuration.GetSection("ReverseProxy:KnownProxies").Get<string[]>() ?? [])
        o.KnownProxies.Add(IPAddress.TryParse(proxy, out var ip) ? ip : throw new InvalidOperationException("ReverseProxy known proxy must be an IP address."));
});
builder.Services.AddSignalR(o => { o.EnableDetailedErrors = false; o.MaximumReceiveMessageSize = 8192; });
builder.Services.AddSingleton<Adhd.Application.Jobs.IRealtimePublisher, Adhd.Api.Realtime.PlannerRealtimePublisher>();
builder.Services.AddScoped<Adhd.Application.Preferences.IPreferencesStore, Adhd.Infrastructure.Preferences.PreferencesStore>();
builder.Services.AddScoped<Adhd.Application.Preferences.PreferencesService>();
builder.Services.AddScoped<Adhd.Application.Tasks.ITaskStore, Adhd.Infrastructure.Tasks.TaskStore>();
builder.Services.AddScoped<Adhd.Application.Tasks.TaskService>();
builder.Services.AddScoped<Adhd.Application.Tasks.ITaskTreeStore, Adhd.Infrastructure.Tasks.TaskTreeStore>();
builder.Services.AddScoped<Adhd.Application.Tasks.TaskTreeService>();
builder.Services.AddScoped<Adhd.Application.Tasks.ITaskWorkloadStore, Adhd.Infrastructure.Tasks.TaskWorkloadStore>();
builder.Services.AddScoped<Adhd.Application.Tasks.TaskWorkloadService>();
builder.Services.AddScoped<Adhd.Application.Tasks.ITaskLifecycleStore, Adhd.Infrastructure.Tasks.TaskLifecycleStore>();
builder.Services.AddScoped<Adhd.Application.Tasks.TaskLifecycleService>();
builder.Services.AddScoped<Adhd.Application.Tasks.ITaskRelationsStore, Adhd.Infrastructure.Tasks.TaskRelationsStore>();
builder.Services.AddScoped<Adhd.Application.Tasks.TaskRelationsService>();
builder.Services.AddScoped(typeof(Adhd.Application.Collections.INamedResourceStore<>), typeof(Adhd.Infrastructure.Collections.NamedResourceStore<>));
builder.Services.AddScoped(typeof(Adhd.Application.Collections.NamedResourceService<>));
builder.Services.AddScoped<Adhd.Application.Tasks.ITaskClassificationStore, Adhd.Infrastructure.Collections.TaskClassificationStore>();
builder.Services.AddScoped<Adhd.Application.Tasks.TaskClassificationService>();
builder.Services.AddScoped<Adhd.Infrastructure.Work.WorkStore>();
builder.Services.AddScoped<Adhd.Application.Work.IWorkStore>(s => s.GetRequiredService<Adhd.Infrastructure.Work.WorkStore>());
builder.Services.AddScoped<Adhd.Application.Work.IWorkCorrectionStore>(s => s.GetRequiredService<Adhd.Infrastructure.Work.WorkStore>());
builder.Services.AddScoped<Adhd.Application.Work.WorkService>();
builder.Services.AddScoped<Adhd.Application.Work.WorkCorrectionService>();
builder.Services.AddScoped<Adhd.Application.Focus.IFocusStore>(s => s.GetRequiredService<Adhd.Infrastructure.Work.WorkStore>());
builder.Services.AddScoped<Adhd.Application.Focus.FocusService>();
builder.Services.AddScoped<Adhd.Application.Work.IImmediateWorkStore>(s => s.GetRequiredService<Adhd.Infrastructure.Work.WorkStore>());
builder.Services.AddScoped<Adhd.Application.Work.IImmediateWorkCoordinator, Adhd.Infrastructure.Scheduling.ImmediateWorkCoordinator>();
builder.Services.AddScoped<Adhd.Application.Work.ImmediateWorkService>();
builder.Services.AddScoped<Adhd.Application.Planning.IPlanningStore, Adhd.Infrastructure.Planning.PlanningStore>();
builder.Services.AddScoped<Adhd.Application.Planning.PlanningService>();
builder.Services.AddScoped<Adhd.Application.Calendar.ICalendarStore, Adhd.Infrastructure.Calendar.CalendarStore>();
builder.Services.AddScoped<Adhd.Application.Calendar.CalendarService>();
builder.Services.AddScoped<Adhd.Application.Analytics.IActualAnalyticsStore, Adhd.Infrastructure.Analytics.ActualAnalyticsStore>();
builder.Services.AddScoped<Adhd.Application.Analytics.ActualAnalyticsService>();
builder.Services.AddScoped<Adhd.Application.Analytics.IPlanAnalyticsStore, Adhd.Infrastructure.Analytics.PlanAnalyticsStore>();
builder.Services.AddScoped<Adhd.Application.Analytics.PlanAnalyticsService>();
builder.Services.AddScoped<Adhd.Application.Support.ISupportStore, Adhd.Infrastructure.Support.SupportStore>();
builder.Services.AddScoped<Adhd.Application.Support.SupportService>();
builder.Services.AddScoped<Adhd.Application.Recurrence.IRecurrenceStore, Adhd.Infrastructure.Recurrence.RecurrenceStore>();
builder.Services.AddScoped<Adhd.Application.Recurrence.RecurrenceService>();
builder.Services.AddScoped<Adhd.Application.Support.ISupportPlanningCoordinator, Adhd.Infrastructure.Scheduling.SchedulingCoordinator>();
builder.Services.AddSingleton<Adhd.Domain.Scheduling.SchedulingEngine>();
builder.Services.AddSingleton<Adhd.Domain.Scheduling.PlanUndoEngine>();
builder.Services.AddSingleton<Adhd.Domain.Scheduling.MultiDaySchedulingEngine>();
builder.Services.AddScoped<Adhd.Application.Scheduling.IDistributionCoordinator, Adhd.Infrastructure.Scheduling.SchedulingCoordinator>();
builder.Services.AddScoped<Adhd.Application.Scheduling.DistributionService>();
builder.Services.AddScoped<Adhd.Application.Scheduling.ISchedulingCoordinator, Adhd.Infrastructure.Scheduling.SchedulingCoordinator>();
builder.Services.AddScoped<Adhd.Application.Scheduling.SchedulingService>();
builder.Services.AddPlannerJobs(builder.Configuration, !builder.Environment.IsEnvironment("Testing"));
Adhd.Infrastructure.Notifications.NotificationRegistration.AddPlannerNotifications(builder.Services, builder.Configuration);
builder.Services.AddPlannerOpenApi();
builder.Services.AddHealthChecks().AddCheck<DatabaseReadiness>("postgresql", tags: ["ready"]);
var app = builder.Build();
app.UseForwardedHeaders();
// Giriş yanıtını ve hesaba özel veriyi önbelleğe alma.
app.Use(async (HttpContext context, RequestDelegate next) =>
{
    if (context.Request.Path.StartsWithSegments("/api"))
        context.Response.OnStarting(static state =>
        {
            var response = (HttpResponse)state;
            response.Headers.CacheControl = "no-store, private, max-age=0";
            response.Headers.Pragma = "no-cache";
            return Task.CompletedTask;
        }, context.Response);
    await next(context);
});
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseRouting();
app.UseRateLimiter();
// Sorgu tokenını kontrol etmeden önce Kestrel'in gerçek Upgrade bilgisi hazır olsun.
app.UseWebSockets();
app.UseAuthentication();
app.UseAuthorization();
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = x => x.Tags.Contains("ready") });
if (app.Environment.IsDevelopment() || app.Environment.IsEnvironment("Testing")) app.MapOpenApi();
app.MapControllers();
app.MapHub<Adhd.Api.Realtime.PlannerHub>(Adhd.Api.Realtime.PlannerHub.Path);
app.Run();
public partial class Program;

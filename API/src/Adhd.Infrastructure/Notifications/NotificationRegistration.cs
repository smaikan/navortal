using Adhd.Application.Notifications;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Adhd.Infrastructure.Notifications;

public static class NotificationRegistration
{
    public static IServiceCollection AddPlannerNotifications(this IServiceCollection services, IConfiguration config)
    {
        services.Configure<PushSettings>(config.GetSection("Push"));
        services.AddScoped<INotificationStore, NotificationStore>(); services.AddScoped<INotificationJobs, NotificationJobs>();
        services.AddScoped<Adhd.Application.Sync.ISyncStore, SyncStore>();
        // Ortak HTTP istemcisi istek logu tutmaz. Push adresi ve bilgileri loga girmesin.
        services.AddSingleton<IPushTransport>(s => new WebPushTransport(new HttpClient(new SocketsHttpHandler
        { AllowAutoRedirect = false, UseProxy = false, ConnectCallback = PushEndpoints.Connect, PooledConnectionLifetime = TimeSpan.FromMinutes(5) })
        { Timeout = TimeSpan.FromSeconds(15) }, s.GetRequiredService<Microsoft.Extensions.Options.IOptions<PushSettings>>()));
        return services;
    }
}

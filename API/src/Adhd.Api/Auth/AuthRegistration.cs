using System.Text;
using System.Threading.RateLimiting;
using Adhd.Application.Auth;
using Adhd.Infrastructure.Auth;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;

namespace Adhd.Api.Auth;

public static class AuthRegistration
{
    public static IServiceCollection AddPlannerAuth(this IServiceCollection services, IConfiguration config)
    {
        services.AddScoped<Adhd.Application.Auth.IProfileStore, Adhd.Infrastructure.Auth.ProfileStore>();
        services.AddScoped<Adhd.Application.Auth.ProfileService>();
        services.AddSingleton<IValidateOptions<CloudinarySettings>, CloudinarySettingsValidator>();
        services.AddOptions<CloudinarySettings>().Bind(config.GetSection("Cloudinary")).ValidateOnStart();
        services.AddSingleton<CloudinaryPhotos>(s => new CloudinaryPhotos(new HttpClient(new SocketsHttpHandler { AllowAutoRedirect = false, UseCookies = false }) { Timeout = TimeSpan.FromSeconds(12) }, s.GetRequiredService<IOptions<CloudinarySettings>>()));
        services.AddSingleton<Adhd.Application.Auth.IProfilePhotos>(s => s.GetRequiredService<CloudinaryPhotos>());
        services.AddOptions<JwtSettings>().Bind(config.GetSection("Jwt"))
            .Validate(x => !string.IsNullOrWhiteSpace(x.SigningKey) && Encoding.UTF8.GetByteCount(x.SigningKey) >= 32, "Jwt:SigningKey must contain at least 32 bytes and cannot be blank.")
            .Validate(x => !string.IsNullOrWhiteSpace(x.Issuer) && !string.IsNullOrWhiteSpace(x.Audience), "JWT issuer and audience are required.")
            .ValidateOnStart();
        services.AddScoped<IUserStore, UserStore>();
        services.AddSingleton<IPasswordService, PasswordService>();
        services.AddScoped<IAccessTokenIssuer, JwtTokenIssuer>();
        services.AddMemoryCache();
        services.AddScoped<IAuthSessionStore, AuthSessionStore>();
        services.AddScoped<AuthService>();
        services.Configure<GoogleSettings>(config.GetSection("Google"));
        services.AddDataProtection();
        services.AddScoped<GoogleChallenge>();
        services.AddScoped<IGoogleTokenVerifier, GoogleTokenVerifier>();
        services.AddScoped<IGoogleAccountStore, GoogleAccountStore>();
        services.AddScoped<GoogleAuthService>();
        services.AddSingleton<IValidateOptions<SmtpSettings>, SmtpSettingsValidator>();
        services.AddOptions<SmtpSettings>().Bind(config.GetSection("Smtp")).ValidateOnStart();
        services.AddScoped<IPasswordResetStore, PasswordResetStore>();
        services.AddScoped<IResetMailSender, SmtpResetMailSender>();
        services.AddScoped<PasswordResetService>();
        services.AddScoped<IPasswordChangeStore, PasswordChangeStore>();
        services.AddScoped<PasswordChangeService>();
        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<IOptions<JwtSettings>, TimeProvider>((options, settings, clock) =>
            {
                var c = settings.Value;
                options.MapInboundClaims = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true, ValidIssuer = c.Issuer,
                    ValidateAudience = true, ValidAudience = c.Audience,
                    ValidateIssuerSigningKey = true, RequireSignedTokens = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(c.SigningKey)),
                    ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
                    RequireExpirationTime = false, ValidateLifetime = true, ClockSkew = TimeSpan.Zero,
                    LifetimeValidator = (nbf, exp, _, _) =>
                        (!nbf.HasValue || nbf <= clock.GetUtcNow().UtcDateTime) && (!exp.HasValue || exp > clock.GetUtcNow().UtcDateTime)
                };
                options.Events = new JwtBearerEvents
                {
                    // Tarayıcı oturum cookie'siyle gelir. Bearer başlığı varsa aşağıdaki öncelik geçerli.
                    // Test ve tarayıcı dışı istemciler Bearer kullanabilir. Hub da sorgudan token okumaz
                    OnMessageReceived = context =>
                    {
                        // Bearer başlığı varsa onu kullan. Yoksa oturum cookie'sine bak
                        if (context.Request.Headers.Authorization.Any(x => x?.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) == true)) return Task.CompletedTask;
                        var cookie = SessionCookie.Read(context.HttpContext);
                        if (cookie is not null) { context.Token = cookie; context.HttpContext.Items[SessionCookie.FromCookieItem] = true; }
                        return Task.CompletedTask;
                    },
                    OnTokenValidated = async context =>
                    {
                        var services = context.HttpContext.RequestServices; var ct = context.HttpContext.RequestAborted;
                        var sub = context.Principal?.FindFirst("sub")?.Value;
                        if (!Guid.TryParse(sub, out var id) || await services.GetRequiredService<IUserStore>().FindByIdAsync(id, ct) is null) { context.Fail("User is unavailable."); return; }
                        var sid = context.Principal?.FindFirst("sid")?.Value;
                        if (sid is null)
                        {
                            // Oturumu olmayan eski tokenı sadece bir kez cookie oturumuna taşımak için kabul et
                            if (context.Request.Path != "/api/auth/session/adopt" || context.HttpContext.Items.ContainsKey(SessionCookie.FromCookieItem)) context.Fail("Session is required.");
                            return;
                        }
                        if (!Guid.TryParse(sid, out var session) || !await services.GetRequiredService<AuthService>().ValidateAsync(id, session, ct)) context.Fail("Session is revoked.");
                    },
                    OnChallenge = async context =>
                    {
                        context.HandleResponse();
                        // Cookie geçersiz veya iptal edilmişse sil ki tarayıcı tekrar göndermesin
                        if (context.HttpContext.Items.ContainsKey(SessionCookie.FromCookieItem)) SessionCookie.Delete(context.HttpContext);
                        await Results.Problem(statusCode: 401, title: "Giriş yapmanız gerekiyor.", extensions: new Dictionary<string, object?>
                        { ["code"] = "unauthorized", ["traceId"] = context.HttpContext.TraceIdentifier }).ExecuteAsync(context.HttpContext);
                    }
                };
            });
        services.AddAuthorization();
        // Adres başına sınır 5 dakikada 30 giriş isteği. Bunu sadece kendi test sunucumuz artırabilir.
        services.AddOptions<AuthRateLimitSettings>().Bind(config.GetSection("AuthRateLimit"))
            .Validate(x => x.PermitLimit is >= 1 and <= 100_000 && x.WindowSeconds is >= 1 and <= 86_400, "AuthRateLimit values are out of range.")
            .ValidateOnStart();
        services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = 429;
            o.AddPolicy("auth", context =>
            {
                var limit = context.RequestServices.GetRequiredService<IOptions<AuthRateLimitSettings>>().Value;
                return RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions { PermitLimit = limit.PermitLimit, Window = TimeSpan.FromSeconds(limit.WindowSeconds), QueueLimit = 0 });
            });
        });
        return services;
    }

    public sealed class AuthRateLimitSettings
    {
        public int PermitLimit { get; set; } = 30;
        public int WindowSeconds { get; set; } = 300;
    }

    public static IServiceCollection AddPlannerOpenApi(this IServiceCollection services)
    {
        // OpenAPI HTTP JSON ayarını okuyor. Enum değerleri MVC yanıtıyla aynı kalsın.
        services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter(allowIntegerValues: false)));
        services.AddOpenApi(PlannerOpenApi.Configure);
        return services;
    }
}

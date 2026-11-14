using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.OpenApi;
using System.Text.Json.Nodes;

namespace Adhd.Api.Auth;

internal static class PlannerOpenApi
{
    internal static void Configure(OpenApiOptions options)
    {
        // Bu alana null izin versek de ortak görev önceliği şeması zorunlu kalsın
        var referenceId = options.CreateSchemaReferenceId;
        options.CreateSchemaReferenceId = info => info.Type == typeof(Adhd.Domain.Tasks.TaskPriority?) ? null : referenceId(info);
        options.AddSchemaTransformer((schema, context, _) =>
        {
            if (context.JsonPropertyInfo?.AttributeProvider?.IsDefined(typeof(System.ComponentModel.DataAnnotations.RequiredAttribute), inherit: true) == true)
            {
                if (schema.Type.HasValue) schema.Type &= ~JsonSchemaType.Null;
                if (schema.OneOf is { } alternatives)
                    for (var i = alternatives.Count - 1; i >= 0; i--) if (alternatives[i].Type == JsonSchemaType.Null) alternatives.RemoveAt(i);
            }
            return Task.CompletedTask;
        });
        options.AddDocumentTransformer((document, _, _) =>
        {
            document.Components ??= new(); document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
            document.Components.SecuritySchemes["Bearer"] = new OpenApiSecurityScheme { Type = SecuritySchemeType.Http, Scheme = "bearer", BearerFormat = "JWT", Description = "Non-expiring application JWT. No refresh token." };
            document.Components.SecuritySchemes["MobileSessionCookie"] = new OpenApiSecurityScheme { Type = SecuritySchemeType.ApiKey,
                In = ParameterLocation.Cookie, Name = SessionCookie.SecureName,
                Description = "Mobile push requires the existing HttpOnly session cookie. Bearer is not accepted. Writes also require X-ADHD-CSRF: 1 and same-host Origin/Referer." };
            return Task.CompletedTask;
        });
        options.AddOperationTransformer(async (operation, context, ct) =>
        {
            var metadata = context.Description.ActionDescriptor.EndpointMetadata;
            if (metadata.OfType<IAuthorizeData>().Any() && !metadata.OfType<IAllowAnonymous>().Any())
            {
                var scheme = context.Description.RelativePath?.StartsWith("api/mobile/push", StringComparison.Ordinal) == true ? "MobileSessionCookie" : "Bearer";
                operation.Security ??= []; operation.Security.Add(new OpenApiSecurityRequirement { [new OpenApiSecuritySchemeReference(scheme, context.Document)] = [] });
            }
            if (context.Description.ActionDescriptor is not ControllerActionDescriptor) return;
            var mobile = context.Description.RelativePath?.StartsWith("api/mobile/push", StringComparison.Ordinal) == true;
            if (mobile && context.Description.HttpMethod is not ("GET" or "HEAD"))
            {
                operation.Parameters ??= [];
                operation.Parameters.Add(new OpenApiParameter { Name = SessionCookie.CsrfHeader, In = ParameterLocation.Header, Required = true,
                    Schema = new OpenApiSchema { Type = JsonSchemaType.String, Enum = [(JsonNode)JsonValue.Create("1")!] } });
                operation.Parameters.Add(new OpenApiParameter { Name = "Origin", In = ParameterLocation.Header,
                    Description = "https://www.navortal.com.tr; Origin yoksa aynı-host Referer kabul edilir.", Schema = new OpenApiSchema { Type = JsonSchemaType.String } });
            }
            foreach (var parameter in (operation.Parameters ?? []).OfType<OpenApiParameter>()) if (parameter.Name == "Idempotency-Key") parameter.Required = true;
            if (context.Description.RelativePath == "api/focus-sessions/{id}/{operation}")
                foreach (var parameter in (operation.Parameters ?? []).OfType<OpenApiParameter>().Where(x => x.Name == "operation"))
                    parameter.Schema = new OpenApiSchema { Type = JsonSchemaType.String, Enum = new[] { "pause", "resume", "break", "next", "finish", "cancel" }.Select(x => (JsonNode)JsonValue.Create(x)!).ToList() };
            var problem = await context.GetOrCreateSchemaAsync(typeof(ApiProblemContract), cancellationToken: ct);
            operation.Responses ??= new();
            foreach (var (status, description) in new[] { ("400", "Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors."), ("401", "JWT veya giriş bilgisi gerekli/geçersiz."), ("404", "Kaynak yok veya bu kullanıcıya ait değil."), ("409", "Sürüm/idempotency/domain çatışması; güncel durumu okuyun."), ("503", "Gerekli sağlayıcı/özellik kullanılamıyor."), ("500", "Beklenmeyen hata; traceId ile takip edilir.") })
                operation.Responses.TryAdd(status, new OpenApiResponse { Description = description, Content = new Dictionary<string, OpenApiMediaType> { ["application/problem+json"] = new()
                { Schema = problem } } });
            if (mobile)
            {
                operation.Responses.TryAdd("403", new OpenApiResponse { Description = "csrf_required veya csrf_origin; başlıkları kontrol edin.",
                    Content = new Dictionary<string, OpenApiMediaType> { ["application/problem+json"] = new() { Schema = problem } } });
                operation.Responses.TryAdd("429", new OpenApiResponse { Description = "mobile_rate_limited; IP başına dakikada60 istek. Retry-After saniyesini bekleyin.",
                    Content = new Dictionary<string, OpenApiMediaType> { ["application/problem+json"] = new() { Schema = problem } } });
            }
            if (metadata.OfType<EnableRateLimitingAttribute>().Any()) operation.Responses.TryAdd("429", new OpenApiResponse { Description = "Auth istek limiti; boş gövde. Süre sonunda yeniden deneyin." });
        });
    }
}

// Hata ve model doğrulama yanıtına eklenen alanları burada tanımlıyoruz
public sealed class ApiProblemContract : ProblemDetails
{
    [System.ComponentModel.DataAnnotations.Required] public string Code { get; set; } = "";
    [System.ComponentModel.DataAnnotations.Required] public string TraceId { get; set; } = "";
    public IDictionary<string, string[]>? Errors { get; set; }
}

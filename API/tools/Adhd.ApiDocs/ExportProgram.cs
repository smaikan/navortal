using System.ComponentModel.DataAnnotations;
using System.Reflection;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Adhd.ApiDocs;

internal static class ExportProgram
{
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private static async Task Main(string[] args)
    {
        var root = Path.GetFullPath(Directory.GetCurrentDirectory()); var destination = Path.GetFullPath(args.FirstOrDefault() ?? ".local/api-contract"); Directory.CreateDirectory(destination);
        await using var app = new ContractFactory(root); var client = app.CreateClient(); var document = await client.GetStringAsync("/openapi/v1.json");
        await File.WriteAllTextAsync(Path.Combine(destination, "openapi-v1.json"), document);
        var endpoints = app.Services.GetRequiredService<IApiDescriptionGroupCollectionProvider>().ApiDescriptionGroups.Items.SelectMany(x => x.Items)
            .Where(x => x.ActionDescriptor is ControllerActionDescriptor).Select(x =>
            {
                var action = (ControllerActionDescriptor)x.ActionDescriptor; var metadata = action.EndpointMetadata;
                var body = x.ParameterDescriptions.FirstOrDefault(p => p.Source.Id == "Body");
                var bodyType = body?.Type;
                var fields = bodyType?.GetProperties(BindingFlags.Instance | BindingFlags.Public).Select(p => new
                {
                    name = JsonNamingPolicy.CamelCase.ConvertName(p.Name), type = TypeName(p.PropertyType),
                    rules = p.GetCustomAttributes<ValidationAttribute>().Select(v => v switch
                    {
                        RangeAttribute a => $"range:{a.Minimum}..{a.Maximum}", StringLengthAttribute a => $"length:{a.MinimumLength}..{a.MaximumLength}",
                        MinLengthAttribute a => $"minLength:{a.Length}", MaxLengthAttribute a => $"maxLength:{a.Length}", RequiredAttribute => "required",
                        EmailAddressAttribute => "email", _ => v.GetType().Name.Replace("Attribute", "", StringComparison.Ordinal)
                    }).ToArray()
                }).ToArray();
                return new
                {
                    method = x.HttpMethod, path = "/" + x.RelativePath, controller = action.ControllerName, action = action.ActionName,
                    authRequired = metadata.OfType<IAuthorizeData>().Any() && !metadata.OfType<IAllowAnonymous>().Any(),
                    bodyType = bodyType?.Name, fields, success = x.SupportedResponseTypes.Where(r => r.StatusCode is >= 200 and < 300).Select(r => new { status = r.StatusCode, type = r.Type?.Name }).ToArray()
                };
            }).OrderBy(x => x.path, StringComparer.Ordinal).ThenBy(x => x.method, StringComparer.Ordinal).ToArray();
        await File.WriteAllTextAsync(Path.Combine(destination, "endpoint-catalog.json"), JsonSerializer.Serialize(endpoints, Json));
        using var parsed = JsonDocument.Parse(document); var operationCount = parsed.RootElement.GetProperty("paths").EnumerateObject().Sum(p => p.Value.EnumerateObject().Count(x => x.Name is "get" or "post" or "put" or "patch" or "delete"));
        if (operationCount != endpoints.Length) throw new InvalidOperationException($"Controller/OpenAPI coverage differs: {endpoints.Length}/{operationCount}.");
        Console.WriteLine($"Public OpenAPI/catalog exported: {endpoints.Length} operations, {parsed.RootElement.GetProperty("components").GetProperty("schemas").EnumerateObject().Count()} schemas; no database or application token was used.");
    }
    private static string TypeName(Type type) => Nullable.GetUnderlyingType(type) is { } inner ? TypeName(inner) + "?" : type.IsArray ? TypeName(type.GetElementType()!) + "[]" : type.Name;
    private sealed class ContractFactory(string apiRoot) : WebApplicationFactory<global::Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing"); builder.UseContentRoot(Path.Combine(apiRoot, "src/Adhd.Api"));
            builder.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:SigningKey"] = "documentation-generation-placeholder-not-a-deployed-signing-key-000000",
                ["ConnectionStrings:Planner"] = "Host=127.0.0.1;Port=1;Database=not_used;Username=not_used;Timeout=1",
                ["Jobs:Enabled"] = "false"
            }));
        }
    }
}

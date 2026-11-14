using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.Extensions.DependencyInjection;

namespace Adhd.IntegrationTests;

public sealed class ApiContractTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Fact]
    public async Task EveryControllerOperationHasMatchingAuthSuccessStatusAndRequiredIdempotencyHeader()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var client = app.CreateClient();
        using var doc = JsonDocument.Parse(await client.GetStringAsync("/openapi/v1.json")); var paths = doc.RootElement.GetProperty("paths");
        var descriptions = app.Services.GetRequiredService<IApiDescriptionGroupCollectionProvider>().ApiDescriptionGroups.Items.SelectMany(x => x.Items).Where(x => x.RelativePath?.StartsWith("api/", StringComparison.Ordinal) == true).ToArray(); Assert.True(descriptions.Length > 100);
        foreach (var description in descriptions)
        {
            var path = "/" + description.RelativePath!.Split('?')[0]; Assert.True(paths.TryGetProperty(path, out var p), path); Assert.True(p.TryGetProperty(description.HttpMethod!.ToLowerInvariant(), out var operation), path);
            var metadata = description.ActionDescriptor.EndpointMetadata;
            var authenticated = metadata.OfType<IAuthorizeData>().Any() && !metadata.OfType<IAllowAnonymous>().Any();
            var scheme = path.StartsWith("/api/mobile/push", StringComparison.Ordinal) ? "MobileSessionCookie" : "Bearer";
            var hasSecurity = operation.TryGetProperty("security", out var security) && security.EnumerateArray().Any(x => x.TryGetProperty(scheme, out _)); Assert.Equal(authenticated, hasSecurity);
            if (path.StartsWith("/api/mobile/push", StringComparison.Ordinal))
            {
                Assert.All(security.EnumerateArray(), item => Assert.False(item.TryGetProperty("Bearer", out _)));
                Assert.True(operation.GetProperty("responses").TryGetProperty("403", out _));
                Assert.True(operation.GetProperty("responses").TryGetProperty("429", out _));
                if (description.HttpMethod != "GET")
                {
                    var csrf = operation.GetProperty("parameters").EnumerateArray().Single(x => x.GetProperty("name").GetString() == "X-ADHD-CSRF");
                    Assert.True(csrf.GetProperty("required").GetBoolean());
                    Assert.Equal("1", csrf.GetProperty("schema").GetProperty("enum")[0].GetString());
                }
            }
            var declared = metadata.OfType<ProducesResponseTypeAttribute>().Where(x => x.StatusCode is >= 200 and < 300).ToArray(); var responses = operation.GetProperty("responses");
            foreach (var response in declared) Assert.True(responses.TryGetProperty(response.StatusCode.ToString(), out _), $"{description.HttpMethod} {path} status {response.StatusCode}");
            if (operation.TryGetProperty("parameters", out var parameters)) foreach (var parameter in parameters.EnumerateArray().Where(x => x.GetProperty("name").GetString() == "Idempotency-Key")) Assert.True(parameter.GetProperty("required").GetBoolean());
        }
        Assert.True(paths.GetProperty("/api/auth/register").GetProperty("post").GetProperty("responses").TryGetProperty("201", out _));
        Assert.True(paths.GetProperty("/api/auth/forgot-password").GetProperty("post").GetProperty("responses").GetProperty("202").TryGetProperty("content", out _));
        Assert.True(paths.GetProperty("/api/auth/login").GetProperty("post").GetProperty("responses").TryGetProperty("429", out _));
        var requiredDate = doc.RootElement.GetProperty("components").GetProperty("schemas").GetProperty("CreateScheduleRequest").GetProperty("properties").GetProperty("localDate");
        Assert.Equal("string", requiredDate.GetProperty("type").GetString());
        var schemas = doc.RootElement.GetProperty("components").GetProperty("schemas");
        foreach (var (name, values) in new[] {
            ("TaskState", Enum.GetNames<Adhd.Domain.Tasks.TaskState>()), ("TaskPriority", Enum.GetNames<Adhd.Domain.Tasks.TaskPriority>()),
            ("WorkState", Enum.GetNames<Adhd.Domain.Work.WorkState>()), ("FocusState", Enum.GetNames<Adhd.Domain.Focus.FocusState>()),
            ("CompletionOrigin", Enum.GetNames<Adhd.Domain.Tasks.CompletionOrigin>()) })
        {
            // Sadece enum içeren JSON Schema geçerli. Nullable enum için null üye gelebilir
            var members = schemas.GetProperty(name).GetProperty("enum").EnumerateArray().ToArray();
            Assert.All(members, value => Assert.True(value.ValueKind is JsonValueKind.String or JsonValueKind.Null));
            Assert.Equal(values.Order(), members.Where(x => x.ValueKind != JsonValueKind.Null).Select(x => x.GetString()!).Order());
        }
    }
}

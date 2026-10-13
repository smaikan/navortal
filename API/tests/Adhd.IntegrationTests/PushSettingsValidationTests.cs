using Adhd.Infrastructure.Notifications;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using System.Security.Cryptography;

namespace Adhd.IntegrationTests;

public sealed class PushSettingsValidationTests
{
    [Fact]
    public void DisabledPushNeedsNoKeysAndEnabledPushRequiresMatchingP256AndContactWithoutLeakingValues()
    {
        var validator = new PushSettingsValidator(); Assert.True(validator.Validate(null, new()).Succeeded);
        var valid = new PushSettings(); PushDeliveryTests.EnableTransport(valid); Assert.True(validator.Validate(null, valid).Succeeded);
        valid.Subject = "https://example.test/push-contact"; Assert.True(validator.Validate(null, valid).Succeeded);
        foreach (var subject in new[] { "", "http://example.test", "mailto:", "mailto:invalid", "mailto:a@example.test?subject=hello", "https://user:password@example.test", "https://example.test/#fragment", "mailto:a@example.test\n" })
        {
            valid.Subject = subject; var failed = validator.Validate(null, valid); Assert.True(failed.Failed);
            Assert.DoesNotContain(valid.PrivateKey, string.Join(" ", failed.Failures));
        }
        valid.Subject = "mailto:a@example.test";
        var other = new PushSettings(); PushDeliveryTests.EnableTransport(other); valid.PrivateKey = other.PrivateKey;
        Assert.True(validator.Validate(null, valid).Failed);
        foreach (var privateKey in new[] { "", "not-a-key", NotificationTests.Base64(new byte[31]), NotificationTests.Base64(new byte[32]) })
        {
            valid.PrivateKey = privateKey; Assert.True(validator.Validate(null, valid).Failed);
        }
        PushDeliveryTests.EnableTransport(valid);
        valid.PublicKey = NotificationTests.Base64(new byte[65]); Assert.True(validator.Validate(null, valid).Failed);
    }
    [Fact]
    public void RegisteredOptionsValidateBeforeEnabledConfigCanBeRead()
    {
        var services = new ServiceCollection(); var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Push:Enabled"] = "true" }).Build();
        services.AddPlannerNotifications(config); using var provider = services.BuildServiceProvider();
        Assert.Throws<OptionsValidationException>(() => provider.GetRequiredService<IOptions<PushSettings>>().Value);
        Assert.Contains(services, x => x.ServiceType.Name.Contains("StartupValidator", StringComparison.Ordinal));
        Assert.Throws<OptionsValidationException>(() => provider.GetRequiredService<IStartupValidator>().Validate());
    }
}

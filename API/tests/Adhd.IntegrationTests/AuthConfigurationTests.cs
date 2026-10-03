using System.Security.Cryptography;
using Adhd.Api.Auth;
using Adhd.Infrastructure.Auth;
using MailKit.Security;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace Adhd.IntegrationTests;

public sealed class AuthConfigurationTests
{
    private static SmtpSettings ValidSmtp() => new()
    {
        Enabled = true, Host = "smtp.example.test", Port = 587, Security = SecureSocketOptions.StartTls,
        From = "planner@example.test", ResetPageUrl = "https://planner.example.test/parola-yenile#"
    };
    private static SmtpSettingsValidator Validator(string environment) => new(new TestEnvironment(environment));

    [Fact]
    public void DisabledSmtpDoesNotRequireUnusedConfiguration() => Assert.True(Validator("Production").Validate(null, new SmtpSettings()).Succeeded);

    [Theory]
    [InlineData(SecureSocketOptions.StartTls)]
    [InlineData(SecureSocketOptions.SslOnConnect)]
    public void ExplicitTlsModesAreAcceptedInProduction(SecureSocketOptions mode)
    {
        var settings = ValidSmtp(); settings.Security = mode;
        Assert.True(Validator("Production").Validate(null, settings).Succeeded);
    }

    [Theory]
    [InlineData("Development", "localhost")]
    [InlineData("Testing", "127.0.0.1")]
    [InlineData("Testing", "::1")]
    public void PlainSmtpAndHttpResetAreRestrictedToLocalTestEnvironment(string environment, string host)
    {
        var settings = ValidSmtp(); settings.Host = host; settings.Security = SecureSocketOptions.None;
        settings.ResetPageUrl = "http://127.0.0.1:3100/parola-yenile#";
        Assert.True(Validator(environment).Validate(null, settings).Succeeded);
        Assert.True(Validator("Production").Validate(null, settings).Failed);
    }

    [Theory]
    [InlineData(SecureSocketOptions.None)]
    [InlineData(SecureSocketOptions.Auto)]
    [InlineData(SecureSocketOptions.StartTlsWhenAvailable)]
    [InlineData((SecureSocketOptions)999)]
    public void UnsafeOrOpportunisticRemoteModesAreRejectedEvenInTesting(SecureSocketOptions mode)
    {
        var settings = ValidSmtp(); settings.Security = mode;
        Assert.True(Validator("Testing").Validate(null, settings).Failed);
        Assert.True(Validator("Production").Validate(null, settings).Failed);
    }

    [Theory]
    [InlineData("")]
    [InlineData("http://planner.example.test/parola-yenile#")]
    [InlineData("http://localhost:3100/parola-yenile#")]
    [InlineData("javascript:alert(1)")]
    [InlineData("https://user:SECRET_SENTINEL@planner.example.test/parola-yenile#")]
    [InlineData("https://planner.example.test/parola-yenile?token=SECRET_SENTINEL")]
    [InlineData("https://planner.example.test/parola-yenile#token=SECRET_SENTINEL")]
    public void UnsafeResetUrlFailsWithoutEchoingSecretValues(string url)
    {
        var settings = ValidSmtp(); settings.ResetPageUrl = url;
        var result = Validator("Production").Validate(null, settings);
        Assert.True(result.Failed);
        Assert.DoesNotContain("SECRET_SENTINEL", result.FailureMessage);
    }

    [Theory]
    [InlineData("smtp.example.test", 0, "planner@example.test")]
    [InlineData("smtp.example.test", 65536, "planner@example.test")]
    [InlineData("https://smtp.example.test", 587, "planner@example.test")]
    [InlineData("smtp.example.test", 587, "invalid")]
    [InlineData("smtp.example.test", 587, "planner@example.test\r\nBcc: other@example.test")]
    public void MalformedTransportAndSenderAreRejected(string host, int port, string from)
    {
        var settings = ValidSmtp(); settings.Host = host; settings.Port = port; settings.From = from;
        Assert.True(Validator("Production").Validate(null, settings).Failed);
    }

    [Fact]
    public void RegistrationActuallyBindsAndEnforcesSmtpValidator()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:SigningKey"] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)),
            ["Smtp:Enabled"] = "true", ["Smtp:Host"] = "smtp.example.test", ["Smtp:Port"] = "587",
            ["Smtp:Security"] = "None", ["Smtp:From"] = "planner@example.test",
            ["Smtp:ResetPageUrl"] = "https://planner.example.test/parola-yenile#"
        }).Build();
        using var services = new ServiceCollection().AddLogging().AddSingleton<IHostEnvironment>(new TestEnvironment("Production"))
            .AddPlannerAuth(configuration).BuildServiceProvider();
        Assert.Throws<OptionsValidationException>(() => services.GetRequiredService<IOptions<SmtpSettings>>().Value);
        Assert.Throws<OptionsValidationException>(() => services.GetRequiredService<IStartupValidator>().Validate());
    }

    [Theory]
    [InlineData("")]
    [InlineData("too-short")]
    [InlineData("                                                                ")]
    public void MissingOrShortJwtKeyFailsWithoutBeingDisclosed(string key)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Jwt:SigningKey"] = key }).Build();
        using var services = new ServiceCollection().AddLogging().AddPlannerAuth(configuration).BuildServiceProvider();
        var error = Assert.Throws<OptionsValidationException>(() => services.GetRequiredService<IOptions<JwtSettings>>().Value);
        if (key.Length > 0) Assert.DoesNotContain(key, error.Message);
    }

    [Theory]
    [InlineData("localhost.attacker.example")]
    [InlineData("127.0.0.1.attacker.example")]
    public void LoopbackLookalikesCannotEnablePlaintext(string host)
    {
        var settings = ValidSmtp(); settings.Host = host; settings.Security = SecureSocketOptions.None;
        Assert.True(Validator("Testing").Validate(null, settings).Failed);
        settings.Security = SecureSocketOptions.StartTls; settings.ResetPageUrl = $"http://{host}/parola-yenile#";
        Assert.True(Validator("Testing").Validate(null, settings).Failed);
    }

    private sealed class TestEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "Adhd.Configuration.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}

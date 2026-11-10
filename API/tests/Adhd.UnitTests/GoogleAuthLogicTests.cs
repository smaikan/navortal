using Adhd.Application.Auth;
using Adhd.Domain.Users;
using Xunit;

namespace Adhd.UnitTests;

public sealed class GoogleAuthLogicTests
{
    [Fact]
    public void IdentityConstructorCompatibility_AllowsFourArguments()
    {
        var identity = new GoogleIdentity("sub123", "user@example.com", "Test User", true);
        Assert.Equal("sub123", identity.Subject);
        Assert.Equal("user@example.com", identity.Email);
        Assert.Equal("Test User", identity.Name);
        Assert.True(identity.EmailVerified);
        Assert.Null(identity.GivenName);
        Assert.Null(identity.FamilyName);
        Assert.Null(identity.Picture);
        Assert.Null(identity.HostedDomain);
        Assert.Null(identity.Nonce);
    }

    [Fact]
    public void IdentityConstructor_SupportsOptionalFields()
    {
        var identity = new GoogleIdentity(
            "sub123", "user@gmail.com", "Test User", true,
            GivenName: "Test", FamilyName: "User",
            Picture: "https://lh3.googleusercontent.com/photo.jpg",
            HostedDomain: "example.com", Nonce: "nonce_abc");

        Assert.Equal("Test", identity.GivenName);
        Assert.Equal("User", identity.FamilyName);
        Assert.Equal("https://lh3.googleusercontent.com/photo.jpg", identity.Picture);
        Assert.Equal("example.com", identity.HostedDomain);
        Assert.Equal("nonce_abc", identity.Nonce);
    }

    [Theory]
    [InlineData("user@gmail.com", true, null, true)]
    [InlineData("user@googlemail.com", true, null, false)]
    [InlineData("USER@GMAIL.COM", true, null, true)]
    [InlineData("user@company.com", true, "company.com", true)]
    [InlineData("user@yahoo.com", true, null, false)]
    [InlineData("user@yahoo.com", true, "", false)]
    [InlineData("user@gmail.com", false, null, false)]
    [InlineData("user@company.com", false, "company.com", false)]
    public void IsAuthoritativeGoogleEmail_IdentifiesAuthoritativeDomains(string email, bool verified, string? hd, bool expected)
    {
        var identity = new GoogleIdentity("sub", email, "Name", verified, HostedDomain: hd);
        Assert.Equal(expected, GoogleAuthService.IsAuthoritativeGoogleEmail(identity));
    }

    [Theory]
    [InlineData("https://lh3.googleusercontent.com/a/ACg8ocI=s96-c", true)]
    [InlineData("https://lh4.googleusercontent.com/photo.png", true)]
    [InlineData("https://googleusercontent.com/pic", true)]
    [InlineData("http://lh3.googleusercontent.com/photo.jpg", false)] // non-HTTPS
    [InlineData("https://lh3.googleusercontent.com:8443/photo.jpg", false)] // custom port
    [InlineData("https://user:pass@lh3.googleusercontent.com/photo.jpg", false)] // userinfo
    [InlineData("https://evil.com/photo.jpg", false)] // untrusted host
    [InlineData("https://notgoogleusercontent.com/photo.jpg", false)] // spoofed host
    [InlineData("", false)]
    [InlineData(null, false)]
    public void SanitizeGooglePictureUrl_ValidatesAllowedHostsAndSchemes(string? url, bool shouldBeValid)
    {
        var sanitized = GoogleAuthService.SanitizeGooglePictureUrl(url);
        if (shouldBeValid)
        {
            Assert.NotNull(sanitized);
            Assert.StartsWith("https://", sanitized);
        }
        else
        {
            Assert.Null(sanitized);
        }
    }

    [Fact]
    public void SanitizeGooglePictureUrl_RejectsUrlsExceedingMaxLength()
    {
        var longUrl = "https://lh3.googleusercontent.com/" + new string('a', 2050);
        Assert.Null(GoogleAuthService.SanitizeGooglePictureUrl(longUrl));
    }

    [Fact]
    public void TruncateNamePart_Enforces50CharactersAndSafeUnicode()
    {
        var turkish = "Şükrü İbrahim Hüseyinoğlu Çelebioğlu Dağdevirenoğlu Öztürk";
        var truncated = GoogleAuthService.TruncateNamePart(turkish);
        Assert.True(truncated.Length <= 50);

        // Control characters stripped
        var withControl = "Alan\u0000\u001fTuring";
        Assert.Equal("AlanTuring", GoogleAuthService.TruncateNamePart(withControl));

        // Surrogate pairs preserved intact (e.g. musical symbol or emoji)
        var emoji = "🚀🌟✨🎉🔥";
        var repeated = string.Concat(Enumerable.Repeat(emoji, 20));
        var truncatedEmoji = GoogleAuthService.TruncateNamePart(repeated);
        Assert.True(truncatedEmoji.Length <= 50);
        // Valid UTF-16 check: ensure no dangling high or low surrogates
        for (var i = 0; i < truncatedEmoji.Length; i++)
        {
            if (char.IsSurrogate(truncatedEmoji[i]))
            {
                Assert.True(char.IsHighSurrogate(truncatedEmoji[i]));
                Assert.True(i + 1 < truncatedEmoji.Length && char.IsLowSurrogate(truncatedEmoji[i + 1]));
                i++;
            }
        }
    }

    [Fact]
    public void ResolveNames_UsesGivenAndFamilyWhenPresent()
    {
        var identity = new GoogleIdentity("sub", "user@gmail.com", "Alan Mathison Turing", true,
            GivenName: "Alan", FamilyName: "Turing");

        var (first, last, display) = GoogleAuthService.ResolveNames(identity);
        Assert.Equal("Alan", first);
        Assert.Equal("Turing", last);
        Assert.Equal("Alan Turing", display);
    }

    [Fact]
    public void ResolveNames_PreservesFullNameWithoutGuessingSurname()
    {
        var identity = new GoogleIdentity("sub", "user@gmail.com", "Ada Lovelace", true);

        var (first, last, display) = GoogleAuthService.ResolveNames(identity);
        Assert.Equal("Ada Lovelace", first);
        Assert.Equal("", last);
        Assert.Equal("Ada Lovelace", display);
    }

    [Fact]
    public void FillingMissingFirstNamePreservesAnExistingSurname()
    {
        var user = new AppUser { Email = "person@gmail.com", DisplayName = "person@gmail.com", LastName = "My Surname" };
        var proof = new GoogleIdentity("sub", user.Email, "Ada Lovelace", true, "Ada", "Lovelace");
        var import = GoogleAuthService.DetermineProfileImport(user, proof)!;
        Assert.Equal("Ada", import.FirstName);
        Assert.Null(import.LastName);
        Assert.Equal("Ada My Surname", import.DisplayName);
    }

    [Fact]
    public void ResolveNames_FallsBackToEmailWhenNoName()
    {
        var identity = new GoogleIdentity("sub", "user@gmail.com", null, true);

        var (first, last, display) = GoogleAuthService.ResolveNames(identity);
        Assert.Equal("", first);
        Assert.Equal("", last);
        Assert.Equal("user@gmail.com", display);
    }

    [Fact]
    public void DetermineProfileImport_FillsMissingNameAndPictureForDefaultUser()
    {
        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            Email = "alice@gmail.com",
            DisplayName = "alice@gmail.com", // default display name (same as email)
            FirstName = null,
            LastName = null,
            GooglePictureUrl = null
        };

        var identity = new GoogleIdentity("sub", "alice@gmail.com", "Alice Smith", true,
            GivenName: "Alice", FamilyName: "Smith",
            Picture: "https://lh3.googleusercontent.com/photo.jpg");

        var import = GoogleAuthService.DetermineProfileImport(user, identity);
        Assert.NotNull(import);
        Assert.Equal("Alice", import.FirstName);
        Assert.Equal("Smith", import.LastName);
        Assert.Equal("Alice Smith", import.DisplayName);
        Assert.Equal("https://lh3.googleusercontent.com/photo.jpg", import.GooglePictureUrl);
    }

    [Fact]
    public void DetermineProfileImport_PreservesExistingRealUserNames()
    {
        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            Email = "bob@gmail.com",
            DisplayName = "Robert Custom", // real custom name
            FirstName = "Bob",
            LastName = "Custom",
            GooglePictureUrl = null
        };

        var identity = new GoogleIdentity("sub", "bob@gmail.com", "Google Bob", true,
            GivenName: "Google", FamilyName: "Bob",
            Picture: "https://lh3.googleusercontent.com/photo.jpg");

        var import = GoogleAuthService.DetermineProfileImport(user, identity);
        Assert.NotNull(import);
        Assert.Null(import.FirstName); // not overwritten
        Assert.Null(import.LastName);  // not overwritten
        Assert.Null(import.DisplayName); // not overwritten
        Assert.Equal("https://lh3.googleusercontent.com/photo.jpg", import.GooglePictureUrl); // picture imported
    }

    [Fact]
    public void DetermineProfileImport_ReturnsNullWhenNothingToImport()
    {
        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            Email = "charlie@gmail.com",
            DisplayName = "Charlie Real",
            FirstName = "Charlie",
            LastName = "Real",
            GooglePictureUrl = "https://lh3.googleusercontent.com/existing.jpg"
        };

        var identity = new GoogleIdentity("sub", "charlie@gmail.com", "Charlie G", true,
            GivenName: "Charlie", FamilyName: "G",
            Picture: "https://lh3.googleusercontent.com/new.jpg");

        var import = GoogleAuthService.DetermineProfileImport(user, identity);
        Assert.Null(import);
    }
}

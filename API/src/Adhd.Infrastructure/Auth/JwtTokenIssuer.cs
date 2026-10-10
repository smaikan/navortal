using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Adhd.Application.Auth;
using Adhd.Domain.Users;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Adhd.Infrastructure.Auth;

public sealed class JwtSettings
{
    public string Issuer { get; set; } = "adhd-api";
    public string Audience { get; set; } = "adhd-web";
    public string SigningKey { get; set; } = "";
}

public sealed class JwtTokenIssuer(IOptions<JwtSettings> settings, TimeProvider clock) : IAccessTokenIssuer
{
    public string Issue(AppUser user, Guid sessionId)
    {
        var config = settings.Value;
        var token = new JwtSecurityToken(config.Issuer, config.Audience,
            [new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()), new Claim(JwtRegisteredClaimNames.Sid, sessionId.ToString()),
             new Claim(JwtRegisteredClaimNames.Iat, clock.GetUtcNow().ToUnixTimeSeconds().ToString(System.Globalization.CultureInfo.InvariantCulture), ClaimValueTypes.Integer64)],
            signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config.SigningKey)), SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler { SetDefaultTimesOnTokenCreation = false }.WriteToken(token);
    }
}

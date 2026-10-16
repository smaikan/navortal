using System.ComponentModel.DataAnnotations;
using Adhd.Application.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/account/profile")]
public sealed class ProfileController(ProfileService profile) : ControllerBase
{
    private Guid Owner => Guid.Parse(User.FindFirst("sub")!.Value);
    private void ExpectedOwner(Guid expected)
    {
        if (expected != Owner) throw new Adhd.Application.Common.UseCaseException(Adhd.Application.Common.ErrorKind.NotFound, "profile_owner_changed", "Profil sahibi değişti. Girişini kontrol et.");
    }
    [HttpGet] public Task<ProfileView> Read(CancellationToken ct) => profile.ReadAsync(Owner, ct);
    [HttpPut] public Task<ProfileView> Name(UpdateProfileRequest request, CancellationToken ct) { ExpectedOwner(request.ExpectedUserId); return profile.NameAsync(Owner, request.Version, request.FirstName, request.LastName, ct); }
    [HttpPut("photo"), RequestSizeLimit(3_000_000), EnableRateLimiting("auth")]
    public Task<ProfileView> Upload(UploadProfilePhotoRequest request, CancellationToken ct) { ExpectedOwner(request.ExpectedUserId); return profile.UploadAsync(Owner, request.Version, request.UploadId, request.MediaType, request.ContentBase64, ct); }
    [HttpDelete("photo")]
    public Task<ProfileView> Remove(ProfileVersionRequest request, CancellationToken ct) { ExpectedOwner(request.ExpectedUserId); return profile.RemoveAsync(Owner, request.Version, ct); }
    [HttpGet("photo"), Produces("image/jpeg"), ProducesResponseType(typeof(byte[]), 200)]
    public async Task<IActionResult> Photo([FromQuery] Guid version, CancellationToken ct)
    {
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        Response.Headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
        return File(await profile.PhotoAsync(Owner, version, ct), "image/jpeg");
    }
}
public sealed class UpdateProfileRequest
{
    [Required] public Guid ExpectedUserId { get; set; }
    [Range(1, long.MaxValue)] public long Version { get; set; }
    [Required, StringLength(ProfileService.MaxNamePart, MinimumLength = 1)] public string FirstName { get; set; } = "";
    [StringLength(ProfileService.MaxNamePart)] public string? LastName { get; set; }
}
public sealed class ProfileVersionRequest { [Required] public Guid ExpectedUserId { get; set; } [Range(1, long.MaxValue)] public long Version { get; set; } }
public sealed class UploadProfilePhotoRequest
{
    [Required] public Guid ExpectedUserId { get; set; }
    [Range(1, long.MaxValue)] public long Version { get; set; }
    public Guid UploadId { get; set; }
    [Required, StringLength(20)] public string MediaType { get; set; } = "";
    [Required, StringLength(ProfileService.MaxBase64Length)] public string ContentBase64 { get; set; } = "";
}

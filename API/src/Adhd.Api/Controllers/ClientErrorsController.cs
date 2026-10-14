using System.ComponentModel.DataAnnotations;
using Adhd.Application.ClientErrors;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

// Tarayıcı yakalanmamış hatasını gönderir. Maskele, 30 gün tut. Sınır aşılırsa 429 dön.
[ApiController, Authorize, Route("api/client-errors")]
public sealed class ClientErrorsController(ClientErrorService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpPost, ProducesResponseType(202), ProducesResponseType(429)]
    public async Task<IActionResult> Report(ClientErrorRequest request, CancellationToken ct)
    {
        var stored = await service.ReportAsync(UserId, new(request.Message, request.Kind!.Value, request.Route, request.BuildId, request.BrowserFamily, request.OccurredAt!.Value), ct);
        return stored ? Accepted() : Problem(statusCode: 429, title: "Hata raporu sınırı doldu.", extensions: new Dictionary<string, object?> { ["code"] = "client_error_limited" });
    }
}
public sealed class ClientErrorRequest
{
    [Required, StringLength(500, MinimumLength = 1)] public string Message { get; set; } = "";
    [Required] public ClientErrorKind? Kind { get; set; }
    [Required, StringLength(200, MinimumLength = 1)] public string Route { get; set; } = "";
    [Required, StringLength(100, MinimumLength = 1)] public string BuildId { get; set; } = "";
    [Required, StringLength(20, MinimumLength = 1)] public string BrowserFamily { get; set; } = "";
    [Required] public DateTimeOffset? OccurredAt { get; set; }
}

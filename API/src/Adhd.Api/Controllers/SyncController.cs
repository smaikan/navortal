using Adhd.Application.Sync;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/sync")]
public sealed class SyncController(ISyncStore store) : ControllerBase
{
    [HttpGet]
    public Task<SyncView> Get(CancellationToken ct) => store.ReadAsync(Guid.Parse(User.FindFirst("sub")!.Value), ct);
}

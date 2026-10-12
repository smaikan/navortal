using Adhd.Application.Sync;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/workspace")]
public sealed class WorkspaceController(IWorkspaceSnapshotStore store) : ControllerBase
{
    [HttpGet("snapshot")]
    public Task<WorkspaceSnapshotView> Snapshot([FromQuery] bool includeFocus = false, CancellationToken ct = default)
        => store.ReadWorkspaceAsync(Guid.Parse(User.FindFirst("sub")!.Value), includeFocus, ct);
}

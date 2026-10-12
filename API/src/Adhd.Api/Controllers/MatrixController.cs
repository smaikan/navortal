using System.ComponentModel.DataAnnotations;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/matrix")]
public sealed class MatrixController(IMatrixStore store) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpGet] public Task<MatrixView> Get(CancellationToken ct, int inboxOffset = 0, int doOffset = 0, int scheduleOffset = 0, int delegateOffset = 0, int eliminateOffset = 0, int limit = 25) =>
        store.ReadAsync(UserId, [inboxOffset, doOffset, scheduleOffset, delegateOffset, eliminateOffset], limit, ct);
    [HttpGet("candidates")] public Task<TaskPickerPage> Candidates(CancellationToken ct, string? search = null, int offset = 0, int limit = 25) => store.CandidatesAsync(UserId, search, offset, limit, ct);
    [HttpPost("items/{taskId:guid}")] public Task<MatrixWriteResult> Add(Guid taskId, MatrixRequest request, CancellationToken ct) => store.WriteAsync(UserId, taskId, new(request.Version, request.Quadrant, request.BeforeTaskId), true, ct);
    [HttpPut("items/{taskId:guid}")] public Task<MatrixWriteResult> Move(Guid taskId, MatrixRequest request, CancellationToken ct) => store.WriteAsync(UserId, taskId, new(request.Version, request.Quadrant, request.BeforeTaskId), false, ct);
    [HttpDelete("items/{taskId:guid}")] public Task<MatrixWriteResult> Remove(Guid taskId, [FromQuery, Range(0, long.MaxValue)] long version, CancellationToken ct) => store.RemoveAsync(UserId, taskId, version, ct);
}
public sealed class MatrixRequest
{
    [Range(0, long.MaxValue)] public long Version { get; set; }
    [Required] public MatrixQuadrant Quadrant { get; set; }
    public Guid? BeforeTaskId { get; set; }
}

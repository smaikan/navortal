using System.ComponentModel.DataAnnotations;
using Adhd.Application.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/tasks/{id:guid}/classification")]
public sealed class TaskClassificationController(TaskClassificationService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpGet] public Task<ClassificationView> Get(Guid id, CancellationToken ct) => service.ReadAsync(UserId, id, ct);
    [HttpPut] public Task<ClassificationView> Put(Guid id, ClassificationRequest request, CancellationToken ct) =>
        service.WriteAsync(UserId, id, new(request.Version, new(request.ProjectId, request.PoolId, request.CategoryId, request.TagIds), request.ApplyToSubtree, request.ExpectedPlanningVersion), ct);
}
public sealed class ClassificationRequest
{
    [Range(1, long.MaxValue)] public long Version { get; set; }
    public Guid? ProjectId { get; set; }
    public Guid? PoolId { get; set; }
    public Guid? CategoryId { get; set; }
    [Required, MaxLength(50)] public Guid[] TagIds { get; set; } = [];
    public bool ApplyToSubtree { get; set; }
    [Range(0, long.MaxValue)] public long? ExpectedPlanningVersion { get; set; }
}

using System.ComponentModel.DataAnnotations;
using Adhd.Application.Collections;
using Adhd.Domain.Collections;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize]
public abstract class NamedResourcesController<T>(NamedResourceService<T> service) : ControllerBase where T : class, INamedResource, new()
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpPost, ProducesResponseType(typeof(NamedResourceView), 201)] public async Task<ActionResult<NamedResourceView>> Create(ResourceFieldsRequest request, CancellationToken ct)
    {
        var row = await service.CreateAsync(UserId, new(request.Name, request.Description), ct);
        return CreatedAtAction(nameof(Get), new { id = row.Id }, row);
    }
    [HttpGet("{id:guid}")] public Task<NamedResourceView> Get(Guid id, CancellationToken ct) => service.GetAsync(UserId, id, ct);
    [HttpGet("{id:guid}/workload")] public Task<NamedResourceWorkload> Workload(Guid id, CancellationToken ct) => service.WorkloadAsync(UserId, id, ct);
    [HttpGet] public Task<NamedResourcePage> List([FromQuery] int offset = 0, [FromQuery] int limit = 50, [FromQuery] string? search = null, [FromQuery] bool includeArchived = false, [FromQuery] bool includeSummary = false, CancellationToken ct = default) =>
        service.ListAsync(UserId, offset, limit, search, includeArchived, includeSummary, ct);
    [HttpPut("{id:guid}")] public Task<NamedResourceView> Update(Guid id, UpdateResourceRequest request, CancellationToken ct) => service.UpdateAsync(UserId, id, request.Version, new(request.Name, request.Description), ct);
    [HttpPost("{id:guid}/archive")] public Task<NamedResourceView> Archive(Guid id, ResourceVersionRequest request, CancellationToken ct) => service.ArchiveAsync(UserId, id, request.Version, ct);
}
[Route("api/projects")] public sealed class ProjectsController(NamedResourceService<TaskProject> service) : NamedResourcesController<TaskProject>(service);
[Route("api/pools")] public sealed class PoolsController(NamedResourceService<TaskPool> service) : NamedResourcesController<TaskPool>(service);
[Route("api/categories")] public sealed class CategoriesController(NamedResourceService<TaskCategory> service) : NamedResourcesController<TaskCategory>(service);
[Route("api/tags")] public sealed class TagsController(NamedResourceService<TaskTag> service) : NamedResourcesController<TaskTag>(service);

public class ResourceFieldsRequest
{
    [Required, StringLength(200)] public string Name { get; set; } = "";
    [StringLength(10000)] public string? Description { get; set; }
}
public sealed class UpdateResourceRequest : ResourceFieldsRequest { [Range(1, long.MaxValue)] public long Version { get; set; } }
public sealed class ResourceVersionRequest { [Range(1, long.MaxValue)] public long Version { get; set; } }

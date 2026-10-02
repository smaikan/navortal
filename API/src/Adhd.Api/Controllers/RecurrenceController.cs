using System.ComponentModel.DataAnnotations;
using Adhd.Application.Recurrence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/recurrence-templates")]
public sealed class RecurrenceController(RecurrenceService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    private RecurrenceEffect Result(RecurrenceEffect effect) { if (effect.Replayed) Response.Headers["Idempotent-Replay"] = "true"; return effect; }
    [HttpPost, ProducesResponseType(typeof(RecurrenceEffect), 201)]
    public async Task<ActionResult<RecurrenceEffect>> Create(RecurrenceCreate request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var effect = Result(await service.CreateAsync(UserId, request, key ?? "", ct)); return Created($"/api/recurrence-templates/{effect.Template.Id}", effect);
    }
    [HttpPut("{id:guid}")] public async Task<RecurrenceEffect> Update(Guid id, RecurrenceUpdate request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct) => Result(await service.UpdateAsync(UserId, id, request, key ?? "", ct));
    [HttpPut("{id:guid}/enabled")] public async Task<RecurrenceEffect> Enabled(Guid id, RecurrenceEnableRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct) => Result(await service.EnableAsync(UserId, id, request.Version, request.Enabled!.Value, key ?? "", ct));
    [HttpPost("{id:guid}/materialize")] public async Task<RecurrenceEffect> Materialize(Guid id, MaterializeRecurrence request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct) => Result(await service.MaterializeAsync(UserId, id, request, key ?? "", ct));
    [HttpPost("{id:guid}/occurrences/{date}/skip")] public async Task<RecurrenceEffect> Skip(Guid id, DateOnly date, ChangeOccurrence request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct) => Result(await service.ChangeOccurrenceAsync(UserId, id, date, request, false, key ?? "", ct));
    [HttpPost("{id:guid}/occurrences/{date}/cancel")] public async Task<RecurrenceEffect> Cancel(Guid id, DateOnly date, ChangeOccurrence request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct) => Result(await service.ChangeOccurrenceAsync(UserId, id, date, request, true, key ?? "", ct));
    [HttpGet("{id:guid}")] public Task<RecurrenceTemplateView> Get(Guid id, CancellationToken ct) => service.GetAsync(UserId, id, ct);
    [HttpGet] public Task<RecurrenceTemplatePage> List([FromQuery] int offset = 0, [FromQuery] int limit = 50, CancellationToken ct = default) => service.ListAsync(UserId, offset, limit, ct);
    [HttpGet("{id:guid}/definitions")] public Task<RecurrenceDefinitionPage> Definitions(Guid id, [FromQuery] int offset = 0, [FromQuery] int limit = 50, CancellationToken ct = default) => service.DefinitionsAsync(UserId, id, offset, limit, ct);
    [HttpGet("{id:guid}/occurrences")] public Task<OccurrencePage> Occurrences(Guid id, [FromQuery] RecurrenceWindowQuery query, CancellationToken ct) => service.OccurrencesAsync(UserId, id, query.FromDate!.Value, query.ToDate!.Value, query.Offset, query.Limit, ct);
    [HttpGet("/api/tasks/{id:guid}/recurrence")] public Task<OccurrenceView> ForTask(Guid id, CancellationToken ct) => service.ForTaskAsync(UserId, id, ct);
}
public sealed class RecurrenceWindowQuery
{
    [Required] public DateOnly? FromDate { get; set; }
    [Required] public DateOnly? ToDate { get; set; }
    public int Offset { get; set; }
    public int Limit { get; set; } = 50;
}
public sealed class RecurrenceEnableRequest { [Range(1, long.MaxValue)] public long Version { get; set; } [Required] public bool? Enabled { get; set; } }

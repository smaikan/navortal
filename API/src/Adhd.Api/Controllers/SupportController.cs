using System.ComponentModel.DataAnnotations;
using Adhd.Application.Focus;
using Adhd.Application.Scheduling;
using Adhd.Application.Support;
using Adhd.Application.Tasks;
using Adhd.Domain.Support;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/support")]
public sealed class SupportController(SupportService service, FocusService focus, ISupportPlanningCoordinator planning) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpPost("/api/notes"), ProducesResponseType(typeof(NoteView), 201)] public async Task<ActionResult<NoteView>> CreateNote(NoteFields request, CancellationToken ct) { var view = await service.CreateNoteAsync(UserId, request, ct); return Created("/api/notes", view); }
    [HttpGet("/api/notes")] public Task<NotePage> Notes([FromQuery] Guid? taskId = null, [FromQuery] NoteKind? kind = null, [FromQuery] DateOnly? date = null, [FromQuery] int offset = 0, [FromQuery] int limit = 50, CancellationToken ct = default) => service.NotesAsync(UserId, taskId, kind, date, offset, limit, ct);
    [HttpPut("/api/notes/{id:guid}")] public Task<NoteView> EditNote(Guid id, EditNoteRequest request, CancellationToken ct) => service.ChangeNoteAsync(UserId, id, request.Version, request.Text, request.DueAt, false, ct);
    [HttpPost("/api/notes/{id:guid}/delete")] public Task<NoteView> DeleteNote(Guid id, TaskVersionRequest request, CancellationToken ct) => service.ChangeNoteAsync(UserId, id, request.Version, null, null, true, ct);
    [HttpPost("/api/notes/{id:guid}/convert")]
    public async Task<ConvertedNote> Convert(Guid id, NoteConversion request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var result = await service.ConvertAsync(UserId, id, request, key ?? "", ct); if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true"; return result;
    }
    [HttpGet("days/{date}")] public Task<SupportDayView> Day(DateOnly date, CancellationToken ct) => service.DayAsync(UserId, date, null, ct);
    [HttpPut("days/{date}")] public Task<SupportDayView> ChangeDay(DateOnly date, SupportDayChange request, CancellationToken ct) => service.DayAsync(UserId, date, request, ct);
    [HttpPut("/api/tasks/{id:guid}/energy")] public Task<TaskView> Energy(Guid id, EnergyRequest request, CancellationToken ct) => service.EnergyAsync(UserId, id, request.Version, request.EnergyDemand, ct);
    [HttpGet("/api/tasks/{id:guid}/return-context")] public Task<ReturnContext> Return(Guid id, CancellationToken ct) => service.ReturnAsync(UserId, id, ct);
    [HttpGet("days/{date}/end-preparation")] public Task<DayEndPreparation> End(DateOnly date, [FromQuery] int offset = 0, [FromQuery] int limit = 50, CancellationToken ct = default) => service.DayEndAsync(UserId, date, offset, limit, ct);
    [HttpPost("quick-start"), ProducesResponseType(typeof(FocusView), 201)]
    public async Task<ActionResult<FocusView>> QuickStart(QuickStartRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var result = await focus.QuickStartAsync(UserId, new(request.TaskId, request.WorkSessionId, request.WorkSessionVersion), key ?? "", ct); if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true"; return Created($"/api/focus-sessions/{result.Values.Id}", result.Values);
    }
    [HttpPost("rescue")]
    public async Task<SchedulingPreviewView> Rescue(SchedulingRequestDto request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var result = await planning.RescueAsync(UserId, new(request.Date!.Value, request.TaskIds, request.ExpectedPlanningVersion, request.NewWorkNotBefore), key ?? "", ct); if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true"; return result.Values;
    }
}
public sealed class EditNoteRequest { [Range(1, long.MaxValue)] public long Version { get; set; } [Required, StringLength(10000)] public string Text { get; set; } = ""; public DateTimeOffset? DueAt { get; set; } }
public sealed class EnergyRequest { [Range(1, long.MaxValue)] public long Version { get; set; } public EnergyLevel? EnergyDemand { get; set; } }
public sealed record QuickStartRequest(Guid? TaskId = null, Guid? WorkSessionId = null, long? WorkSessionVersion = null);

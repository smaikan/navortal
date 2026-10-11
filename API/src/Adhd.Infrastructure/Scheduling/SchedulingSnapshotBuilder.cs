using System.Collections.Immutable;
using System.Data;
using Adhd.Application.Common;
using Adhd.Application.Planning;
using Adhd.Application.Preferences;
using Adhd.Application.Scheduling;
using Adhd.Domain.Planning;
using Adhd.Domain.Preferences;
using Adhd.Domain.Scheduling;
using Adhd.Domain.Work;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Scheduling;

internal sealed record TaskVersionStamp(Guid TaskId, long Version);
internal sealed record UndoContext(Guid ChangeSetId, UndoDelta[] Changes, bool AllowProtectedChange);
internal sealed record SchedulingInput(SchedulingSnapshot Snapshot, SchedulingIntent Intent, ScheduleView[] CurrentSchedules,
    Guid? CurrentPlanId, long CurrentPlanVersion, long PreferencesVersion, TaskVersionStamp[] TaskVersions,
    Guid? ActiveSessionId, long? ActiveSessionVersion, string PlanningMode, UndoContext? Undo = null, Guid? ActiveTaskId = null);
internal sealed class ActualRollup
{
    public Guid TaskId { get; set; }
    public decimal Seconds { get; set; }
    public bool ClockConflict { get; set; }
}
internal sealed class SchedulingSnapshotBuilder(PlannerDbContext db, IPreferencesStore preferences, TimeProvider clock)
{
    internal async Task<SchedulingInput> Build(Guid userId, SchedulingRequest request, CancellationToken ct, bool allowEmpty = false, bool useExistingTransaction = false, DateTimeOffset? capturedNow = null)
    {
        if (request.Date.Year is < 2 or > 9998 || request.TaskIds is null || request.TaskIds.Length > 1000 || !allowEmpty && request.TaskIds.Length == 0 || request.TaskIds.Distinct().Count() != request.TaskIds.Length || request.ExpectedPlanningVersion < 0)
            throw new UseCaseException(ErrorKind.Validation, "scheduling_request_invalid", "Geçerli gün ve1..1000 benzersiz görev seçin.");
        await using var tx = useExistingTransaction ? null : await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var version = await db.PlanningStates.AsNoTracking().Where(x => x.UserId == userId).Select(x => x.PlanningVersion).SingleAsync(ct); var now = capturedNow ?? clock.GetUtcNow();
        if (request.ExpectedPlanningVersion.HasValue && request.ExpectedPlanningVersion != version) throw new UseCaseException(ErrorKind.Conflict, "planning_version_conflict", "Plan girdileri değişmiş; güncel planı alın.");
        var prefs = await preferences.ReadAsync(userId, ct); var plan = await db.DailyPlans.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.LocalDate == request.Date, ct);
        var zone = plan?.TimeZoneId ?? prefs.Values.TimeZoneId; var dayStart = PlanTime.DayStart(request.Date, zone); var dayEnd = PlanTime.DayStart(request.Date.AddDays(1), zone);
        var nodes = await db.Tasks.AsNoTracking().Where(x => x.UserId == userId).OrderBy(x => x.Id).ToArrayAsync(ct);
        if (request.TaskIds.Any(id => nodes.All(x => x.Id != id))) throw new UseCaseException(ErrorKind.NotFound, "task_not_found", "Görev bulunamadı.");
        var dependencies = await db.TaskDependencies.AsNoTracking().Where(x => x.UserId == userId).OrderBy(x => x.PredecessorTaskId).ThenBy(x => x.SuccessorTaskId).Select(x => new SchedulingDependency(x.PredecessorTaskId, x.SuccessorTaskId)).ToArrayAsync(ct);
        var ordering = await db.TaskOrderingPreferences.AsNoTracking().Where(x => x.UserId == userId).OrderBy(x => x.BeforeTaskId).ThenBy(x => x.AfterTaskId).Select(x => new SchedulingOrder(x.BeforeTaskId, x.AfterTaskId)).ToArrayAsync(ct);
        // Eski çalışma parçalarını yüklemeden epoch'u PostgreSQL'de mikrosaniye hassasiyetinde hesapla.
        var totals = await db.Database.SqlQuery<ActualRollup>($"""
            SELECT ws."TaskId", SUM(EXTRACT(EPOCH FROM (COALESCE(s."EndedAt", {now}) - s."StartedAt")))::numeric AS "Seconds",
                bool_or(COALESCE(s."EndedAt", s."StartedAt") > {now}) AS "ClockConflict"
            FROM work_session_segments s JOIN work_sessions ws ON ws."Id"=s."SessionId" AND ws."UserId"=s."UserId"
            WHERE s."UserId"={userId} AND NOT s."IsVoided" AND ws."TaskId" IS NOT NULL GROUP BY ws."TaskId"
            """).ToArrayAsync(ct);
        if (totals.Any(x => x.ClockConflict || x.Seconds < 0)) throw new UseCaseException(ErrorKind.Conflict, "server_clock_conflict", "Sunucu zamanı çalışma kaydından geride.");
        var actual = totals.ToDictionary(x => x.TaskId, x => x.Seconds);
        var current = plan is null ? [] : await db.TaskSchedules.AsNoTracking().Where(x => x.UserId == userId && x.DailyPlanId == plan.Id && x.State == ScheduleState.Planned).OrderBy(x => x.Id).ToArrayAsync(ct);
        var planId = plan?.Id;
        var outside = await db.TaskSchedules.AsNoTracking().Where(x => x.UserId == userId && x.DailyPlanId != planId && x.State == ScheduleState.Planned && x.EndsAt > now).OrderBy(x => x.Id).ToArrayAsync(ct);
        var reserved = outside.Where(x => x.Kind == ScheduleKind.Work).ToLookup(x => x.TaskId!.Value);
        var active = await db.WorkSessions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.State == WorkState.Running, ct);
        if (active is { TaskId: null }) throw new UseCaseException(ErrorKind.Conflict, "general_work_active", "Genel odak çalışması sürüyor; otomatik planlamadan önce duraklatın. Hedef süresi gerçek çalışmanın bitiş tahmini değildir.");
        var activeToday = active is not null && now >= dayStart && now < dayEnd;
        var tasks = nodes.Select(t =>
        {
            var held = reserved[t.Id].ToArray(); var heldSeconds = held.Sum(x => WorkTime.Seconds(x.StartsAt > now ? x.StartsAt : now, x.EndsAt));
            var last = held.Length == 0 ? null : (DateTimeOffset?)held.Max(x => x.EndsAt);
            return new SchedulingTask(t.Id, t.ParentTaskId, t.RequiredForParent, t.HasDirectWork, t.DirectWorkCompleted, t.State, t.DirectEstimatedSeconds,
                actual.GetValueOrDefault(t.Id), heldSeconds, last, t.Priority, t.DeadlineAt, t.SortOrder, CanSplit: t.CanSplit, IsArchived: t.ArchivedAt.HasValue, EnergyDemand: t.EnergyDemand);
        }).ToArray();
        var support = prefs.Values.SupportEnabled ? await db.SupportDays.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.LocalDate == request.Date, ct) : null;
        if (support is not null)
        {
            var critical = await db.CriticalTasks.Where(x => x.UserId == userId && x.LocalDate == request.Date).Select(x => x.TaskId).ToArrayAsync(ct);
            var criticalIds = SchedulingSelection.Expand(tasks.ToImmutableArray(), critical.ToImmutableArray()); tasks = tasks.Select(t => t with { IsCritical = criticalIds.Contains(t.Id) }).ToArray();
        }
        var existing = current.Select(x => new SchedulingBlock(x.Id, x.TaskId, x.Kind, x.StartsAt, x.EndsAt, x.IsFixed, x.IsLocked, IsAutomatic: x.IsAutomatic)).ToList();
        if (activeToday && active!.TaskId is { } taskId)
        {
            var segmentStart = await db.WorkSegments.AsNoTracking().Where(x => x.UserId == userId && x.SessionId == active.Id && !x.IsVoided && x.EndedAt == null).Select(x => x.StartedAt).SingleAsync(ct);
            var task = tasks.Single(x => x.Id == taskId); var remaining = task.EstimatedSeconds is { } estimate ? Math.Max(0, estimate - task.ActualSeconds) : (decimal?)null;
            var available = WorkTime.Seconds(now, dayEnd); var future = remaining is > 0 ? Math.Min(remaining.Value, available) : available;
            var expectedEnd = now.AddTicks((long)(future * TimeSpan.TicksPerSecond));
            var i = existing.FindIndex(x => x.ExistingScheduleId == active.StartedScheduleId && x.TaskId == taskId);
            // Önceki yeniden planlama, ilk başta plansız başlayan sayacı plana eklemiş olabilir.
            // Mevcut bloğu kullan. Oturuma geriye dönük başlangıç veya revizyon bağı ekleme
            if (i < 0) i = existing.FindIndex(x => x.TaskId == taskId && x.IsAutomatic && !x.IsFixed && !x.IsLocked && x.StartsAt <= now && x.EndsAt > now);
            if (i >= 0)
            {
                var block = existing[i];
                existing[i] = block with { IsActive = true, StartsAt = block.IsFixed || block.IsLocked || block.StartsAt <= now ? block.StartsAt : now,
                    EndsAt = block.IsFixed || block.IsLocked ? block.EndsAt : expectedEnd > now ? expectedEnd : block.EndsAt };
            }
            else existing.Add(new(null, taskId, ScheduleKind.Work, segmentStart > dayStart ? segmentStart : dayStart, expectedEnd, IsActive: true, IsAutomatic: true));
        }
        // Çalışma dışı özel gün kapasiteyi boşaltır. Tarih ayarı öncelikli, mevcut bloklar yerinde kalır.
        var nonWorking = !prefs.Values.Exceptions.Any(x => x.Date == request.Date) && await Adhd.Infrastructure.SpecialDays.SpecialDayStore.IsNonWorkingAsync(db, userId, request.Date, ct);
        var windows = nonWorking ? ImmutableArray<SchedulingWindow>.Empty
            : WorkingCalendar.UtcIntervals(prefs.Values with { TimeZoneId = zone }, request.Date).Select(x => new SchedulingWindow(x.StartsAt, x.EndsAt)).ToImmutableArray();
        var busy = outside.Where(x => x.StartsAt < dayEnd && x.EndsAt > dayStart).Select(x => new SchedulingWindow(x.StartsAt > dayStart ? x.StartsAt : dayStart, x.EndsAt < dayEnd ? x.EndsAt : dayEnd)).ToImmutableArray();
        var snapshot = new SchedulingSnapshot(request.Date, zone, now, version, tasks.ToImmutableArray(), dependencies.ToImmutableArray(), ordering.ToImmutableArray(), windows,
            existing.ToImmutableArray(), new(prefs.Values.MinimumSplitSeconds, prefs.Values.TransitionSeconds), busy,
            outside.Where(x => x.Kind == ScheduleKind.Work).Select(x => new SchedulingBlock(x.Id, x.TaskId, x.Kind, x.StartsAt, x.EndsAt, x.IsFixed, x.IsLocked, IsAutomatic: x.IsAutomatic)).ToImmutableArray(), support?.AvailableEnergy);
        // Dakika sınırına yuvarla ki önizleme ve ağ gecikmesi yeni başlangıcı kaçırmasın.
        var leadTicks = now.AddSeconds(30).UtcTicks; var minute = TimeSpan.TicksPerMinute;
        var lead = request.NewWorkNotBefore is { } requestedLead ? new DateTimeOffset(requestedLead.UtcTicks / 10 * 10, TimeSpan.Zero) : new DateTimeOffset((leadTicks + minute - 1) / minute * minute, TimeSpan.Zero);
        return new(snapshot, new(request.TaskIds.Order().ToImmutableArray(), NewWorkNotBefore: lead), current.Select(RevisionWriter.View).ToArray(), plan?.Id, plan?.Version ?? 0,
            prefs.Version, nodes.Select(x => new TaskVersionStamp(x.Id, x.Version)).ToArray(), active?.Id, active?.Version, prefs.Values.PlanningMode, ActiveTaskId: active?.TaskId);
    }
}

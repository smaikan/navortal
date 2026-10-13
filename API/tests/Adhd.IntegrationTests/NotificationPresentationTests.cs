using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Focus;
using Adhd.Application.Notifications;
using Adhd.Application.SpecialDays;
using Adhd.Application.Work;
using Adhd.Domain.Focus;
using Adhd.Domain.Jobs;
using Adhd.Domain.Notifications;
using Adhd.Infrastructure.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Adhd.IntegrationTests;

public sealed class NotificationPresentationTests
{
    [Fact]
    public async Task ScheduleAndDeadlineLeadMessagesUseCurrentOwnerTaskNameAndChangeWordingAtTheEvent()
    {
        var (s, sent) = await Create(new(PushEnabled: true, LeadSeconds: 300)); await using var scenario = s;
        var now = s.App.Clock.Now; var task = await s.User.Root("İlk görev adı"); await s.User.Define(task.Id, true, 1200);
        await ManualPlanningTests.Create(s.User, task.Id, now.AddMinutes(10), now.AddMinutes(20)); await s.Pump();
        s.App.Clock.Now = now.AddMinutes(5); await s.Reminders(); await s.Pump();
        Assert.Equal(("Planlı iş yaklaşıyor", "İlk görev adı"), (sent.Sent.Last().Title, sent.Sent.Last().Body));
        task = await s.User.Get(task.Id);
        Assert.Equal(HttpStatusCode.OK, (await s.User.Client.PutAsJsonAsync($"/api/tasks/{task.Id}", new { version = task.Version, title = "Güncel görev adı" })).StatusCode);
        await Snooze(s, "ScheduleStart"); s.App.Clock.Now = now.AddMinutes(10); await s.Pump();
        Assert.Equal(("Planlı iş başlıyor", "Güncel görev adı"), (sent.Sent.Last().Title, sent.Sent.Last().Body));
        s.App.Clock.Now = now.AddMinutes(15); await s.Reminders(); await s.Pump();
        Assert.Equal(("Planlı işin bitişi yaklaşıyor", "Güncel görev adı"), (sent.Sent.Last().Title, sent.Sent.Last().Body));
        await Snooze(s, "ScheduleEnd"); s.App.Clock.Now = now.AddMinutes(20); await s.Pump();
        Assert.Equal(("Planlı işin bitiş zamanı geldi", "Güncel görev adı"), (sent.Sent.Last().Title, sent.Sent.Last().Body));
        task = await s.User.Get(task.Id);
        Assert.Equal(HttpStatusCode.OK, (await s.User.Client.PutAsJsonAsync($"/api/tasks/{task.Id}", new { version = task.Version, title = task.Title, deadlineAt = now.AddMinutes(30) })).StatusCode);
        await s.Pump(); s.App.Clock.Now = now.AddMinutes(25); await s.Reminders(); await s.Pump();
        Assert.Equal(("Son teslim yaklaşıyor", "Güncel görev adı"), (sent.Sent.Last().Title, sent.Sent.Last().Body));
        await Snooze(s, "TaskDeadline"); s.App.Clock.Now = now.AddMinutes(30); await s.Pump();
        Assert.Equal(("Son teslim zamanı geldi", "Güncel görev adı"), (sent.Sent.Last().Title, sent.Sent.Last().Body));
        Assert.Equal(6, sent.Sent.Count);
    }

    [Fact]
    public async Task AutoBreakTargetAndBreakEndDescribeTheConfirmedServerPhase()
    {
        var (s, sent) = await Create(new(PushEnabled: true)); await using var scenario = s;
        var focus = await FocusTests.Start(s.User, settings: new(60, 60, TargetBehavior: FocusTargetBehavior.AutoBreak));
        s.App.Clock.Now = s.App.Clock.Now.AddMinutes(1);
        focus = await TaskScenario.Read<FocusView>(await s.User.Client.GetAsync($"/api/focus-sessions/{focus.Id}"));
        Assert.Equal(FocusState.Break, focus.State); await s.Pump();
        Assert.Equal(("Pomodoro süresi doldu", "Molan başladı."), (sent.Sent.Last().Title, sent.Sent.Last().Body));
        s.App.Clock.Now = s.App.Clock.Now.AddMinutes(1);
        focus = await TaskScenario.Read<FocusView>(await s.User.Client.GetAsync($"/api/focus-sessions/{focus.Id}"));
        Assert.Equal(FocusState.AwaitingNext, focus.State); await s.Pump();
        Assert.Equal(("Mola bitti", "Yeni bir pomodoroya başlayabilirsin."), (sent.Sent.Last().Title, sent.Sent.Last().Body));
    }

    [Fact]
    public async Task ReturnAndSpecialDayReadTheirCurrentOwnerNamesAndForeignTaskSourceCannotSend()
    {
        var (s, sent) = await Create(new(PushEnabled: true, ReturnAfterSeconds: 60)); await using var scenario = s;
        var now = s.App.Clock.Now; var task = await s.User.Root("İlk iş adı"); await s.User.Define(task.Id, true, 1200);
        var work = await TaskScenario.Read<WorkView>(await WorkSessionTests.Start(s.User, task.Id));
        await WorkSessionTests.Change(s.User, work, "pause"); await s.Pump();
        task = await s.User.Get(task.Id);
        Assert.Equal(HttpStatusCode.OK, (await s.User.Client.PutAsJsonAsync($"/api/tasks/{task.Id}", new { version = task.Version, title = "Kaldığım iş" })).StatusCode);
        s.App.Clock.Now = now.AddMinutes(1); await s.Pump();
        Assert.Equal(("İşe dönüş hatırlatması", "Kaldığım iş"), (sent.Sent.Last().Title, sent.Sent.Last().Body));
        var special = await TaskScenario.Read<SpecialDayView>(await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/special-days",
            new { title = "İlk gün adı", kind = "Other", month = 10, day = 16, recurrence = "Yearly", reminder = "SameDay" }));
        Assert.Equal(HttpStatusCode.OK, (await s.User.Client.PutAsJsonAsync($"/api/special-days/{special.Id}",
            new { version = special.Version, title = "Annemin doğum günü", kind = "Birthday", month = 10, day = 16, recurrence = "Yearly", reminder = "SameDay" })).StatusCode);
        s.App.Clock.Now = now.AddDays(1); await s.Pump();
        Assert.Equal(("Özel gün hatırlatması", "Annemin doğum günü"), (sent.Sent.Last().Title, sent.Sent.Last().Body));
        Assert.Equal(2, sent.Sent.Count);

        var foreign = await TaskScenario.User(s.App); var foreignTask = await foreign.Root("Başka kişinin özel işi");
        var due = s.App.Clock.Now.AddMinutes(1);
        Assert.Equal(HttpStatusCode.OK, (await foreign.Client.PutAsJsonAsync($"/api/tasks/{foreignTask.Id}",
            new { version = foreignTask.Version, title = foreignTask.Title, deadlineAt = due })).StatusCode);
        await using (var db = s.Database.CreateContext(captureOutbox: true))
        {
            db.NotificationIntents.Add(new() { Id = Guid.CreateVersion7(), UserId = s.User.UserId, Kind = "TaskDeadline", SourceId = foreignTask.Id,
                SourceVersion = 1, SourceKey = $"forged-title:{Guid.NewGuid()}", OccurredAt = due, CreatedAt = s.App.Clock.Now, NotBefore = due });
            await db.SaveChangesAsync();
        }
        s.App.Clock.Now = due; await s.Pump();
        Assert.Equal(2, sent.Sent.Count);
        Assert.DoesNotContain(sent.Sent, x => x.Body == foreignTask.Title);
    }

    private static async Task Snooze(JobScenario s, string kind)
    {
        await using var db = s.Context();
        var id = await db.NotificationIntents.Where(x => x.UserId == s.User.UserId && x.Kind == kind).Select(x => x.Id).SingleAsync();
        var notification = await TaskScenario.Read<NotificationView>(await s.User.Client.GetAsync($"/api/notifications/{id}"));
        Assert.Equal(HttpStatusCode.OK, (await s.User.Client.PostAsJsonAsync($"/api/notifications/{notification.Id}/snooze", new { version = notification.Version, seconds = 300 })).StatusCode);
    }

    private static async Task<(JobScenario, Collector)> Create(NotificationSettings settings)
    {
        var sender = new Collector();
        var s = await JobScenario.Create(services => { services.RemoveAll<IPushTransport>(); services.AddSingleton<IPushTransport>(sender); services.PostConfigure<PushSettings>(PushDeliveryTests.EnableTransport); });
        var saved = await s.User.Client.PutAsJsonAsync("/api/notifications/preferences", new UpdateNotificationPreferences(0, settings));
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await s.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", NotificationTests.Subscription("https://push.example.test/presentation"))).StatusCode);
        return (s, sender);
    }

    private sealed class Collector : IPushTransport
    {
        internal ConcurrentQueue<PushEnvelope> Sent { get; } = new();
        public Task<PushSendResult> SendAsync(PushSubscriptionRecord subscription, PushEnvelope envelope, CancellationToken ct)
        { Sent.Enqueue(envelope); return Task.FromResult(new PushSendResult(201)); }
    }
}

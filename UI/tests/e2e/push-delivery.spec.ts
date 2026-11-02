import { randomUUID } from "node:crypto";
import { expect, test, type Page, type CDPSession } from "@playwright/test";
import { FocusFixture, steady } from "./helpers/focus-fixture";
import type { Notification as InboxNotification } from "../../src/features/notifications/model";
import { writeFileSync } from "node:fs";
import { EVIDENCE } from "./helpers/evidence";
let fx: FocusFixture;
// Tam Chromium yeni headless yerel bildirimleri destekler. Headless shell izin verilse de reddeder.
test.use({ channel: process.env.UI_E2E_EDGE === "1" ? "msedge" : "chromium" });
test.beforeAll(async () => {
  fx = await FocusFixture.create();
});
test.afterAll(async () => {
  await fx?.api.dispose();
});
test.beforeEach(async ({ page, context }) => {
  await fx.clean();
  await fx.login(page);
  await context.grantPermissions(["notifications"]);
});
test.afterEach(async () => {
  await fx.clean();
});
// 15sn teslim şartı başka testin eski toplu işinden bağımsız kalsın.
async function preferencesSettled() {
  const info = test.info();
  info.setTimeout(info.timeout + 60_000);
  await expect
    .poll(
      async () => {
        let count = 0;
        for (const state of ["Pending", "Processing"])
          count += Number((await (await fx.api.get(`/api/jobs/outbox?state=${state}&limit=1`)).json()).total);
        return count;
      },
      { timeout: 60_000 },
    )
    .toBe(0);
}
async function prepare(page: Page) {
  await page.goto("/reminders/preferences");
  await page.getByText("Diğer cihazlar ve uygulama", { exact: true }).click();
  await page.getByRole("button", { name: "Güncellemeyi kontrol et", exact: true }).click();
  await expect(page.getByText("Uygulama güncel.", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function sender(cdp: CDPSession) {
  let registrationId: string | undefined, versionId: string | undefined;
  cdp.on("ServiceWorker.workerRegistrationUpdated", e => {
    for (const r of e.registrations)
      if (!r.isDeleted && r.scopeURL === "http://127.0.0.1:3400/") registrationId = r.registrationId;
  });
  cdp.on("ServiceWorker.workerVersionUpdated", e => {
    for (const v of e.versions)
      if (v.registrationId === registrationId && v.status === "activated") versionId = v.versionId;
  });
  await cdp.send("ServiceWorker.enable");
  await expect.poll(() => !!registrationId).toBe(true);
  return {
    send: (data: object) =>
      cdp.send("ServiceWorker.deliverPushMessage", {
        origin: "http://127.0.0.1:3400",
        registrationId: registrationId!,
        data: JSON.stringify(data),
      }),
    restart: async () => {
      await expect.poll(() => !!versionId).toBe(true);
      await cdp.send("ServiceWorker.stopWorker", { versionId: versionId! });
    },
  };
}
const payload = (owner: string, id: string, snoozeCount = 0) => ({
  notificationId: id,
  recipientUserId: owner,
  snoozeCount,
  tag: `notification:${id}`,
  title: "Navortal",
  body: "Bir hatırlatmanız var.",
  url: `/notifications/${id}`,
  silent: true,
});
async function notices(page: Page) {
  return page.evaluate(async () =>
    (await (await navigator.serviceWorker.ready).getNotifications()).map(n => ({
      tag: n.tag,
      round: n.data?.snoozeCount,
      owner: n.data?.recipientUserId,
      title: n.title,
      body: n.body,
    })),
  );
}

test("native worker receipt survives restart; same notification snooze replaces its tag; foreign/unsafe push is ignored", async ({
  page,
  context,
}, info) => {
  await prepare(page);
  const owner = (await (await fx.api.get("/api/auth/me")).json()).id as string,
    id = randomUUID();
  const cdp = await context.newCDPSession(page),
    push = await sender(cdp);
  // Açık sayfada çalışma alanı alıcısı yok. Gerçek worker'ın showNotification çağrısı deneniyor.
  await page.goto("/");
  const diagnostics = await page.evaluate(async () => {
    const url = "/recipient-store.js";
    const s: typeof import("../../public/recipient-store.js") = await import(url);
    return {
      recipient: await s.getRecipient(),
      permission: Notification.permission,
      controlled: !!navigator.serviceWorker.controller,
    };
  });
  writeFileSync(`${EVIDENCE}/native-worker-${info.project.name}.json`, JSON.stringify(diagnostics));
  expect(diagnostics.recipient).toBe(owner);
  expect(diagnostics.permission).toBe("granted");
  await push.send(payload(owner, id));
  try {
    await expect
      .poll(() => notices(page))
      .toEqual([{ tag: `notification:${id}`, round: 0, owner, title: "Navortal", body: "Bir hatırlatmanız var." }]);
  } catch (error) {
    const worker = context.serviceWorkers()[0];
    const diagnostic =
      worker &&
      (await worker.evaluate(async () => {
        try {
          await (self as unknown as { registration: ServiceWorkerRegistration }).registration.showNotification(
            "Navortal",
            { body: "Bir hatırlatmanız var.", tag: "diagnostic", silent: true },
          );
          return { error: null };
        } catch (e) {
          return { error: e instanceof Error ? { name: e.name, message: e.message } : "unknown" };
        }
      }));
    writeFileSync(`${EVIDENCE}/native-worker-error-${info.project.name}.json`, JSON.stringify(diagnostic));
    throw error;
  }
  await page.evaluate(async () => {
    for (const n of await (await navigator.serviceWorker.ready).getNotifications()) n.close();
  });
  await push.restart();
  await push.send(payload(owner, id));
  expect(await notices(page)).toEqual([]);
  await push.send(payload(owner, id, 1));
  await expect.poll(async () => (await notices(page)).map(n => n.round)).toEqual([1]);
  await push.send({ ...payload(owner, id, 2), url: "https://evil.test" });
  await push.send(payload(randomUUID(), id, 2));
  expect((await notices(page)).map(n => n.round)).toEqual([1]);
  await cdp.detach();
});

test("foreground real Ready push has one native receipt and no extra toast; inbox and missing deep links stay scoped", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    Object.assign(window, { __pushAudioStarts: 0 });
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const oscillator = create.call(this);
      const start = oscillator.start.bind(oscillator);
      oscillator.start = when => {
        start(when);
        (window as unknown as { __pushAudioStarts: number }).__pushAudioStarts++;
      };
      return oscillator;
    };
  });
  await prepare(page);
  // Hiçbir alan ses çalamıyorken hatırlatmayı açıyoruz. Sonraki push önce uygulama sesini denemeli.
  await page.goto("/");
  const owner = (await (await fx.api.get("/api/auth/me")).json()).id as string;
  const cdp = await context.newCDPSession(page),
    push = await sender(cdp);
  const prefs = await (await fx.api.get("/api/notifications/preferences")).json();
  expect(
    (
      await fx.api.put("/api/notifications/preferences", {
        data: {
          version: prefs.version,
          settings: {
            ...prefs.settings,
            enabled: true,
            custom: true,
            soundEnabled: true,
            reminderSound: "glass",
            leadSeconds: 0,
            quietStart: null,
            quietEnd: null,
          },
        },
      })
    ).status(),
  ).toBe(200);
  await preferencesSettled();
  const r = await fx.api.post("/api/notifications/reminders", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { title: "Su içmeyi hatırla", dueAt: new Date(Date.now() + 1800).toISOString() },
  });
  expect(r.status()).toBe(201);
  const source = await r.json();
  let n: InboxNotification | undefined;
  await expect
    .poll(
      async () => {
        n = ((await (await fx.api.get("/api/notifications?limit=100")).json()).items as InboxNotification[]).find(
          item => item.sourceId === source.id,
        );
        return n?.state;
      },
      { timeout: 15000, intervals: [100, 300, 500] },
    )
    .toBe("Ready");
  await page.goto("/tasks");
  expect(n!.sound).toBe("glass");
  const heading = page.getByRole("heading", { name: "Görevler", level: 1 });
  await expect(heading).toBeVisible();
  const baseline = page.waitForResponse(
    r => new URL(r.url()).pathname === "/api/notifications/alerts" && r.status() === 200,
  );
  await heading.click();
  await baseline;
  const audible = {
    ...payload(owner, n!.id),
    title: "Su içmeyi hatırla",
    body: "Hatırlatma",
    silent: false,
    sound: "glass",
  };
  await push.send(audible);
  await expect.poll(async () => (await notices(page)).map(item => item.tag)).toEqual([`notification:${n!.id}`]);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __pushAudioStarts: number }).__pushAudioStarts))
    .toBe(3);
  const native = await page.evaluate(async () =>
    (await (await navigator.serviceWorker.ready).getNotifications()).map(n => ({
      title: n.title,
      body: n.body,
      silent: n.silent,
    })),
  );
  expect(native).toEqual([{ title: "Su içmeyi hatırla", body: "Hatırlatma", silent: true }]);
  await push.send(audible);
  expect((await notices(page)).map(item => item.tag)).toEqual([`notification:${n!.id}`]);
  await expect(page.getByRole("button", { name: "Bildirimi aç", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pushAudioStarts: number }).__pushAudioStarts)).toBe(3);
  await page.goto(`/notifications?notificationId=${n!.id}`);
  await expect(page).toHaveURL(new RegExp(`/reminders\\?notificationId=${n!.id}$`));
  await expect(page.getByRole("dialog", { name: "Bildirim ayrıntısı", exact: true })).toContainText("Hazır · Okunmadı");
  expect(n!.sourceId).toBe(source.id);
  await page.goto(`/notifications?notificationId=${randomUUID()}`);
  await expect(page.getByRole("dialog", { name: "Bildirim ayrıntısı", exact: true })).toContainText(
    "Bildirim bulunamadı veya bu hesaba ait değil.",
  );
  await cdp.detach();
});

test("a real focus target remains inline with a native push receipt and no second foreground toast", async ({
  page,
  context,
}) => {
  await prepare(page);
  const owner = (await (await fx.api.get("/api/auth/me")).json()).id as string;
  const prefs = await (await fx.api.get("/api/notifications/preferences")).json();
  expect(
    (
      await fx.api.put("/api/notifications/preferences", {
        data: {
          version: prefs.version,
          settings: { ...prefs.settings, enabled: true, focusTarget: true, quietStart: null, quietEnd: null },
        },
      })
    ).status(),
  ).toBe(200);
  await preferencesSettled();
  const focus = await fx.start({ ...steady, workSeconds: 3 });
  await page.goto("/focus");
  await expect.poll(async () => (await fx.current())?.effectiveTargetReached).toBe(true);
  await page.getByRole("button", { name: "Odak işlemleri", exact: true }).click();
  await page.getByRole("menuitem", { name: "Güncel odağı kontrol et", exact: true }).click();
  await expect(page.getByRole("region", { name: "Güncel pomodoro", exact: true })).toContainText("Hedefe ulaştın");
  let n: InboxNotification | undefined;
  await expect
    .poll(
      async () => {
        n = ((await (await fx.api.get("/api/notifications?limit=100")).json()).items as InboxNotification[]).find(
          item => item.kind === "FocusTarget" && item.sourceId === focus.id,
        );
        return n?.state;
      },
      { timeout: 15000, intervals: [100, 300, 500] },
    )
    .toBe("Ready");
  const cdp = await context.newCDPSession(page),
    push = await sender(cdp);
  await push.send(payload(owner, n!.id));
  await expect
    .poll(() =>
      page.evaluate(async key => {
        const r = await new Promise<boolean>(resolve => {
          const q = indexedDB.open("adhd-push-recipient-v1");
          q.onsuccess = () => {
            const tx = q.result.transaction("seen");
            const g = tx.objectStore("seen").get(key);
            g.onsuccess = () => resolve(!!g.result);
            tx.oncomplete = () => q.result.close();
          };
        });
        return r;
      }, `${owner}:${n!.id}:0`),
    )
    .toBe(true);
  await expect(page.getByRole("button", { name: "Bildirimi aç", exact: true })).toHaveCount(0);
  await expect.poll(async () => (await notices(page)).map(item => item.tag)).toEqual([`notification:${n!.id}`]);
  expect((await fx.current())?.state).toBe("Working");
  await cdp.detach();
});

test("native push and foreground audio share one sound claim per event and snooze round", async ({ page, context }) => {
  await prepare(page);
  const owner = (await (await fx.api.get("/api/auth/me")).json()).id as string;
  const id = randomUUID();
  expect(
    await page.evaluate(
      async ({ owner, id }) => {
        const moduleUrl = "/alert-sound-store.js";
        const store: typeof import("../../public/alert-sound-store.js") = await import(moduleUrl);
        return store.claimAlertSound(owner, id, 0);
      },
      { owner, id },
    ),
  ).toBe(true);
  const cdp = await context.newCDPSession(page),
    push = await sender(cdp);
  await push.send({ ...payload(owner, id), silent: false });
  const native = () =>
    page.evaluate(async () =>
      (await (await navigator.serviceWorker.ready).getNotifications()).map(n => ({
        round: n.data?.snoozeCount,
        silent: n.silent,
      })),
    );
  await expect.poll(native).toEqual([{ round: 0, silent: true }]);
  await page.goto("/");
  await push.send({ ...payload(owner, id, 1), silent: false });
  await expect.poll(native).toEqual([{ round: 1, silent: false }]);
  expect(
    await page.evaluate(
      async ({ owner, id }) => {
        const moduleUrl = "/alert-sound-store.js";
        const store: typeof import("../../public/alert-sound-store.js") = await import(moduleUrl);
        return store.claimAlertSound(owner, id, 1);
      },
      { owner, id },
    ),
  ).toBe(false);
  await cdp.detach();
});

test("the compatible notification worker update keeps the active work document and session", async ({ page }) => {
  await page.addInitScript(() => Object.assign(window, { __workDocument: crypto.randomUUID() }));
  await prepare(page);
  const focus = await fx.start(steady);
  await page.goto("/focus");
  await expect(page.getByRole("heading", { name: "Pomodoro", exact: true })).toBeVisible();
  const documentId = await page.evaluate(() => (window as unknown as { __workDocument: string }).__workDocument);
  // Güncellenen ana worker isteği Playwright ile yakalanamaz. Aynı kaynaktaki farklı
  // script URL'si kaynak değiştirmeden veya sayfayı yenilemeden gerçek güncelleme yaptırır.
  const scripts = await page.evaluate(async () => {
    const before = navigator.serviceWorker.controller!.scriptURL;
    const changed = new Promise<void>(resolve => {
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
    });
    await navigator.serviceWorker.register("/planner-sw.js?notificationPatch=v3", {
      type: "module",
      scope: "/",
      updateViaCache: "none",
    });
    await changed;
    return { before, after: navigator.serviceWorker.controller!.scriptURL };
  });
  expect(scripts.after).not.toBe(scripts.before);
  expect(new URL(scripts.after).searchParams.get("notificationPatch")).toBe("v3");
  expect(await page.evaluate(() => (window as unknown as { __workDocument: string }).__workDocument)).toBe(documentId);
  expect((await fx.current())?.id).toBe(focus.id);
  expect((await fx.current())?.state).toBe("Working");
  await expect(page).toHaveURL(/\/focus$/);
});

test("R3 native return card closes only its own matching notification and preserves the unread inbox", async ({
  page,
  context,
}, info) => {
  await preferencesSettled();
  const task = await fx.task();
  const owner = (await (await fx.api.get("/api/auth/me")).json()).id as string;
  const foreign = randomUUID(),
    unrelated = randomUUID();
  const settings = await (await fx.api.get("/api/notifications/preferences")).json();
  expect(
    (
      await fx.api.put("/api/notifications/preferences", {
        data: {
          version: settings.version,
          settings: {
            ...settings.settings,
            enabled: true,
            returnToTask: true,
            returnAfterSeconds: 1,
            quietStart: null,
            quietEnd: null,
          },
        },
      })
    ).status(),
  ).toBe(200);
  const started = await fx.api.post("/api/work-sessions/start", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { taskId: task.id },
  });
  expect(started.status()).toBe(201);
  const work = await started.json();
  expect((await fx.api.post(`/api/work-sessions/${work.id}/pause`, { data: { version: work.version } })).status()).toBe(
    200,
  );
  let ready: InboxNotification | undefined;
  await expect
    .poll(
      async () => {
        ready = (await (await fx.api.get("/api/notifications?limit=100")).json()).items.find(
          (n: InboxNotification) => n.kind === "ReturnToTask" && n.sourceId === work.id && n.state === "Ready",
        );
        return !!ready;
      },
      { timeout: 15000 },
    )
    .toBe(true);
  await prepare(page);
  const cdp = await context.newCDPSession(page),
    push = await sender(cdp);
  await context.addInitScript(tag => {
    Object.assign(window, { __r3TagReads: 0 });
    const original = ServiceWorkerRegistration.prototype.getNotifications;
    ServiceWorkerRegistration.prototype.getNotifications = async function (options) {
      const result = await original.call(this, options);
      if (options?.tag === tag) (window as unknown as { __r3TagReads: number }).__r3TagReads++;
      return result;
    };
  }, `notification:${ready!.id}`);
  await page.goto("/");
  const foreignMatching = payload(foreign, ready!.id),
    foreignOther = payload(foreign, unrelated);
  await page.evaluate(
    async values => {
      const registration = await navigator.serviceWorker.ready;
      for (const envelope of values)
        await registration.showNotification(envelope.title, { body: envelope.body, tag: envelope.tag, data: envelope });
    },
    [foreignMatching, foreignOther],
  );
  await expect.poll(async () => (await notices(page)).length).toBe(2);
  await page.goto("/planning");
  const card = page.getByRole("region", { name: "Nerede kalmıştım?", exact: true });
  await expect(card).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __r3TagReads: number }).__r3TagReads))
    .toBeGreaterThan(0);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect((await notices(page)).filter(n => n.owner === foreign)).toHaveLength(2);
  await page.goto("/");
  await push.send(payload(owner, ready!.id, Number(ready!.snoozeCount)));
  await expect
    .poll(async () => (await notices(page)).some(n => n.tag === `notification:${ready!.id}` && n.owner === owner))
    .toBe(true);
  await page.goto("/planning");
  await expect(card).toBeVisible();
  await expect.poll(async () => (await notices(page)).some(n => n.tag === `notification:${ready!.id}`)).toBe(false);
  expect((await notices(page)).map(n => n.tag)).toEqual([`notification:${unrelated}`]);
  const record = await (await fx.api.get(`/api/notifications/${ready!.id}`)).json();
  expect(record.state).toBe("Ready");
  expect(record.readAt).toBeNull();
  writeFileSync(
    `${EVIDENCE}/native-return-card-${info.project.name}.json`,
    JSON.stringify(
      {
        realNativeNotification: true,
        matchingForeignPreserved: true,
        matchingOwnedClosed: true,
        unrelatedForeignPreserved: true,
        inboxUnread: true,
        externalPushProvider: false,
      },
      null,
      2,
    ),
  );
});

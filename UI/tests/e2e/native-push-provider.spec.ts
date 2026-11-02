import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { FocusFixture, steady } from "./helpers/focus-fixture";
import { EVIDENCE } from "./helpers/evidence";

// Yalnız açık UI_REAL_PUSH=1 çalıştırması. Kurulum paylaşılır, her mesajın teslim kapısı ayrıdır ve tekrar gönderilmez.
test.describe.configure({ mode: "default" });
let fx: FocusFixture, context: BrowserContext, page: Page;
test.beforeAll(async () => {
  test.setTimeout(60_000);
  fx = await FocusFixture.create();
  const profile = process.env.UI_REAL_PUSH_PROFILE || mkdtempSync(join(process.cwd(), ".local", "owned-native-push-"));
  const path = relative(resolve(".local"), resolve(profile));
  if (path.startsWith("..") || isAbsolute(path) || !basename(profile).startsWith("owned-native-push-"))
    throw new Error("Only this workspace's owned native test profiles are allowed");
  context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true });
  page = await context.newPage();
  for (const old of context.pages()) if (old !== page) await old.close();
  await fx.login(page);
  await context.grantPermissions(["notifications"]);
  expect((await (await fx.api.get("/api/notifications/push-config")).json()).enabled).toBe(true);
  await page.goto("/reminders/preferences");
  await page.getByRole("button", { name: "Bu cihazda bildirimleri aç", exact: true }).click();
  await expect(
    page.getByText("Push tercihi ve bu tarayıcı aboneliği kaydedildi. Cihaza teslim garantisi değildir.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 20_000 });
  const p = await (await fx.api.get("/api/notifications/preferences")).json();
  expect(p.settings.pushEnabled).toBe(true);
  expect(
    (
      await fx.api.put("/api/notifications/preferences", {
        data: {
          version: p.version,
          settings: {
            ...p.settings,
            enabled: true,
            custom: true,
            focusTarget: true,
            soundEnabled: true,
            quietStart: null,
            quietEnd: null,
          },
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/");
  await page.evaluate(async () => {
    for (const n of await (await navigator.serviceWorker.ready).getNotifications()) n.close();
  });
});

const notices = () =>
  page.evaluate(async () =>
    (await (await navigator.serviceWorker.ready).getNotifications()).map(n => ({
      title: n.title,
      body: n.body,
      silent: n.silent,
      id: n.data?.notificationId,
    })),
  );

test("real Edge provider displays the reminder name", async () => {
  const created = await fx.api.post("/api/notifications/reminders", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { title: "Gerçek sağlayıcı testi", dueAt: new Date(Date.now() + 3000).toISOString() },
  });
  expect(created.status()).toBe(201);
  await expect
    .poll(notices, { timeout: 25_000 })
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Gerçek sağlayıcı testi", body: "Hatırlatma", silent: false }),
      ]),
    );
  writeFileSync(
    `${EVIDENCE}/real-edge-reminder.json`,
    JSON.stringify({
      realExternalProvider: true,
      cdpInjected: false,
      reminderName: true,
      userDatabase: false,
      osAudibility: false,
    }),
  );
});

test("real Edge provider displays the Pomodoro target message", async () => {
  await fx.start({ ...steady, workSeconds: 3, soundEnabled: true });
  await expect
    .poll(
      async () => {
        await fx.current();
        return notices();
      },
      { timeout: 25_000 },
    )
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Pomodoro süresi doldu",
          body: "Molaya geçebilir veya çalışmaya devam edebilirsin.",
          silent: false,
        }),
      ]),
    );
  writeFileSync(
    `${EVIDENCE}/real-edge-focus.json`,
    JSON.stringify({
      realExternalProvider: true,
      cdpInjected: false,
      focusTargetMessage: true,
      userDatabase: false,
      osAudibility: false,
    }),
  );
});

test.afterEach(async ({}, info) => {
  const me = await (await fx.api.get("/api/auth/me")).json();
  const rows = (await (await fx.api.get("/api/notifications?limit=100")).json()).items;
  const outbox = (await (await fx.api.get("/api/jobs/outbox?limit=25")).json()).items;
  const recipient = await page.evaluate(async () => {
    const url = "/recipient-store.js";
    return (await import(url)).getRecipient();
  });
  writeFileSync(
    `${EVIDENCE}/provider-${info.title.includes("Pomodoro") ? "focus" : "reminder"}-diagnostics.json`,
    JSON.stringify({
      recipientMatches: recipient === me.id,
      notices: await notices(),
      notifications: rows.map((n: { kind: string; state: string; soundEnabled: boolean }) => ({
        kind: n.kind,
        state: n.state,
        soundEnabled: n.soundEnabled,
      })),
      jobs: outbox.map((j: { kind: string; state: string; lastErrorCode: string | null }) => ({
        kind: j.kind,
        state: j.state,
        lastErrorCode: j.lastErrorCode,
      })),
    }),
  );
});

test.afterAll(async () => {
  await fx?.clean();
  await fx?.api.dispose();
  await page
    ?.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration("/");
      await (await r?.pushManager.getSubscription())?.unsubscribe();
    })
    .catch(() => {});
  await context?.close();
});

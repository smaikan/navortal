import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { switchAccount } from "./helpers/session";

import type { Notification, Preferences, Settings } from "../../src/features/notifications/model";

import { FocusFixture, steady } from "./helpers/focus-fixture";

import { trackFaults } from "./helpers/faults";

import { auditTask } from "./helpers/task-audit";

import { EVIDENCE } from "./helpers/evidence";

let fx: FocusFixture, foreign: FocusFixture;
const faults = new WeakMap<Page, string[]>();

const dialog = (p: Page) => p.getByRole("dialog", { name: "Bildirim ayrıntısı", exact: true });
const bell = (p: Page) => p.getByRole("button", { name: /^Bildirimler/ });
async function openBell(p: Page) {
  await bell(p).click();
  const panel = p.getByRole("dialog", { name: "Bildirimler", exact: true });
  await expect(panel).toBeVisible();
  return panel;
}

async function settingsPage(page: Page) {
  await page.goto("/reminders/preferences");
  const f = page.locator(".r2-notify-settings");
  await expect(f.getByRole("switch", { name: "Bildirimler açık" })).toBeVisible();
  return f;
}

async function saved(f: ReturnType<Page["locator"]>) {
  await expect(f.getByRole("status").filter({ hasText: "Kaydedildi" })).toBeVisible();
}

async function toggle(f: ReturnType<Page["locator"]>, name: string) {
  const s = f.getByRole("switch", { name, exact: true });
  const before = await s.getAttribute("aria-checked");
  await s.click();
  await expect(s).not.toHaveAttribute("aria-checked", before!);
  await saved(f);
}

async function snapshot() {
  const r = await fx.api.get("/api/notifications/preferences");
  expect(r.status()).toBe(200);
  return (await r.json()) as Preferences;
}

async function configure(patch: Partial<Settings> = {}) {
  const p = await snapshot();
  const r = await fx.api.put("/api/notifications/preferences", {
    data: {
      version: p.version,
      settings: {
        ...p.settings,
        enabled: true,
        soundEnabled: true,
        custom: true,
        focusTarget: true,
        quietStart: null,
        quietEnd: null,
        leadSeconds: 0,
        snoozeSeconds: 300,
        ...patch,
      },
    },
  });
  expect(r.status()).toBe(200);
}

async function all() {
  const r = await fx.api.get("/api/notifications?limit=100");
  expect(r.status()).toBe(200);
  return (await r.json()).items as Notification[];
}

async function get(id: string) {
  const r = await fx.api.get(`/api/notifications/${id}`);
  expect(r.status()).toBe(200);
  return (await r.json()) as Notification;
}

async function internalReminderNotification(sourceId: string): Promise<Notification | undefined> {
  const jobs = (await (await fx.api.get("/api/jobs/outbox?limit=100")).json()).items as {
    kind: string;
    sourceId: string;
  }[];
  for (const job of jobs.filter(j => j.kind === "NotificationReady")) {
    const r = await fx.api.get(`/api/notifications/${job.sourceId}`);
    if (r.status() === 200) {
      const n = (await r.json()) as Notification;
      if (n.sourceId === sourceId && n.state !== "Obsolete") return n;
    }
  }
}

async function reminder(ready = true, taskId?: string) {
  const r = await fx.api.post("/api/notifications/reminders", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      title: `Bildirim ${randomUUID()}`,
      dueAt: new Date(Date.now() + (ready ? 1800 : 3600000)).toISOString(),
      taskId,
    },
  });
  expect(r.status()).toBe(201);
  const source = await r.json();

  let result: Notification | undefined;

  await expect
    .poll(
      async () => {
        result = ready
          ? (await all()).find(n => n.sourceId === source.id)
          : await internalReminderNotification(source.id);
        return ready ? result?.state : !!result;
      },
      { timeout: 15000, intervals: [100, 300, 500] },
    )
    .toBe(ready ? "Ready" : true);

  return result!;
}

async function open(page: Page, id: string) {
  await page.goto(`/notifications?notificationId=${id}`);
  await expect(dialog(page).getByRole("heading", { name: "Bildirim ayrıntısı", exact: true })).toBeVisible();
  await expect(dialog(page).getByRole("button", { name: "Okundu işaretle", exact: true })).toBeVisible();
}

async function close(page: Page) {
  await dialog(page).getByRole("button", { name: "Bildirim ayrıntısı panelini kapat", exact: true }).click();
  await expect(dialog(page)).toBeHidden();
}

test.beforeAll(async () => {
  fx = await FocusFixture.create();
  foreign = await FocusFixture.create();
});

test.afterAll(async () => {
  await fx?.api.dispose();
  await foreign?.api.dispose();
});

test.beforeEach(async ({ page }) => {
  await fx.clean();
  await configure();
  await fx.login(page);
  const messages: string[] = [];
  faults.set(page, messages);
  trackFaults(page, messages);
});

test.afterEach(async ({ page }) => {
  await fx.clean();
  expect(faults.get(page)).toEqual([]);
});

test("inbox hides pending records and marks existing notifications read on opening; source opens the same task", async ({
  page,
}, info) => {
  const task = await fx.task(),
    n = await reminder(true, task.id);
  await reminder(false);

  await page.goto("/planning");
  // Sayı ilk ekran boşta kalınca gelir. Hazır olmayan kayıtlar sayılmaz.
  await expect(bell(page)).toHaveAccessibleName("Bildirimler, 1 okunmamış");
  await expect(page.locator(".bell-count")).toHaveText("1");
  const panel = await openBell(page);
  await expect(panel.getByRole("heading", { name: "Bildirimler", exact: true })).toBeFocused();
  await expect(panel.locator(".r2-inbox .r2-inbox-meta").filter({ hasText: "Bekliyor" })).toHaveCount(0);
  await expect.poll(async () => (await get(n.id)).readAt).not.toBeNull();
  // Panel açılırken okunur; onaylanan okuma vurguyu kaldırır (vurgu yalnız sonradan gelenlerde, bkz. reminder-ux).
  await expect(panel.locator(`[data-notification-id="${n.id}"]`)).not.toHaveClass(/unread/);
  await expect(panel.locator(".bell-panel-count")).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/planning");

  // Panel sayfayı kısmen örter. Denetimi panelin kendi üzerinde yapıyoruz.
  const audit = await new AxeBuilder({ page })
    .include(".bell-panel")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  expect(audit.incomplete).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/notifications-inbox-${info.project.name}.png` });
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(bell(page)).toBeFocused();
  await expect(bell(page)).toHaveAccessibleName("Bildirimler");
  await expect(page.locator(".bell-count")).toHaveCount(0);

  await open(page, n.id);
  expect((await get(n.id)).readAt).not.toBeNull();
  await expect(dialog(page)).toContainText("cihazına teslim edildiği anlamına gelmez");

  await expect(dialog(page).getByRole("button", { name: "Okundu işaretle", exact: true })).toBeDisabled();
  expect((await get(n.id)).readAt).not.toBeNull();

  await auditTask(page, "detail", "notifications");
  await page.screenshot({ path: `${EVIDENCE}/notifications-detail-${info.project.name}.png` });

  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await auditTask(page, "detail-dark", "notifications", "dark");
  await page.screenshot({ path: `${EVIDENCE}/notifications-detail-dark-${info.project.name}.png` });

  await dialog(page)
    .getByRole("link", { name: `Görevi aç: ${task.title}`, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/tasks\\?taskId=${task.id}$`));
  await expect(page.getByLabel("Görev başlığı", { exact: true })).toHaveValue(task.title);
});

test("snooze keeps the same ID with a new count; read ACK survives a held follow-up GET", async ({ page }) => {
  const n = await reminder();
  await open(page, n.id);
  await dialog(page).getByRole("button", { name: "Bildirim işlemleri", exact: true }).click();
  await page.getByRole("menuitem", { name: "Tercihlerdeki süreyle ertele", exact: true }).click();

  await expect(dialog(page).getByRole("status")).toHaveText("Bildirim ertelendi.");
  const after = await get(n.id);
  expect(after.id).toBe(n.id);
  expect(after.snoozeCount).toBe(Number(n.snoozeCount) + 1);
  expect(after.state).toBe("Pending");
  expect(after.readyAt).toBe(n.readyAt);

  let release!: () => void;
  const gate = new Promise<void>(r => {
    release = r;
  });
  let hold = false;

  await page.route(`**/api/notifications/${n.id}`, async route => {
    if (hold) await gate;
    await route.continue();
  });

  await page.route(`**/api/notifications/${n.id}/read`, async route => {
    const response = await route.fetch();
    hold = true;
    await route.fulfill({ response });
  });

  try {
    await dialog(page).getByRole("button", { name: "Okundu işaretle", exact: true }).click();
    await expect(dialog(page).getByRole("status")).toHaveText("Okundu olarak kaydedildi.");
    await expect(
      dialog(page).getByRole("button", { name: "Bildirim ayrıntısı panelini kapat", exact: true }),
    ).toBeEnabled();
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("real stale version 409 preserves intent and requires a GET before an explicit new write", async ({ page }) => {
  const n = await reminder();
  await open(page, n.id);
  let writes = 0;

  await page.route(`**/api/notifications/${n.id}/snooze`, async route => {
    writes++;
    const before = await get(n.id);
    expect((await fx.api.post(`/api/notifications/${n.id}/read`, { data: { version: before.version } })).status()).toBe(
      200,
    );
    await route.continue();
  });

  await dialog(page).getByRole("button", { name: "Bildirim işlemleri", exact: true }).click();
  await page.getByRole("menuitem", { name: "Tercihlerdeki süreyle ertele", exact: true }).click();

  await expect(dialog(page).getByRole("alert")).toContainText("başka bir yerde değişmiş");
  expect(writes).toBe(1);
  expect((await get(n.id)).snoozeCount).toBe(n.snoozeCount);

  await page.unroute(`**/api/notifications/${n.id}/snooze`);
  await dialog(page).getByRole("button", { name: "Güncel bildirimi kontrol et", exact: true }).click();
  await expect(dialog(page).getByRole("status")).toContainText("İşlem kendiliğinden tekrarlanmadı");

  await dialog(page).getByRole("button", { name: "Bildirim işlemleri", exact: true }).click();
  await page.getByRole("menuitem", { name: "Tercihlerdeki süreyle ertele", exact: true }).click();
  await expect(dialog(page).getByRole("status")).toHaveText("Bildirim ertelendi.");
  expect((await get(n.id)).snoozeCount).toBe(Number(n.snoozeCount) + 1);
});

test("lost snooze response is never resent during reconciliation; offline writes never queue", async ({
  page,
  context,
}) => {
  const n = await reminder();
  await open(page, n.id);
  let posts = 0;

  await page.route(`**/api/notifications/${n.id}/snooze`, async route => {
    posts++;
    await route.fetch();
    await route.abort("failed");
  });

  await dialog(page).getByRole("button", { name: "Bildirim işlemleri", exact: true }).click();
  await page.getByRole("menuitem", { name: "Tercihlerdeki süreyle ertele", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("sonucu alınamadı");

  await dialog(page).getByRole("button", { name: "Güncel bildirimi kontrol et", exact: true }).click();
  await expect(dialog(page).getByRole("status")).toContainText("Güncel bildirim okundu");
  expect(posts).toBe(1);
  expect((await get(n.id)).snoozeCount).toBe(Number(n.snoozeCount) + 1);
  await page.unrouteAll({ behavior: "wait" });

  let reads = 0;
  page.on("request", r => {
    if (r.method() === "POST" && new URL(r.url()).pathname === `/api/notifications/${n.id}/read`) reads++;
  });

  await context.setOffline(true);
  await dialog(page).getByRole("button", { name: "Okundu işaretle", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("Bağlantı yok");
  await context.setOffline(false);
  await close(page);
  expect(reads).toBe(0);
  expect((await get(n.id)).readAt).toBeNull();
});

// Tercihler sekmesinde her seçim son sürümle hemen kaydolur.

test("settings embeds notification preferences and device controls and omits special days", async ({ page }, info) => {
  await configure();
  if (info.project.name === "mobile-chromium") await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/reminders/preferences?settings=notifications");
  const settings = page.getByRole("dialog", { name: "Ayarlar", exact: true });
  await expect(settings.getByRole("heading", { name: "Bildirimler ve ses", exact: true })).toBeVisible();
  await expect(settings.getByRole("link", { name: "Bildirim tercihlerini aç", exact: true })).toHaveCount(0);
  await expect(settings.getByRole("button", { name: "Özel günler", exact: true })).toHaveCount(0);
  const f = settings.locator(".r2-notify-settings");
  await toggle(f, "Bildirim sesi");
  expect((await snapshot()).settings.soundEnabled).toBe(false);
  await expect(settings.getByRole("combobox", { name: "Pomodoro sesi", exact: true })).toBeVisible();
  await expect(settings.getByRole("combobox", { name: "Hatırlatma sesi", exact: true })).toBeVisible();
  await expect(settings.getByRole("combobox", { name: "Görev süresi bitimi sesi", exact: true })).toBeVisible();
  await expect(settings.getByRole("heading", { name: "Sakin saatler", exact: true })).toHaveCount(1);
  await expect(settings.getByRole("heading", { name: "Bu cihazda bildirim", exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await auditTask(page, "settings-notifications", "notifications");
  await settings.screenshot({ path: `${EVIDENCE}/settings-notifications-${info.project.name}.png` });
  await settings.getByRole("button", { name: "Ayarlar panelini kapat", exact: true }).click();
  await expect(settings).toHaveCount(0);
  await expect(
    page.locator(".r2-notify-settings").getByRole("switch", { name: "Bildirim sesi", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
});

test("preferences persist types, sound, overnight DND and duration limits without changing push", async ({
  page,
}, info) => {
  const initial = await snapshot();
  const f = await settingsPage(page);

  await toggle(f, "Bildirim sesi");
  await toggle(f, "Planlanan çalışma süresi dolunca");

  await f.getByLabel("Erteleme süresi", { exact: true }).selectOption("1800");
  await saved(f);

  await f.getByLabel("Önceden haber ver", { exact: true }).selectOption("1800");
  await saved(f);

  await f.getByLabel("Başlangıç (sessiz saatler)", { exact: true }).fill("22:00");
  await f.getByLabel("Bitiş (sessiz saatler)", { exact: true }).fill("08:00");
  await f.getByLabel("Bitiş (sessiz saatler)", { exact: true }).blur();

  await expect(f.getByText("ertesi gün")).toBeVisible();

  await expect
    .poll(async () => (await snapshot()).settings)
    .toMatchObject({
      pushEnabled: initial.settings.pushEnabled,
      soundEnabled: false,
      scheduleEnd: false,
      snoozeSeconds: 1800,
      leadSeconds: 1800,
      quietStart: "22:00:00",
      quietEnd: "08:00:00",
    });

  await expect(page.getByText(/saniye/)).toHaveCount(0);

  await auditTask(page, "preferences", "notifications");
  await page.screenshot({ path: `${EVIDENCE}/notifications-preferences-${info.project.name}.png`, fullPage: true });

  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await auditTask(page, "preferences-dark", "notifications", "dark");
  await page.screenshot({
    path: `${EVIDENCE}/notifications-preferences-dark-${info.project.name}.png`,
    fullPage: true,
  });

  await page.reload();
  await expect(page.getByRole("switch", { name: "Bildirim sesi" })).toHaveAttribute("aria-checked", "false");
});

test("preferences reject one-sided DND and preserve a choice through real 409 and three-way rebase", async ({
  page,
}) => {
  const f = await settingsPage(page);

  await f.getByLabel("Başlangıç (sessiz saatler)", { exact: true }).fill("22:00");
  await f.getByLabel("Başlangıç (sessiz saatler)", { exact: true }).blur();
  await expect(f.getByRole("alert")).toContainText("iki saat");

  await f.getByLabel("Başlangıç (sessiz saatler)", { exact: true }).fill("");
  await f.getByLabel("Başlangıç (sessiz saatler)", { exact: true }).blur();
  await configure({ soundEnabled: false, returnAfterSeconds: 120 });

  await f.getByLabel("Erteleme süresi", { exact: true }).selectOption("600");
  await expect(f.getByRole("alert")).toContainText("başka bir yerde değişmiş");
  await expect(f.getByLabel("Erteleme süresi", { exact: true })).toHaveValue("600");

  await f.getByRole("button", { name: "Güncel tercihleri kontrol et", exact: true }).click();
  await f.getByRole("button", { name: "Seçimlerimi güncel kayda uygula", exact: true }).click();

  await saved(f);
  await expect(f.getByRole("switch", { name: "Bildirim sesi" })).toHaveAttribute("aria-checked", "false");

  expect((await snapshot()).settings).toMatchObject({
    soundEnabled: false,
    returnAfterSeconds: 120,
    snoozeSeconds: 600,
  });
});

test("lost preferences ACK blocks replay, explicit GET recovers and pending guards logout", async ({ page }) => {
  const f = await settingsPage(page);
  let puts = 0;
  let release!: () => void;
  const gate = new Promise<void>(r => {
    release = r;
  });
  let sent = false;

  await page.route("**/api/notifications/preferences", async route => {
    if (route.request().method() !== "PUT") return route.continue();
    puts++;
    await route.fetch();
    sent = true;
    await gate;
    await route.abort("failed");
  });

  try {
    await f.getByLabel("Erteleme süresi", { exact: true }).selectOption("900");
    await expect.poll(() => sent).toBe(true);
    expect(
      await page.evaluate(() => window.dispatchEvent(new Event("adhd:before-local-logout", { cancelable: true }))),
    ).toBe(false);
  } finally {
    release();
  }

  await expect(f.getByRole("alert")).toContainText("sonucu alınamadı");
  await expect(f.getByLabel("Erteleme süresi", { exact: true })).toBeDisabled();

  await f.getByRole("button", { name: "Güncel tercihleri kontrol et", exact: true }).click();
  await f.getByRole("button", { name: "Sunucudaki tercihleri kullan", exact: true }).click();

  expect(puts).toBe(1);
  await expect(f.getByLabel("Erteleme süresi", { exact: true })).toHaveValue("900");
});

test("bounded pages show only local counts and owner 404/invalid URL do not leak", async ({ page }) => {
  await Promise.all(Array.from({ length: 26 }, () => reminder(true)));

  await page.goto("/planning");
  await expect(page.locator(".bell-count")).toHaveText("9+");
  await expect(bell(page)).toHaveAccessibleName("Bildirimler, 9'dan fazla okunmamış");
  const panel = await openBell(page);
  await expect(panel.locator(".r2-inbox > li")).toHaveCount(25);
  await panel.getByRole("button", { name: "Daha eski", exact: true }).click();
  await expect(panel.locator(".r2-inbox > li")).not.toHaveCount(0);
  await expect(panel.getByRole("navigation", { name: "Bildirim sayfaları", exact: true })).toContainText("26–");
  // Dışarı basma paneli kapatır ama odağı dışarı taşımaz.
  await page.locator(".workspace-header").click({ position: { x: 2, y: 2 } });
  await expect(panel).toHaveCount(0);

  const r = await foreign.api.post("/api/notifications/reminders", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { title: "Diğer hesap", dueAt: new Date(Date.now() + 1800).toISOString() },
  });
  expect(r.status()).toBe(201);
  // Liste yalnız hazırları gösterir. Diğer hesabın hatırlatması hazır olsun diye bekliyoruz.
  let other: Notification | undefined;
  await expect
    .poll(
      async () => (other = (await (await foreign.api.get("/api/notifications?limit=100")).json()).items[0])?.state,
      { timeout: 15000, intervals: [100, 300, 500] },
    )
    .toBe("Ready");

  await page.goto(`/notifications?notificationId=${other!.id}`);
  await expect(dialog(page).getByRole("alert")).toContainText("bu hesaba ait değil");
  expect(
    (await fx.api.post(`/api/notifications/${other!.id}/read`, { data: { version: other!.version } })).status(),
  ).toBe(404);

  await page.goto("/notifications?notificationId=bad");
  await expect(page.locator("#main").getByRole("alert")).toContainText("bağlantısı geçersiz");
  await expect(dialog(page)).toHaveCount(0);
});

test("account switch removes old private detail and saved preferences before new owner data", async ({ page }) => {
  const n = await reminder();
  await open(page, n.id);
  const bootstrap = page.waitForResponse(r => new URL(r.url()).pathname === "/api/auth/me" && r.status() === 200);

  await switchAccount(page, foreign.token);
  await bootstrap;

  await expect(dialog(page).getByRole("alert")).toContainText("bu hesaba ait değil");
  await expect(dialog(page).getByRole("button", { name: "Okundu işaretle", exact: true })).toHaveCount(0);
  expect((await get(n.id)).readAt).toBeNull();
});

test("two tabs converge on read and snooze without duplicate rows or a second local alert", async ({
  page,
  context,
}) => {
  const n = await reminder();
  await open(page, n.id);
  const second = await context.newPage();
  const secondFaults: string[] = [];
  trackFaults(second, secondFaults);

  try {
    await open(second, n.id);
    await dialog(page).getByRole("button", { name: "Okundu işaretle", exact: true }).click();
    await expect(dialog(second).getByRole("button", { name: "Okundu işaretle", exact: true })).toBeDisabled();

    await dialog(second).getByRole("button", { name: "Bildirim işlemleri", exact: true }).click();
    await second.getByRole("menuitem", { name: "Tercihlerdeki süreyle ertele", exact: true }).click();
    await expect(dialog(page)).toContainText("Bekliyor");

    expect((await get(n.id)).snoozeCount).toBe(1);
    await close(page);
    // Ertelenen kayıt yeniden zamanı gelene kadar panelden çıkar.
    const panel = await openBell(page);
    await expect(panel.getByRole("heading", { name: "Bildirimler", exact: true })).toBeFocused();
    await expect(panel.locator(`[data-notification-id="${n.id}"]`)).toHaveCount(0);
    expect(secondFaults).toEqual([]);
  } finally {
    await second.close();
  }
});

test("server 400 preserves the preference choice and a late old-owner ACK cannot update the new account", async ({
  page,
}) => {
  const f = await settingsPage(page);

  await page.route("**/api/notifications/preferences", route =>
    route.request().method() === "PUT"
      ? route.fulfill({
          status: 400,
          contentType: "application/problem+json",
          body: JSON.stringify({ status: 400, code: "notification_settings_invalid" }),
        })
      : route.continue(),
  );

  await f.getByLabel("Erteleme süresi", { exact: true }).selectOption("600");
  await expect(f.getByRole("alert")).toContainText("kabul etmedi");
  await expect(f.getByLabel("Erteleme süresi", { exact: true })).toHaveValue("600");
  await page.unrouteAll({ behavior: "wait" });

  const before = await (await foreign.api.get("/api/notifications/preferences")).json();
  let release!: () => void;
  const gate = new Promise<void>(r => {
    release = r;
  });
  let sent = false;

  await page.route("**/api/notifications/preferences", async route => {
    if (route.request().method() !== "PUT") return route.continue();
    const response = await route.fetch();
    sent = true;
    await gate;
    await route.fulfill({ response });
  });

  try {
    await f.getByLabel("Erteleme süresi", { exact: true }).selectOption("900");
    await expect.poll(() => sent).toBe(true);
    const bootstrap = page.waitForResponse(r => new URL(r.url()).pathname === "/api/auth/me" && r.status() === 200);

    await switchAccount(page, foreign.token);
    await bootstrap;
    release();

    await expect(page.getByLabel("Erteleme süresi", { exact: true })).toHaveValue(
      String(before.settings.snoozeSeconds),
    );
    await expect(page.getByText("Kaydedildi", { exact: true })).toHaveCount(0);

    expect(await (await foreign.api.get("/api/notifications/preferences")).json()).toEqual(before);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("real focus target and repeated reload create one inbox record; DND holds a due reminder Pending", async ({
  page,
}) => {
  const focus = await fx.start({ ...steady, workSeconds: 1 });
  let target: Notification | undefined;

  await expect
    .poll(
      async () => {
        await fx.current();
        target = (await all()).find(n => n.kind === "FocusTarget" && n.sourceId === focus.id);
        return target?.state;
      },
      { timeout: 15000, intervals: [200, 400, 700] },
    )
    .toBe("Ready");

  await open(page, target!.id);
  await page.reload();
  await expect(dialog(page).getByRole("link", { name: "Güncel odak oturumunu aç", exact: true })).toBeVisible();
  expect((await all()).filter(n => n.kind === "FocusTarget" && n.sourceId === focus.id)).toHaveLength(1);
  await fx.clean();

  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en", { hour: "2-digit", hourCycle: "h23", timeZone: "Europe/Istanbul" }).format(now),
  );
  const hh = (n: number) => `${String((n + 24) % 24).padStart(2, "0")}:00:00`;

  await configure({ quietStart: hh(hour - 1), quietEnd: hh(hour + 1) });
  const n = await reminder(false);

  // Kaynağı gerçekten yakında gelecek yapıyoruz. Rahatsız etme kuralını tarayıcı değil gerçek worker kontrol eder.

  const source = (await (await fx.api.get("/api/notifications/reminders?limit=100")).json()).find(
    (x: { id: string }) => x.id === n.sourceId,
  );

  const r = await fx.api.put(`/api/notifications/reminders/${source.id}`, {
    headers: { "Idempotency-Key": randomUUID() },
    data: { title: source.title, version: source.version, dueAt: new Date(Date.now() + 1500).toISOString() },
  });
  expect(r.status()).toBe(200);

  let due: Notification | undefined;

  await expect
    .poll(
      async () => {
        due = await internalReminderNotification(source.id);
        if (due?.id === n.id) return false;
        if (!due) return false;
        const jobs = (await (await fx.api.get("/api/jobs/outbox?limit=100")).json()).items as {
          sourceId: string;
          kind: string;
          state: string;
          availableAt: string;
          attempts: number;
        }[];
        return jobs.some(
          j =>
            j.sourceId === due!.id &&
            j.kind === "NotificationReady" &&
            j.state === "Pending" &&
            j.attempts === 0 &&
            Date.parse(j.availableAt) > Date.now() + 60000,
        );
      },
      { timeout: 15000, intervals: [200, 500, 1000] },
    )
    .toBe(true);

  expect((await get(due!.id)).state).toBe("Pending");
  expect((await get(due!.id)).readyAt).toBeNull();
  await open(page, due!.id);
  await expect(dialog(page)).toContainText("Bekliyor");
});

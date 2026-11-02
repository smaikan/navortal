import { writeFileSync } from "node:fs";
import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { Temporal } from "temporal-polyfill";
import { expect, test, type Page } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { auditTask } from "./helpers/task-audit";
import { trackFaults } from "./helpers/faults";
import { EVIDENCE } from "./helpers/evidence";
import type { Reminder } from "../../src/features/reminders/model";
import type { Notification } from "../../src/features/notifications/model";

let fx: FocusFixture;
const faults = new WeakMap<Page, string[]>();
const today = () => Temporal.Now.zonedDateTimeISO("Europe/Istanbul").toPlainDate().toString();
const modal = (page: Page) => page.getByRole("dialog", { name: "Hatırlatma ekle", exact: true });
const inbox = async () => (await (await fx.api.get("/api/notifications?limit=100")).json()).items as Notification[];
async function reminders() {
  return (await (await fx.api.get("/api/notifications/reminders?limit=100")).json()) as Reminder[];
}
async function ready(title: string) {
  const r = await fx.api.post("/api/notifications/reminders", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { title, dueAt: new Date(Date.now() + 2500).toISOString() },
  });
  expect(r.status()).toBe(201);
  const source = await r.json();
  let result: Notification | undefined;
  await expect
    .poll(
      async () => {
        result = (await inbox()).find(n => n.sourceId === source.id);
        return result?.state;
      },
      { timeout: 15000 },
    )
    .toBe("Ready");
  return result!;
}
test.beforeEach(async ({ page }) => {
  fx = await FocusFixture.create();
  const p = await (await fx.api.get("/api/notifications/preferences")).json();
  expect(
    (
      await fx.api.put("/api/notifications/preferences", {
        data: { version: p.version, settings: { ...p.settings, soundEnabled: false } },
      })
    ).status(),
  ).toBe(200);
  await fx.login(page);
  const errors: string[] = [];
  faults.set(page, errors);
  trackFaults(page, errors);
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
  await fx.api.dispose();
  expect(faults.get(page)).toEqual([]);
});

test("reminder UX: today is selected, date is separate, 24-hour controls and quick times save an unbound one-off", async ({
  page,
}, info) => {
  await page.goto("/reminders");
  await expect(page.getByRole("heading", { name: "Hatırlatmalar", exact: true })).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("main")).not.toContainText("Bir sonraki adımını zamanında hatırla");
  await page.getByRole("button", { name: "Hatırlatma ekle", exact: true }).click();
  const form = modal(page);
  await expect(form.getByLabel("Tarih", { exact: true })).toHaveValue(today());
  await expect(form.getByRole("checkbox", { name: "Tekrarla", exact: true })).not.toBeChecked();
  await expect(form.getByRole("combobox", { name: "Görev bağla" })).toHaveCount(0);
  await expect(form.getByLabel("Saat", { exact: true })).toHaveValue("00");
  await expect(form.getByLabel("Dakika", { exact: true })).toHaveValue("00");
  const date = await form.getByRole("region", { name: "Hatırlatma tarihi" }).boundingBox();
  const clock = await form.getByRole("region", { name: "Saat seç" }).boundingBox();
  expect(date!.y + date!.height).toBeLessThanOrEqual(clock!.y);
  const title = `Bir kez ${randomUUID().slice(-8)}`;
  await form.getByLabel("Hatırlatma başlığı").fill(title);
  await form.getByLabel("Saat", { exact: true }).selectOption("23");
  await form.getByLabel("Dakika", { exact: true }).selectOption("59");
  await expect(form.getByLabel("Saat", { exact: true })).toHaveValue("23");
  await form.getByRole("button", { name: "15 dk sonra", exact: true }).click();
  await auditTask(page, "one-off", "reminder-ux");
  await page.screenshot({ path: `${EVIDENCE}/reminder-form-${info.project.name}.png`, fullPage: true });
  await form.getByRole("button", { name: "Hatırlatmayı kaydet" }).click();
  await expect(form).toBeHidden();
  const saved = (await reminders()).find(r => r.title === title)!;
  expect(saved.taskId).toBeNull();
  expect(saved.repeat).toBeNull();
  expect(Date.parse(saved.dueAt)).toBeGreaterThan(Date.now() + 13 * 60000);
  await expect(page.getByRole("navigation", { name: "Hatırlatma sayfaları" })).toHaveCount(0);
});

test("reminder UX: repetition is opt-in, requires selected days and survives editing at the same local time", async ({
  page,
}, info) => {
  await page.goto("/reminders");
  await page.getByRole("button", { name: "Hatırlatma ekle", exact: true }).click();
  const form = modal(page),
    title = `Haftalık ${randomUUID().slice(-8)}`;
  await form.getByLabel("Hatırlatma başlığı").fill(title);
  await form.getByLabel("Tarih", { exact: true }).fill("");
  await form.getByRole("checkbox", { name: "Tekrarla", exact: true }).check();
  await expect(form.getByRole("checkbox", { name: "Tekrarla", exact: true })).toBeChecked();
  await form.getByRole("checkbox", { name: "Tekrarla", exact: true }).uncheck();
  await form.getByLabel("Tarih", { exact: true }).fill(Temporal.PlainDate.from(today()).add({ days: 1 }).toString());
  await form.getByLabel("Saat", { exact: true }).selectOption("10");
  await form.getByLabel("Dakika", { exact: true }).selectOption("15");
  await form.getByRole("checkbox", { name: "Tekrarla", exact: true }).check();
  for (const name of ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"])
    await form.getByRole("checkbox", { name, exact: true }).uncheck();
  await form.getByRole("button", { name: "Hatırlatmayı kaydet" }).click();
  await expect(form.getByRole("alert")).toContainText("en az bir gün");
  for (const name of ["Pazartesi", "Çarşamba", "Cuma"]) await form.getByRole("checkbox", { name, exact: true }).check();
  await expect(form.getByRole("alert")).toHaveCount(0);
  await auditTask(page, "weekly", "reminder-ux");
  await page.screenshot({ path: `${EVIDENCE}/reminder-weekly-${info.project.name}.png`, fullPage: true });
  await form.getByRole("button", { name: "Hatırlatmayı kaydet" }).click();
  await expect(form).toBeHidden();
  const saved = (await reminders()).find(r => r.title === title)!;
  expect(saved.repeat?.weekDays).toEqual([1, 3, 5]);
  expect(saved.repeat?.localTime).toBe("10:15:00");
  const local = Temporal.Instant.from(saved.dueAt).toZonedDateTimeISO("Europe/Istanbul");
  expect([1, 3, 5]).toContain(local.dayOfWeek);
  expect(local.hour).toBe(10);
  expect(local.minute).toBe(15);
  await page
    .locator(`[data-reminder-id="${saved.id}"]`)
    .getByRole("button", { name: `${title} hatırlatma işlemleri` })
    .click();
  await page.getByRole("menuitem", { name: "Düzenle", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Hatırlatmayı düzenle", exact: true });
  await expect(edit.getByRole("checkbox", { name: "Tekrarla", exact: true })).toBeChecked();
  await expect(edit.getByLabel("Saat", { exact: true })).toHaveValue("10");
  await edit.getByLabel("Hatırlatma başlığı").fill(`${title} güncel`);
  await edit.getByRole("button", { name: "Hatırlatmayı kaydet" }).click();
  await expect(edit).toBeHidden();
  expect((await reminders()).find(r => r.id === saved.id)?.repeat).toEqual(saved.repeat);
});

test("reminder UX: opening inbox reads all existing messages once, future arrivals remain unread", async ({ page }) => {
  const previous = await Promise.all([ready("İlk hatırlatma"), ready("İkinci hatırlatma")]);
  let reads = 0;
  page.on("request", r => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/notifications/read-all") reads++;
  });
  await page.goto("/planning");
  // Sayı okuması hepsini okuma değildir. Yalnız panel açma okur.
  await expect(page.locator(".bell-count")).toHaveText("2");
  expect(reads).toBe(0);
  await page.getByRole("button", { name: /^Bildirimler/ }).click();
  const panel = page.getByRole("dialog", { name: "Bildirimler", exact: true });
  await expect
    .poll(async () => (await inbox()).filter(n => previous.some(p => p.id === n.id) && n.readAt !== null).length)
    .toBe(2);
  expect(reads).toBe(1);
  const next = await ready("Yeni gelen hatırlatma");
  expect((await inbox()).find(n => n.id === next.id)?.readAt).toBeNull();
  await expect(panel.locator(".r2-inbox")).toContainText("Yeni gelen hatırlatma");
  expect(reads).toBe(1);
});

test("notification markers: confirmed reads survive stale inbox responses and reopening; later arrivals remain new", async ({
  page,
}, info) => {
  const previous = await ready("Okunacak hatırlatma");
  const stale = await (await fx.api.get("/api/notifications?offset=0&limit=25")).json();
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let served = 0,
    writes = 0;
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/notifications/read-all") writes++;
  });
  await page.route("**/api/notifications?*", async route => {
    if (new URL(route.request().url()).searchParams.get("limit") !== "25") return route.continue();
    await gate;
    served++;
    // Makbuzdan sonra gerçek eski görüntüyü döndürüyoruz; geciken GET gibi.
    await route.fulfill({ status: 200, json: stale });
  });
  try {
    await page.goto("/planning");
    await expect(page.locator(".bell-count")).toHaveText("1");
    await page.getByRole("button", { name: /^Bildirimler/ }).click();
    const panel = page.getByRole("dialog", { name: "Bildirimler", exact: true });
    await expect.poll(async () => (await inbox()).find(n => n.id === previous.id)?.readAt).not.toBeNull();
    await expect(page.locator(".bell-count")).toHaveCount(0);
    release();
    await expect(panel.getByRole("button", { name: "Okunacak hatırlatma bildirimini aç", exact: true })).toBeVisible();
    await expect(panel.locator(".bell-panel-count")).toHaveCount(0);
    await expect(panel.locator(".r2-inbox-row.unread")).toHaveCount(0);
    await panel.getByRole("button", { name: "Kapat", exact: true }).click();
    const receipt = page.waitForResponse(
      response =>
        response.request().method() === "POST" && new URL(response.url()).pathname === "/api/notifications/read-all",
    );
    await page.getByRole("button", { name: /^Bildirimler/ }).click();
    await receipt;
    await expect.poll(() => served).toBeGreaterThanOrEqual(2);
    await expect(panel.locator(".bell-panel-count")).toHaveCount(0);
    await expect(panel.locator(".r2-inbox-row.unread")).toHaveCount(0);
    await page.screenshot({ path: `${EVIDENCE}/read-notification-reopened-${info.project.name}.png`, fullPage: true });
    await page.unroute("**/api/notifications?*");
    const next = await ready("Sonradan gelen hatırlatma");
    expect((await inbox()).find(n => n.id === next.id)?.readAt).toBeNull();
    await expect(panel.locator(`[data-notification-id="${next.id}"]`)).toBeVisible();
    await expect(panel.locator(".bell-panel-count")).toHaveText("1 yeni");
    await expect(panel.locator(".r2-inbox-row.unread")).toHaveCount(1);
    await expect(panel.locator(`[data-notification-id="${previous.id}"]`)).not.toHaveClass(/\bunread\b/);
    expect(writes).toBe(2);
  } finally {
    release();
  }
});

test("reminder UX: uncertain read-all is not repeated automatically and can be explicitly reconciled", async ({
  page,
}) => {
  await ready("Okundu kontrolü");
  let writes = 0;
  await page.route("**/api/notifications/read-all", async route => {
    writes++;
    await route.fetch();
    await route.abort("failed");
  });
  await page.goto("/planning");
  await expect(page.locator(".bell-count")).toHaveText("1");
  await page.getByRole("button", { name: /^Bildirimler/ }).click();
  const panel = page.getByRole("dialog", { name: "Bildirimler", exact: true });
  await expect(panel.getByRole("alert")).toContainText("okundu durumu doğrulanamadı");
  expect(writes).toBe(1);
  expect((await inbox())[0].readAt).not.toBeNull();
  await page.unroute("**/api/notifications/read-all");
  await panel.getByRole("button", { name: "Okundu olarak işaretlemeyi tekrar dene" }).click();
  await expect(panel.getByRole("alert")).toHaveCount(0);
});

test("reminder UX: device preferences show a clear single action and keep maintenance controls in details (enabled-state boundary double)", async ({
  page,
}, info) => {
  await page.goto("/reminders/preferences");
  const device = page.getByRole("region", { name: "Bu cihazda bildirim", exact: true });
  await expect(device.getByRole("heading", { name: "Bu cihazda bildirim" })).toBeVisible();
  await expect(device.getByRole("button", { name: "Bu cihazda bildirimleri aç" })).toBeDisabled();
  await expect(device.locator("details")).not.toHaveAttribute("open");
  await expect(device.getByRole("button", { name: "Güncellemeyi kontrol et" })).toBeHidden();
  await expect(device).not.toContainText("Hesabın push tercihi");
  await auditTask(page, "preferences", "reminder-ux");
  await page.screenshot({ path: `${EVIDENCE}/device-preferences-${info.project.name}.png`, fullPage: true });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await auditTask(page, "preferences-dark", "reminder-ux", "dark");
  await page.screenshot({ path: `${EVIDENCE}/device-preferences-dark-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const deviceId = randomUUID();
  // Kontrollü izin sınırı: bu headless bağlam yerel izni reddetmiş kalır.
  await page.addInitScript(() =>
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => "granted" }),
  );
  await page.addInitScript(id => localStorage.setItem("adhd.push-device.v1", id), deviceId);
  const key = createECDH("prime256v1").generateKeys().toString("base64url");
  const registration = await fx.api.post("/api/notifications/subscriptions", {
    data: {
      endpoint: `https://push.example.test/${randomUUID()}`,
      p256dh: key,
      auth: randomBytes(16).toString("base64url"),
      label: `Tarayıcı:${deviceId}`,
    },
  });
  expect(registration.status()).toBe(200);
  const registered = await registration.json();
  const prefs = await (await fx.api.get("/api/notifications/preferences")).json();
  expect(
    (
      await fx.api.put("/api/notifications/preferences", {
        data: { version: prefs.version, settings: { ...prefs.settings, pushEnabled: true } },
      })
    ).status(),
  ).toBe(200);
  await page.route("**/api/notifications/push-config", route =>
    route.fulfill({ json: { enabled: true, publicKey: key } }),
  );
  await page.reload();
  await expect(device.getByRole("heading", { name: "Bu cihazda bildirim" })).toBeVisible();
  const diagnostic = await page.evaluate(
    async id => ({
      permission: "Notification" in window ? Notification.permission : "unsupported",
      storedLabelMatches: localStorage.getItem("adhd.push-device.v1") === id,
      configEnabled: (await (await fetch("/api/notifications/push-config")).json()).enabled,
      widget: document.querySelector(".device-notifications")?.textContent?.slice(0, 1000),
    }),
    deviceId,
  );
  const currentSettings = await (await fx.api.get("/api/notifications/preferences")).json();
  const currentDevices = await (await fx.api.get("/api/notifications/subscriptions")).json();
  writeFileSync(
    `${EVIDENCE}/device-on-state-${info.project.name}.json`,
    JSON.stringify(
      {
        ...diagnostic,
        pushEnabled: currentSettings.settings.pushEnabled,
        activeLabelMatches: currentDevices.some(
          (s: { active: boolean; label: string }) => s.active && s.label === `Tarayıcı:${deviceId}`,
        ),
      },
      null,
      2,
    ),
  );
  await expect(device.getByText("Açık", { exact: true })).toBeVisible();
  await expect(device.getByRole("button", { name: "Bu cihazda bildirimleri kapat" })).toBeEnabled();
  await auditTask(page, "preferences-on", "reminder-ux");
  await page.screenshot({ path: `${EVIDENCE}/device-preferences-on-${info.project.name}.png`, fullPage: true });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await auditTask(page, "preferences-on-dark", "reminder-ux", "dark");
  await device.getByRole("button", { name: "Bu cihazda bildirimleri kapat" }).click();
  await expect(device.getByRole("button", { name: "Bu cihazda bildirimleri aç" })).toBeVisible();
  const subscriptions = await (await fx.api.get("/api/notifications/subscriptions")).json();
  expect(subscriptions.find((s: { id: string }) => s.id === registered.id).active).toBe(false);
  expect((await (await fx.api.get("/api/notifications/preferences")).json()).settings.pushEnabled).toBe(true);
});

test("reminder UX: legacy seconds become the displayed minute only when repetition is enabled", async ({ page }) => {
  const at = Temporal.Now.zonedDateTimeISO("Europe/Istanbul")
    .add({ days: 1 })
    .with({ hour: 10, minute: 20, second: 37, millisecond: 123, microsecond: 456, nanosecond: 0 });
  const created = await fx.api.post("/api/notifications/reminders", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { title: "Eski hassas saat", dueAt: at.toInstant().toString() },
  });
  expect(created.status()).toBe(201);
  const original = await created.json();
  await page.goto("/reminders");
  await page
    .locator(`[data-reminder-id="${original.id}"]`)
    .getByRole("button", { name: "Eski hassas saat hatırlatma işlemleri" })
    .click();
  await page.getByRole("menuitem", { name: "Düzenle", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Hatırlatmayı düzenle", exact: true });
  await form.getByRole("checkbox", { name: "Tekrarla", exact: true }).check();
  await form.getByRole("button", { name: "Hatırlatmayı kaydet" }).click();
  await expect(form).toBeHidden();
  const saved = (await reminders()).find(r => r.id === original.id)!;
  expect(saved.repeat?.localTime).toBe("10:20:00");
  expect(Date.parse(saved.dueAt)).toBe(
    Number(at.with({ second: 0, millisecond: 0, microsecond: 0 }).epochMilliseconds),
  );
});

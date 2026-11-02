import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { Notification, Preferences, Settings } from "../../src/features/notifications/model";
import { FocusFixture, steady } from "./helpers/focus-fixture";
import { signOutFromMenu } from "./helpers/session";
import { trackFaults } from "./helpers/faults";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";

type Probe = { starts: number; closes: number };
declare global {
  interface Window {
    __notificationAudioProbe: Probe;
  }
}

let fx: FocusFixture;
const faults = new WeakMap<Page, string[]>();
const feeds = new WeakMap<Page, Set<string>>();

async function installProbe(context: BrowserContext) {
  await context.addInitScript(() => {
    const probe = (window.__notificationAudioProbe = { starts: 0, closes: 0 });
    // WebKit ilk boş belgede WebAudio sunmayabilir. Kontrol sonraki giriş scriptlerini durdurmasın.
    if (typeof AudioContext === "undefined") return;
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const oscillator = original.call(this);
      const start = oscillator.start.bind(oscillator);
      oscillator.start = when => {
        start(when);
        probe.starts++;
      };
      return oscillator;
    };
    const close = AudioContext.prototype.close;
    AudioContext.prototype.close = function () {
      probe.closes++;
      return close.call(this);
    };
  });
}

function watch(page: Page) {
  const messages: string[] = [];
  faults.set(page, messages);
  trackFaults(page, messages);
  page.on("response", async response => {
    if (new URL(response.url()).pathname !== "/api/notifications/alerts" || response.status() !== 200) return;
    try {
      const body = (await response.json()) as { items: Notification[] };
      feeds.set(page, new Set(body.items.map(n => n.id)));
    } catch {
      // Son GET sırasında belge kapanabilir. trackFaults gerçek çalışma hatalarını yine kaydeder.
    }
  });
}

async function configure(patch: Partial<Settings> = {}) {
  const before = await fx.api.get("/api/notifications/preferences");
  expect(before.status()).toBe(200);
  const p = (await before.json()) as Preferences;
  const saved = await fx.api.put("/api/notifications/preferences", {
    data: {
      version: p.version,
      settings: {
        ...p.settings,
        enabled: true,
        pushEnabled: false,
        soundEnabled: true,
        pomodoroSound: "soft",
        reminderSound: "soft",
        taskEndSound: "soft",
        custom: true,
        focusTarget: true,
        breakEnd: true,
        quietStart: null,
        quietEnd: null,
        leadSeconds: 0,
        ...patch,
      },
    },
  });
  expect(saved.status()).toBe(200);
}

async function all() {
  const response = await fx.api.get("/api/notifications?limit=100");
  expect(response.status()).toBe(200);
  return (await response.json()).items as Notification[];
}

async function ready(sourceId: string, kind: Notification["kind"]) {
  let notification: Notification | undefined;
  await expect
    .poll(
      async () => {
        // Sunucu saatini gerçek odak okumasından izliyoruz. Tarayıcı saatini ilerletme kısayolu yok.
        if (kind === "FocusTarget" || kind === "BreakEnd") await fx.current();
        notification = (await all()).find(n => n.sourceId === sourceId && n.kind === kind);
        return notification?.state;
      },
      { timeout: 15_000, intervals: [150, 300, 500] },
    )
    .toBe("Ready");
  return notification!;
}

async function reminder() {
  const response = await fx.api.post("/api/notifications/reminders", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { title: "Ses denetimi", dueAt: new Date(Date.now() + 1800).toISOString() },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).id as string;
}

const starts = (page: Page) => page.evaluate(() => window.__notificationAudioProbe.starts);
async function saw(page: Page, notification: Notification) {
  await expect.poll(() => feeds.get(page)?.has(notification.id), { timeout: 15_000 }).toBe(true);
}

async function prepare(page: Page) {
  await page.goto("/reminders/preferences");
  const button = page.getByRole("button", { name: "Pomodoro sesini dene", exact: true });
  await expect(button).toBeVisible();
  expect(await starts(page)).toBe(0);
  // Güvenilir tıklama ve gerçek WebAudio osilatörü var, sahte ses motoru değil.
  const initial = page.waitForResponse(
    r => new URL(r.url()).pathname === "/api/notifications/alerts" && r.status() === 200,
  );
  await button.click();
  await initial;
  await expect.poll(() => starts(page)).toBe(2);
  await expect(
    page.getByText("Pomodoro: Yumuşak bip çalındı. Duymadıysan cihazın sesini kontrol et.", { exact: true }),
  ).toBeVisible();
}

test.beforeEach(async ({ page, context }) => {
  fx = await FocusFixture.create();
  await configure();
  await installProbe(context);
  watch(page);
  await fx.login(page);
});

test.afterEach(async ({ page }) => {
  await fx.clean();
  await fx.api.dispose();
  expect(faults.get(page)).toEqual([]);
});

test("real Ready alerts ignore old/read history, then sound once at the focus target and break end", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  const old = await ready(await reminder(), "Custom");
  const read = await ready(await reminder(), "Custom");
  expect((await fx.api.post(`/api/notifications/${read.id}/read`, { data: { version: read.version } })).status()).toBe(
    200,
  );
  await prepare(page);
  await saw(page, old);
  expect(feeds.get(page)?.has(read.id)).toBe(false);
  expect(await starts(page)).toBe(2);

  const focus = await fx.start({ ...steady, workSeconds: 3, shortBreakSeconds: 3, soundEnabled: true });
  const target = await ready(focus.id, "FocusTarget");
  await saw(page, target);
  await expect.poll(() => starts(page), { timeout: 15_000 }).toBe(4);
  const current = await fx.current();
  expect(current?.state).toBe("Working");
  await fx.change(current!, "break");
  const ended = await ready(focus.id, "BreakEnd");
  await saw(page, ended);
  await expect.poll(() => starts(page), { timeout: 15_000 }).toBe(6);
  expect((await fx.current())?.state).toBe("AwaitingNext");
  expect((await all()).find(n => n.id === target.id)?.readAt).toBeNull();
  expect((await all()).find(n => n.id === ended.id)?.readAt).toBeNull();
  await auditTask(page, "sound-preferences", "notification-alerts");
  await page.screenshot({ path: `${EVIDENCE}/notification-alerts-${info.project.name}.png` });
});

test("global and focus silence hold; two unlocked tabs share one reminder sound and logout closes audio", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await configure({ soundEnabled: false });
  await prepare(page);
  const globalSilent = await fx.start({ ...steady, workSeconds: 3, soundEnabled: true });
  await saw(page, await ready(globalSilent.id, "FocusTarget"));
  expect(await starts(page)).toBe(2);
  await fx.clean();
  await configure();
  const focusSilent = await fx.start({ ...steady, workSeconds: 3, soundEnabled: false });
  await saw(page, await ready(focusSilent.id, "FocusTarget"));
  expect(await starts(page)).toBe(2);
  await fx.clean();

  const other = await context.newPage();
  watch(other);
  try {
    await prepare(other);
    const notification = await ready(await reminder(), "Custom");
    await saw(other, notification);
    await expect.poll(async () => (await starts(page)) + (await starts(other)), { timeout: 15_000 }).toBe(6);
    const wasHidden = await page.evaluate(() => document.visibilityState === "hidden");
    await page.bringToFront();
    if (wasHidden) await saw(page, notification);
    expect((await starts(page)) + (await starts(other))).toBe(6);

    await signOutFromMenu(page);
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(other).toHaveURL(/\/login(?:\?|$)/);
    await expect.poll(() => page.evaluate(() => window.__notificationAudioProbe.closes)).toBe(1);
    await expect.poll(() => other.evaluate(() => window.__notificationAudioProbe.closes)).toBe(1);
    expect((await starts(page)) + (await starts(other))).toBe(6);
    expect(faults.get(other)).toEqual([]);
  } finally {
    await other.close();
  }
});

test("an optional alert chunk failing after a gesture keeps the workspace usable and reports local sound status", async ({
  page,
}) => {
  let blocked = 0;
  await page.route("**/_next/static/chunks/*.js", async route => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes("Bildirim sayfası tekrarlandı.")) {
      blocked++;
      await route.abort("failed");
    } else await route.fulfill({ response, body });
  });
  await page.goto("/focus");
  await expect(page.getByRole("heading", { name: "Pomodoro", exact: true })).toBeVisible();
  await page.getByRole("heading", { name: "Pomodoro", exact: true }).click();
  await expect.poll(() => blocked).toBeGreaterThan(0);
  await expect(page.locator(".workspace-shell")).toBeVisible();
  await expect(page.getByText("Bu ekran açılamadı", { exact: false })).toHaveCount(0);
  // Gerçek yan menü gibi gezinirken belge/modül örneğini koruyoruz.
  if ((page.viewportSize()?.width ?? 1280) < 768)
    await page
      .getByRole("navigation", { name: "Mobil gezinme", exact: true })
      .getByRole("button", { name: "Daha fazla", exact: true })
      .click();
  await page.getByRole("link", { name: "Hatırlatmalar", exact: true }).first().click();
  await page
    .getByRole("navigation", { name: "Hatırlatma bölümleri", exact: true })
    .getByRole("link", { name: "Tercihler", exact: true })
    .click();
  await expect(page.getByText(/Sesli hatırlatmalar yüklenemedi/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Pomodoro sesini dene", exact: true })).toBeEnabled();
});

test("the first normal interaction unlocks alerts without a separate sound setup step", async ({ page }, info) => {
  await page.goto("/focus");
  const heading = page.getByRole("heading", { name: "Pomodoro", exact: true });
  await expect(heading).toBeVisible();
  const initial = page.waitForResponse(
    r => new URL(r.url()).pathname === "/api/notifications/alerts" && r.status() === 200,
  );
  if (info.project.name === "mobile-chromium") await heading.tap();
  else await heading.click();
  await initial;
  expect(await starts(page)).toBe(0);
  const focus = await fx.start({ ...steady, workSeconds: 3, soundEnabled: true });
  await saw(page, await ready(focus.id, "FocusTarget"));
  await expect.poll(() => starts(page), { timeout: 15_000 }).toBe(2);
});

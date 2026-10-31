import { randomUUID } from "node:crypto";
import { expect, test, request, type APIRequestContext, type Page } from "@playwright/test";
import { signIn } from "./helpers/session";
import type { Focus, Settings } from "../../src/features/focus/model";
import type { Work } from "../../src/features/work/model";
import { auditTask } from "./helpers/task-audit";
import { trackFaults } from "./helpers/faults";
import { registerFixture } from "./helpers/fixture-account";
import { EVIDENCE } from "./helpers/evidence";
import { outboxDrained, syncConnected } from "./helpers/live-sync";
test.describe.configure({ mode: "default" });
let api: APIRequestContext, foreign: APIRequestContext, token: string;
const faults = new WeakMap<Page, string[]>();
const settings: Settings = {
  workSeconds: 2100,
  shortBreakSeconds: 420,
  longBreakSeconds: 1200,
  longBreakEvery: 3,
  targetBehavior: "ContinueTracking",
  soundEnabled: false,
  notificationsEnabled: true,
};
async function register() {
  const c = await request.newContext({ baseURL: "http://127.0.0.1:5182" });
  const r = await registerFixture(c, "/api/auth/register", {
    data: { email: `focus-${randomUUID()}@example.test`, password: randomUUID() },
  });
  expect(r.status()).toBe(201);
  const value = (await r.json()).accessToken as string;
  await c.dispose();
  return value;
}
const makeClient = (t: string) =>
  request.newContext({ baseURL: "http://127.0.0.1:5182", extraHTTPHeaders: { Authorization: `Bearer ${t}` } });
async function getWork(id: string): Promise<Work> {
  const r = await api.get(`/api/work-sessions/${id}`);
  expect(r.status()).toBe(200);
  return r.json();
}
async function current(): Promise<Focus | null> {
  const r = await api.get("/api/focus-sessions/current");
  expect(r.status()).toBe(200);
  return (await r.json()).session;
}
async function cleanup() {
  const f = await current();
  if (f && !["Finished", "Interrupted"].includes(f.state))
    expect(
      (
        await api.post(`/api/focus-sessions/${f.id}/finish`, {
          headers: { "Idempotency-Key": randomUUID() },
          data: { version: f.version, workSessionVersion: f.workSessionVersion },
        })
      ).status(),
    ).toBe(200);
  for (const state of ["Running", "Paused"]) {
    const items = (await (await api.get(`/api/work-sessions?State=${state}&Limit=100`)).json()).items as Work[];
    for (const w of items)
      expect(
        (
          await api.post(`/api/work-sessions/${w.id}/finish`, { data: { version: (await getWork(w.id)).version } })
        ).status(),
      ).toBe(200);
  }
}
async function task() {
  const r = await api.post("/api/tasks", { data: { title: `Küçük adım ${randomUUID().slice(-8)}` } });
  expect(r.status()).toBe(201);
  const t = await r.json();
  const u = await api.put(`/api/tasks/${t.id}/work-definition`, {
    data: { version: t.version, hasDirectWork: true, directEstimatedSeconds: 5400, targetBudgetSeconds: null },
  });
  expect(u.status()).toBe(200);
  return u.json();
}
async function startWork(taskId: string) {
  const r = await api.post("/api/work-sessions/start", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { taskId },
  });
  expect(r.status()).toBe(201);
  return r.json() as Promise<Work>;
}
const dialog = (p: Page) => p.getByRole("dialog", { name: "Pomodoro başlat", exact: true });
const stage = (p: Page) => p.getByRole("region", { name: "Güncel pomodoro" });
async function open(p: Page) {
  await p.goto("/focus");
  await expect(p.getByRole("button", { name: "25/5", exact: false })).toBeEnabled();
  await p.getByRole("button", { name: "25/5", exact: false }).click();
  await expect(dialog(p)).toBeVisible();
}
async function start(p: Page) {
  await dialog(p).getByRole("button", { name: "Pomodoroyu başlat", exact: true }).click();
  await expect(dialog(p)).toBeHidden();
}
test.beforeAll(async () => {
  token = await register();
  api = await makeClient(token);
  foreign = await makeClient(await register());
});
test.afterAll(async () => {
  await api?.dispose();
  await foreign?.dispose();
});
test.beforeEach(async ({ page }) => {
  await cleanup();
  const list: string[] = [];
  faults.set(page, list);
  trackFaults(page, list);
  await signIn(page, token);
});
test.afterEach(async ({ page }) => {
  await cleanup();
  expect(faults.get(page)).toEqual([]);
});

test("built-ins and custom 35/7 roundtrip; keyboard, long break, policy and accessible responsive composition", async ({
  page,
}, info) => {
  await page.goto("/focus");
  for (const name of ["15/5", "25/5", "45/10"])
    await expect(page.getByRole("button", { name, exact: false })).toBeEnabled();
  const trigger = page.getByRole("button", { name: "Özel ritim" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const f = page.getByRole("dialog", { name: "Özel odak ayarı", exact: true });
  await expect(f.getByLabel("Çalışma süresi", { exact: true })).toHaveValue("35");
  await expect(f.getByLabel("Kısa mola süresi", { exact: true })).toHaveValue("7");
  expect(await f.locator("form").evaluate((el: HTMLFormElement) => el.checkValidity())).toBe(true);
  const name = `35/7 ${randomUUID().slice(-8)}`;
  await f.getByLabel("Ayar adı").fill(name);
  await f.getByLabel("Hedefe ulaşınca").selectOption("AutoBreak");
  await auditTask(page, "preset-form", "focus-start");
  await page.screenshot({ path: `${EVIDENCE}/focus-preset-${info.project.name}.png` });
  await f.getByRole("button", { name: "Ayarı kaydet", exact: true }).click();
  await expect(f.getByRole("status")).toHaveText("Odak ayarı kaydedildi.");
  await f.getByRole("button", { name: "Kapat", exact: true }).click();
  await expect(trigger).toBeFocused();
  await page.reload();
  const preset = (await (await api.get("/api/focus-presets?limit=100")).json()).items.find(
    (p: { name: string }) => p.name === name,
  );
  expect(preset.settings).toEqual({ ...settings, targetBehavior: "AutoBreak" });
  await page.getByRole("button", { name: `${name} ayarını düzenle` }).click();
  const edit = page.getByRole("dialog", { name: "Odak ayarını düzenle", exact: true });
  await edit.getByLabel("Kaç döngüde bir uzun mola?").fill("4");
  await edit.getByRole("button", { name: "Ayarı kaydet", exact: true }).click();
  await expect(edit.getByRole("status")).toBeVisible();
  await edit.getByRole("button", { name: "Kapat", exact: true }).click();
  await auditTask(page, "presets", "focus-start");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("general focus creates no invented task and recovers current/list through reload", async ({ page }, info) => {
  await open(page);
  await start(page);
  const f = (await current())!;
  expect(f.taskId).toBeNull();
  const w = await getWork(f.workSessionId);
  expect(w.taskId).toBeNull();
  await expect(stage(page)).toContainText("Genel odak");
  await page.reload();
  await expect(stage(page)).toContainText("Odaklanılıyor");
  await page.getByRole("button", { name: /^Geçmiş oturumlar/ }).click();
  await expect(page.locator(".focus-history-list > li")).toHaveCount(1);
  await expect(page.locator(".focus-history-list")).toContainText("Genel odak");
  await auditTask(page, "general", "focus-start");
  await page.screenshot({ path: `${EVIDENCE}/focus-general-${info.project.name}.png`, fullPage: true });
});
test("API attachment and displayed running/paused work preserve the same real work record and segments", async ({
  page,
}) => {
  for (const paused of [false, true]) {
    await cleanup();
    const t = await task();
    let w = await startWork(t.id);
    if (paused) {
      const r = await api.post(`/api/work-sessions/${w.id}/pause`, { data: { version: w.version } });
      expect(r.status()).toBe(200);
      w = await r.json();
    }
    const attach = await api.post("/api/focus-sessions", {
      headers: { "Idempotency-Key": randomUUID() },
      data: { settings, workSessionId: w.id, workSessionVersion: w.version },
    });
    expect(attach.status()).toBe(201);
    await page.goto("/focus");
    await expect(stage(page).getByRole("timer")).toBeVisible();
    const f = (await current())!;
    expect(f.workSessionId).toBe(w.id);
    expect(f.taskId).toBe(t.id);
    expect((await getWork(w.id)).state).toBe("Running");
    const works = (await (await api.get("/api/work-sessions?Limit=100")).json()).items as Work[];
    expect(works.filter(w => w.taskId === t.id)).toHaveLength(1);
    const segments = (await (await api.get(`/api/work-sessions/${w.id}/segments?Limit=100`)).json()).items;
    expect(segments.filter((s: { endedAt: string | null }) => s.endedAt === null)).toHaveLength(1);
  }
});
test("task start refusal preserves paused work without duplicate actual or a hidden attachment mode", async ({
  page,
}) => {
  const t = await task(),
    w = await startWork(t.id);
  expect((await api.post(`/api/work-sessions/${w.id}/pause`, { data: { version: w.version } })).status()).toBe(200);
  await open(page);
  const f = dialog(page);
  await f.getByLabel("Başlatma türü").selectOption("task");
  await f.getByRole("radio", { name: t.title, exact: true }).check();
  await f.getByRole("button", { name: "Pomodoroyu başlat", exact: true }).click();
  await expect(f.getByRole("alert")).toContainText("duraklatılmış");
  expect(await current()).toBeNull();
  expect((await getWork(w.id)).state).toBe("Paused");
  const works = (await (await api.get("/api/work-sessions?Limit=100")).json()).items as Work[];
  expect(works.filter(item => item.taskId === t.id)).toHaveLength(1);
});
test("API planned focus starts planned work then attaches to its immutable revision link", async ({ page }) => {
  const t = await task();
  const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const d = await (await api.get(`/api/daily-plans/${date}`)).json();
  const r = await api.post("/api/schedules", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      localDate: date,
      taskId: t.id,
      kind: "Work",
      startsAt: `${date}T06:00:00Z`,
      endsAt: `${date}T07:00:00Z`,
      expectedPlanningVersion: d.planningVersion,
    },
  });
  expect(r.status()).toBe(201);
  const block = (await r.json()).schedules.find((b: { taskId: string }) => b.taskId === t.id);
  const work = await api.post("/api/work-sessions/start", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { taskId: t.id, scheduleId: block.id, scheduleVersion: block.version },
  });
  expect(work.status()).toBe(201);
  const currentWork = await work.json();
  expect(
    (
      await api.post("/api/focus-sessions", {
        headers: { "Idempotency-Key": randomUUID() },
        data: { settings, workSessionId: currentWork.id, workSessionVersion: currentWork.version },
      })
    ).status(),
  ).toBe(201);
  await page.goto("/focus");
  await expect(stage(page).getByRole("timer")).toBeVisible();
  const f = (await current())!,
    w = await getWork(f.workSessionId);
  expect(w.startedScheduleId).toBe(block.id);
  expect(w.startedRevisionItemId).toBeTruthy();
  expect(f.taskId).toBe(t.id);
  expect((await (await api.get(`/api/tasks/${t.id}`)).json()).state).not.toBe("Completed");
});
test("direct task focus keeps task estimate separate; concurrent active start is rejected and current recovers", async ({
  page,
}) => {
  const t = await task();
  await open(page);
  const f = dialog(page);
  await f.getByLabel("Başlatma türü").selectOption("task");
  await f.getByRole("radio", { name: t.title, exact: true }).check();
  await start(page);
  const first = (await current())!;
  expect(first.taskId).toBe(t.id);
  expect(first.settings.workSeconds).toBe(1500);
  expect((await (await api.get(`/api/tasks/${t.id}`)).json()).directEstimatedSeconds).toBe(5400);
  await cleanup();
  await open(page);
  const r = await api.post("/api/focus-sessions", { headers: { "Idempotency-Key": randomUUID() }, data: { settings } });
  expect(r.status()).toBe(201);
  const other = await r.json();
  await f.getByRole("button", { name: "Pomodoroyu başlat", exact: true }).click();
  await expect(f.getByRole("alert")).toContainText("açık bir odak");
  expect((await current())!.id).toBe(other.id);
  await expect(stage(page)).toContainText("Genel odak");
});
test("lost keyed start replays exact key and payload once; ACK remains visible while current GET waits", async ({
  page,
}) => {
  await open(page);
  let lose = true;
  const keys: string[] = [],
    bodies: string[] = [];
  let hold = false;
  let release!: () => void;
  const gate = new Promise<void>(r => {
    release = r;
  });
  await page.route("**/api/focus-sessions", async route => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    bodies.push(route.request().postData()!);
    if (lose) {
      lose = false;
      await route.fetch();
      await route.abort("failed");
    } else {
      hold = true;
      await route.continue();
    }
  });
  await page.route("**/api/focus-sessions/current", async route => {
    if (hold) await gate;
    await route.continue();
  });
  try {
    await dialog(page).getByRole("button", { name: "Pomodoroyu başlat", exact: true }).click();
    await expect(dialog(page).getByRole("alert")).toContainText("sonucu alınamadı");
    await expect(dialog(page).getByRole("button", { name: "Pomodoroyu başlat", exact: true })).toBeDisabled();
    await dialog(page).getByRole("button", { name: "Aynı odak başlatmayı güvenle yeniden dene" }).click();
    await expect(dialog(page)).toBeHidden();
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(1);
    expect(new Set(bodies).size).toBe(1);
  } finally {
    release();
  }
  await expect(dialog(page)).toBeHidden();
  expect((await current())!.taskId).toBeNull();
});
test("preset 400/stale 409 and keyless unknown keep draft; never automatically replay", async ({ page }) => {
  await page.goto("/focus");
  await page.getByRole("button", { name: "Özel ritim" }).click();
  let n = 0;
  await page.route("**/api/focus-presets", async route => {
    if (route.request().method() !== "POST") return route.continue();
    n++;
    if (n === 1)
      return route.fulfill({
        status: 400,
        contentType: "application/problem+json",
        body: JSON.stringify({ code: "focus_settings_invalid" }),
      });
    await route.fetch();
    await route.abort("failed");
  });
  const f = page.getByRole("dialog", { name: "Özel odak ayarı", exact: true });
  await f.getByRole("button", { name: "Ayarı kaydet", exact: true }).click();
  await expect(f.getByRole("alert")).toContainText("Süreleri kontrol et");
  await expect(f.getByLabel("Çalışma süresi", { exact: true })).toHaveValue("35");
  await f.getByRole("button", { name: "Ayarı kaydet", exact: true }).click();
  await expect(f.getByRole("alert")).toContainText("sonucu alınamadı");
  await expect(f.getByRole("button", { name: "Ayarı kaydet", exact: true })).toBeDisabled();
  expect(n).toBe(2);
  page.once("dialog", d => d.accept());
  await f.getByRole("button", { name: "Kapat", exact: true }).click();
  await page.unroute("**/api/focus-presets");
  const r = await api.post("/api/focus-presets", { data: { name: `Eski ${randomUUID().slice(-8)}`, settings } });
  expect(r.status()).toBe(201);
  const p = await r.json();
  await page.reload();
  await page.getByRole("button", { name: `${p.name} ayarını düzenle` }).click();
  expect(
    (
      await api.put(`/api/focus-presets/${p.id}`, {
        data: { version: p.version, name: p.name, settings: { ...settings, longBreakEvery: 4 } },
      })
    ).status(),
  ).toBe(200);
  const edit = page.getByRole("dialog", { name: "Odak ayarını düzenle", exact: true });
  await edit.getByLabel("Ayar adı").fill("Eski taslak");
  await edit.getByRole("button", { name: "Ayarı kaydet", exact: true }).click();
  await expect(edit.getByRole("alert")).toContainText("başka bir sekmede");
  await expect(edit.getByLabel("Ayar adı")).toHaveValue("Eski taslak");
  await expect(edit.getByRole("button", { name: "Ayarı kaydet", exact: true })).toBeDisabled();
});
test("owner isolation and malformed current fail closed; offline start is not queued", async ({ page, context }) => {
  const r = await foreign.post("/api/focus-sessions", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { settings },
  });
  expect(r.status()).toBe(201);
  const other = await r.json();
  expect((await api.get(`/api/focus-sessions/${other.id}`)).status()).toBe(404);
  // Gerçek güncel odağa yalnız kullanıcının okuması ulaşmalı. Eski test temizlik olayları
  // sayfa bağlanmadan bitmeli; bağlantı yenilemesi de bozuk yanıt yoluna gitmeli.
  await outboxDrained(api);
  await page.route("**/api/focus-sessions/current", route =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ session: { id: other.id }, serverNow: new Date().toISOString() }),
    }),
  );
  await page.goto("/focus");
  await syncConnected(page);
  await expect(stage(page).getByRole("alert")).toContainText("eksik veya geçersiz");
  await expect(page.getByRole("button", { name: "25/5", exact: false })).toBeDisabled();
  await page.unroute("**/api/focus-sessions/current");
  // Sonraki başarılı okuma hata sahnesini kapatır. Kullanıcının okuması ancak henüz başarı yoksa gerekir.
  const reread = page.getByRole("button", { name: "Güncel odağı yeniden oku" });
  if (await reread.isVisible()) await reread.click({ timeout: 3000 }).catch(() => undefined);
  await expect(stage(page)).toHaveCount(0);
  await page.getByRole("button", { name: "25/5", exact: false }).click();
  let posts = 0;
  page.on("request", r => {
    if (r.method() === "POST" && r.url().endsWith("/api/focus-sessions")) posts++;
  });
  // Çevrimdışı yazıyı, ayrıca test edilen form modülü yükleme hatasından ayırıyoruz.
  await expect(dialog(page).getByRole("button", { name: "Pomodoroyu başlat", exact: true })).toBeEnabled();
  await context.setOffline(true);
  await dialog(page).getByRole("button", { name: "Pomodoroyu başlat", exact: true }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("Bağlantı yok");
  expect(posts).toBe(0);
  await context.setOffline(false);
  expect(await current()).toBeNull();
  expect(posts).toBe(0);
});

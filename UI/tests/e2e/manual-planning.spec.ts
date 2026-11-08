import { randomUUID } from "node:crypto";
import { expect, test, request, type APIRequestContext, type Page } from "@playwright/test";
import { signIn } from "./helpers/session";
import type { Task } from "../../src/features/tasks/model";
import type { Day, DayItem, Result, Schedule } from "../../src/features/planning/model";
import { auditTask } from "./helpers/task-audit";
import { registerFixture } from "./helpers/fixture-account";
import { trackFaults } from "./helpers/faults";
import { EVIDENCE } from "./helpers/evidence";
test.describe.configure({ mode: "default" });
// Gün listesinde saatliler sırada, saatsizler altta. Kutu yalnız bu günün öğesini bitirir.
let api: APIRequestContext;
let token: string;
let foreign: APIRequestContext;
const faults = new WeakMap<Page, string[]>();
const future = (n: number) => new Date(Date.now() + n * 86400000 + 10800000).toISOString().slice(0, 10);
const utc = (d: string, t: string) => new Date(`${d}T${t}+03:00`).toISOString();
const tag = () => randomUUID().slice(0, 7);
async function register() {
  const c = await request.newContext({ baseURL: "http://127.0.0.1:5182" });
  const r = await registerFixture(c, "/api/auth/register", {
    data: { email: `plan-${randomUUID()}@example.test`, password: randomUUID() },
  });
  expect(r.status()).toBe(201);
  const t = (await r.json()).accessToken as string;
  await c.dispose();
  return t;
}
const client = (t: string) =>
  request.newContext({ baseURL: "http://127.0.0.1:5182", extraHTTPHeaders: { Authorization: `Bearer ${t}` } });
const day = async (d: string, c = api): Promise<Day> => (await c.get(`/api/daily-plans/${d}`)).json();
async function task(title: string, c = api, estimate: number | null = 1500): Promise<Task> {
  const r = await c.post("/api/tasks", { data: { title: `${title} ${tag()}` } });
  expect(r.status()).toBe(201);
  const t = await r.json();
  const u = await c.put(`/api/tasks/${t.id}/work-definition`, {
    data: { version: t.version, hasDirectWork: true, directEstimatedSeconds: estimate, targetBudgetSeconds: null },
  });
  expect(u.status()).toBe(200);
  return u.json();
}
async function child(parent: Task, title: string): Promise<Task> {
  const p = await (await api.get(`/api/tasks/${parent.id}`)).json();
  const r = await api.post(`/api/tasks/${parent.id}/children`, {
    data: { title: `${title} ${tag()}`, parentVersion: p.version, parentWorkDisposition: "ConvertToContainer" },
  });
  expect(r.status()).toBe(201);
  return r.json();
}
async function assign(t: Task, d: string) {
  const current = await (await api.get(`/api/tasks/${t.id}`)).json();
  expect(
    (
      await api.put(`/api/tasks/${t.id}/planned-range`, {
        data: { version: current.version, plannedFrom: d, plannedTo: d },
      })
    ).status(),
  ).toBe(200);
}
async function block(d: string, start: string, end: string, taskId: string): Promise<Schedule[]> {
  const v = await day(d);
  const r = await api.post("/api/schedules", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      localDate: d,
      taskId,
      kind: "Work",
      startsAt: utc(d, start),
      endsAt:
        start < end
          ? utc(d, end)
          : utc(new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10), end),
      expectedPlanningVersion: v.planningVersion,
      allowConflicts: true,
    },
  });
  expect(r.status()).toBe(201);
  return ((await r.json()) as Result).schedules;
}
async function item(d: string, taskId: string): Promise<DayItem> {
  const r = await api.post(`/api/daily-plans/${d}/items`, { data: { taskId } });
  expect(r.status()).toBe(201);
  return r.json();
}
const items = async (d: string): Promise<DayItem[]> =>
  (await (await api.get(`/api/daily-plans/${d}/items`)).json()).items;
const schedules = async (d: string): Promise<Schedule[]> =>
  (
    await (
      await api.get(
        `/api/schedules?from=${encodeURIComponent(utc(d, "00:00"))}&to=${encodeURIComponent(new Date(Date.parse(utc(d, "00:00")) + 86400000).toISOString())}&limit=100`,
      )
    ).json()
  ).items;
const row = (page: Page, title: string) => page.locator(".r2-plan-row").filter({ hasText: title });
const untimed = (page: Page) => page.getByRole("list", { name: "Saati belirlenmemiş" });
const timed = (page: Page) => page.getByRole("list", { name: "Saatli plan öğeleri" });
const combo = (page: Page) => page.getByRole("combobox", { name: "Görev ekle" });
async function openDay(page: Page, d: string) {
  await page.goto(`/planning?date=${d}`);
  await expect(page.getByLabel("Plan günü", { exact: true })).toHaveValue(d);
  await expect(page.getByRole("status").filter({ hasText: "Gün planı okunuyor" })).toHaveCount(0);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
}
test.beforeAll(async () => {
  token = await register();
  api = await client(token);
  foreign = await client(await register());
});
test.afterAll(async () => {
  await api?.dispose();
  await foreign?.dispose();
});
test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  faults.set(page, list);
  trackFaults(page, list);
  await signIn(page, token);
});
test.afterEach(async ({ page }) => {
  expect(faults.get(page)).toEqual([]);
});

test(
  "an empty day offers its assigned tasks; suggestions expand a container to subtasks and a missing task is created and added untimed",
  { tag: "@smoke" },
  async ({ page }, info) => {
    const d = future(40);
    const lone = await task("Atanmış iş");
    await assign(lone, d);
    const parent = await task("Ana proje");
    const step = await child(parent, "İlk alt adım");
    await assign(step, d);
    await openDay(page, d);
    await expect(page.getByText("Bu gün için henüz plan yok")).toBeVisible();
    const assigned = page.getByRole("region", { name: "Bu güne atanmış görevler" });
    await expect(assigned).toContainText(lone.title);
    await expect(assigned).toContainText(`${parent.title} › ${step.title}`);
    await expect(assigned.getByRole("button", { name: `Plana ekle: ${parent.title}` })).toHaveCount(0);
    await auditTask(page, "today-empty", "planning");
    await page.screenshot({ path: `${EVIDENCE}/today-empty-${info.project.name}.png`, fullPage: true });
    await assigned.getByRole("button", { name: `Plana ekle: ${lone.title}` }).click();
    await expect(untimed(page)).toContainText(lone.title);
    await expect(page.getByText("Bu gün için henüz plan yok")).toHaveCount(0);
    // Kapsayıcı görev sunulmaz. Açık alt görevi, kapsayıcı adı altında sunulur.
    await combo(page).fill(parent.title.slice(0, 20));
    const list = page.getByRole("listbox", { name: "Görev önerileri" });
    await expect(list.getByRole("option").filter({ hasText: step.title })).toContainText(`${parent.title} › `);
    await expect(list.getByRole("option", { name: parent.title, exact: true })).toHaveCount(0);
    await combo(page).fill(step.title);
    await expect(list.getByRole("option").filter({ hasText: step.title }).first()).toBeVisible();
    await auditTask(page, "today-suggestions", "planning");
    await combo(page).press("Enter");
    await expect(untimed(page)).toContainText(step.title);
    await expect(combo(page)).toHaveValue("");
    await expect(combo(page)).toBeFocused();
    const fresh = `Yeni plan işi ${tag()}`;
    await combo(page).fill(fresh);
    await list.getByRole("option", { name: `“${fresh}” görevini oluştur ve plana ekle` }).click();
    await expect(untimed(page)).toContainText(fresh);
    expect((await items(d)).map(x => x.taskTitle)).toEqual([lone.title, step.title, fresh]);
    // Planlanmış görev yeniden önerilmez.
    await combo(page).fill(lone.title);
    await expect(page.getByText("Bu görev bu günün planında zaten var.", { exact: true })).toBeVisible();
    await expect(list.getByRole("option").filter({ hasText: lone.title })).toHaveCount(0);
    await combo(page).fill("");
  },
);

test("the box finishes only the day's item, timed or untimed; the task stays open and the summary counts it", async ({
  page,
}, info) => {
  const d = future(41);
  const a = await task("Saatli iş");
  const b = await task("Saatsiz iş");
  const [planned] = await block(d, "10:00", "11:00", a.id);
  await item(d, b.id);
  await openDay(page, d);
  await expect(timed(page)).toContainText(a.title);
  await expect(timed(page)).toContainText("10:00");
  await expect(untimed(page)).toContainText(b.title);
  // Plan öğesi/biten sayısı yerine sunucu gün özeti çubuğu var.
  await expect(page.getByRole("region", { name: "Günün zamanı" })).toContainText("Planın kalanı");
  await expect(page.getByRole("button", { name: "Mola veya geçiş ekle" })).toHaveCount(0);
  await expect(page.getByText("Plan bilgisi")).toHaveCount(0);
  await expect(page.getByText(/Europe\/Istanbul|saat dilimi/i)).toHaveCount(0);
  await row(page, a.title)
    .getByRole("checkbox", { name: `${a.title} plan öğesi bitti` })
    .check();
  await expect(row(page, a.title)).toHaveClass(/done/);
  await expect.poll(async () => (await schedules(d)).find(s => s.id === planned.id)?.completedAt).not.toBeNull();
  await row(page, b.title).getByRole("checkbox").check();
  await expect.poll(async () => (await items(d))[0].completedAt).not.toBeNull();
  await expect(row(page, b.title)).toHaveClass(/done/);
  for (const t of [a, b]) expect((await (await api.get(`/api/tasks/${t.id}`)).json()).state).toBe("Pending");
  await auditTask(page, "today-done", "planning");
  await page.screenshot({ path: `${EVIDENCE}/today-list-${info.project.name}.png`, fullPage: true });
  await row(page, b.title).getByRole("checkbox").uncheck();
  await expect.poll(async () => (await items(d))[0].completedAt).toBeNull();
});

test("pressing a row edits its time in place; an untimed item becomes timed, an overlap is accepted and a midnight crossing is spelled out", async ({
  page,
}) => {
  const d = future(42);
  const a = await task("Sabah işi");
  const b = await task("Taşınacak iş");
  const c = await task("Gece işi");
  await block(d, "10:00", "11:00", a.id);
  await item(d, b.id);
  await item(d, c.id);
  await openDay(page, d);
  await row(page, b.title)
    .getByRole("button", { name: /saati belirlenmemiş\. Saati düzenle$/ })
    .click();
  const editor = row(page, b.title).getByRole("form", { name: "Saat aralığı" });
  await expect(editor.getByLabel("Başlangıç saati")).toBeFocused();
  await expect(editor).toContainText("Tahmini süre 25 dk");
  await editor.getByLabel("Başlangıç saati").fill("10:30");
  await editor.getByLabel("Bitiş saati").fill("11:30");
  await editor.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("status").filter({ hasText: "çakışıyor" })).toBeVisible();
  await expect(timed(page)).toContainText(b.title);
  await expect(untimed(page)).not.toContainText(b.title);
  expect((await items(d)).map(x => x.taskId)).toEqual([c.id]);
  await row(page, c.title)
    .getByRole("button", { name: /Saati düzenle$/ })
    .click();
  const night = row(page, c.title).getByRole("form", { name: "Saat aralığı" });
  await night.getByLabel("Başlangıç saati").fill("23:30");
  await night.getByLabel("Bitiş saati").fill("00:30");
  await expect(night).toContainText("ertesi gün");
  await night.getByLabel("Başlangıç saati").press("Escape");
  await expect(night).toHaveCount(0);
  await row(page, c.title)
    .getByRole("button", { name: /Saati düzenle$/ })
    .click();
  await row(page, c.title).getByLabel("Başlangıç saati").fill("23:30");
  await row(page, c.title).getByLabel("Bitiş saati").fill("00:30");
  await row(page, c.title).getByRole("button", { name: "Kaydet" }).click();
  await expect(timed(page)).toContainText(c.title);
  const parts = (await schedules(d)).filter(s => s.taskId === c.id);
  expect(parts).toHaveLength(1);
  expect(parts[0].splitGroupId).not.toBeNull();
  // Saatli öğenin günü korunur. Gece yarısını geçirme açık açıklamayla reddedilir, yarım kayıt yok.
  await row(page, a.title)
    .getByRole("button", { name: /Saati düzenle$/ })
    .click();
  await row(page, a.title).getByLabel("Bitiş saati").fill("01:00");
  await row(page, a.title).getByRole("button", { name: "Kaydet" }).click();
  await expect(row(page, a.title).getByRole("alert")).toContainText("gece yarısını geçecek");
  expect(Date.parse((await schedules(d)).find(s => s.taskId === a.id)!.endsAt)).toBe(Date.parse(utc(d, "11:00")));
  await row(page, a.title).getByLabel("Bitiş saati").fill("12:15");
  await row(page, a.title).getByRole("button", { name: "Kaydet" }).click();
  await expect(row(page, a.title)).toContainText("12:15");
  await auditTask(page, "today-time", "planning");
});

test("the row menu moves an untimed item to another day, removes with undo and opens the task", async ({ page }) => {
  const d = future(43);
  const next = future(44);
  const a = await task("Yarına kalan");
  const b = await task("Kaldırılan");
  const t = await task("Saatli kaldırılan");
  await item(d, a.id);
  await item(d, b.id);
  await block(d, "09:00", "09:30", t.id);
  await openDay(page, d);
  await row(page, a.title)
    .getByRole("button", { name: /Saati düzenle$/ })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Başka güne taşı" }).click();
  const dialog = page.getByRole("dialog", { name: "Başka güne taşı" });
  await dialog.getByLabel("Hedef gün").fill(next);
  await dialog.getByRole("button", { name: "Taşı", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(untimed(page)).not.toContainText(a.title);
  expect((await items(next)).map(x => x.taskId)).toEqual([a.id]);
  await page.getByRole("button", { name: `${b.title} plan öğesi menüsü` }).click();
  await page.getByRole("menuitem", { name: "Plandan kaldır" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Plandan kaldırıldı: ${b.title}` })).toBeVisible();
  await expect(row(page, b.title)).toHaveCount(0);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect(untimed(page)).toContainText(b.title);
  await row(page, t.title)
    .getByRole("button", { name: /Saati düzenle$/ })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Plandan kaldır" }).click();
  await expect(row(page, t.title)).toHaveCount(0);
  expect((await schedules(d)).filter(s => s.taskId === t.id && s.state === "Planned")).toHaveLength(0);
  await page.getByRole("button", { name: `${b.title} plan öğesi menüsü` }).click();
  await page.getByRole("menuitem", { name: "Görev ayrıntısı" }).click();
  await expect(page.getByLabel("Görev başlığı", { exact: true })).toHaveValue(b.title);
});

test("?date opens that day, arrows keep the URL in step and the plan menu holds the planning tools", async ({
  page,
}, info) => {
  const d = future(45);
  await openDay(page, d);
  // Dokunmada 44px; farede 1024–1299px ölçeği (0.9) hedefi küçültür, en az 32px yeter.
  expect((await page.getByLabel("Plan günü", { exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(
    info.project.name.startsWith("mobile") ? 44 : 32,
  );
  await page.getByRole("button", { name: "Sonraki gün" }).click();
  await expect(page).toHaveURL(new RegExp(`date=${future(46)}`));
  await page.getByRole("button", { name: "Önceki gün" }).click();
  await expect(page).toHaveURL(new RegExp(`date=${d}`));
  await page.getByRole("button", { name: "Bugüne dön", exact: true }).click();
  await expect(page).not.toHaveURL(/date=/);
  await page.getByRole("button", { name: "Plan menüsü" }).click();
  for (const name of ["Görev Ertele", "Gün sonunu gözden geçir", "Sakin görünüm: kapalı, aç", "Acil işe geç"])
    await expect(page.getByRole("menuitem", { name })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/planning?date=2026-13-40");
  await expect(page.getByRole("alert").filter({ hasText: "Geçerli bir plan günü seç." })).toBeVisible();
});

test("offline never writes; an unknown result is reconciled by reading, not replayed; a stale version re-reads the day", async ({
  page,
  context,
}) => {
  const d = future(47);
  const a = await task("Belirsiz iş");
  const b = await task("Eski sürüm");
  const first = await item(d, a.id);
  await item(d, b.id);
  await openDay(page, d);
  const posts: string[] = [];
  page.on("request", r => {
    if (r.method() === "POST" && r.url().includes("/api/day-items/")) posts.push(r.url());
  });
  await context.setOffline(true);
  await row(page, a.title).getByRole("checkbox").click();
  await expect(row(page, a.title).getByRole("alert")).toContainText("Bağlantı yok");
  expect(posts).toHaveLength(0);
  await context.setOffline(false);
  await expect(row(page, a.title).getByRole("checkbox")).not.toBeChecked();
  await page.route(`**/api/day-items/${first.id}/complete`, async route => {
    await route.fetch();
    await route.abort("failed");
  });
  await row(page, a.title).getByRole("checkbox").check();
  await expect(row(page, a.title).getByRole("alert")).toContainText("sonucu alınamadı");
  expect(posts).toHaveLength(1);
  await expect(row(page, a.title).getByRole("checkbox")).toBeChecked();
  expect(posts).toHaveLength(1);
  await page.unroute(`**/api/day-items/${first.id}/complete`);
  // Tıklama yoldayken diğer cihaz b'yi bitirir. Eski sürüm reddedilir ve yeni durum okunur.
  const current = (await items(d)).find(x => x.taskId === b.id)!;
  await page.route(`**/api/day-items/${current.id}/complete`, async route => {
    expect(
      (await api.post(`/api/day-items/${current.id}/complete`, { data: { version: current.version } })).status(),
    ).toBe(200);
    await route.continue();
  });
  await row(page, b.title).getByRole("checkbox").check();
  await expect(row(page, b.title).getByRole("alert")).toContainText("başka bir yerde değişti");
  await expect(row(page, b.title).getByRole("checkbox")).toBeChecked();
  expect((await items(d)).find(x => x.taskId === b.id)!.completedAt).not.toBeNull();
  await page.unroute(`**/api/day-items/${current.id}/complete`);
  // Başka hesabın gün öğesi okunamaz ve değiştirilemez.
  expect((await foreign.post(`/api/day-items/${first.id}/reopen`, { data: { version: 1 } })).status()).toBe(404);
});

test("a timed row starts planned work with its block; long titles fit and touch targets stay usable", async ({
  page,
}, info) => {
  // Tarayıcı saati gelecekteki blokta sabit. Şimdi gerçek gün saatine bağlı değil.
  const d = future(48);
  const long = await task(`Uzun başlıklı plan öğesi ${"çok uzun açıklayıcı başlık ".repeat(6)}`);
  const t = await task("Başlatılan iş");
  await item(d, long.id);
  const [planned] = await block(d, "12:00", "13:00", t.id);
  await page.clock.setFixedTime(new Date(utc(d, "12:10")));
  await openDay(page, d);
  await expect(row(page, t.title)).toContainText("Şimdi");
  await expect(row(page, t.title)).toHaveAttribute("aria-current", "time");
  for (const width of info.project.name === "chromium" ? [320, 390, 768, 1440] : [info.project.use.viewport!.width]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
  }
  if (info.project.name === "mobile-chromium") {
    const box = await row(page, long.title).locator(".r2-square-hit").boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: `${EVIDENCE}/today-now-${info.project.name}.png`, fullPage: true });
  await row(page, t.title)
    .getByRole("button", { name: `Başlat: ${t.title}`, exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await api.get("/api/work-sessions/current")).json())?.activeSession?.startedScheduleId ?? null,
    )
    .toBe(planned.id);
  const running = (await (await api.get("/api/work-sessions/current")).json()).activeSession;
  expect(
    (await api.post(`/api/work-sessions/${running.id}/finish`, { data: { version: running.version } })).status(),
  ).toBe(200);
});

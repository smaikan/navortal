import { randomUUID } from "node:crypto";
import { expect, test, request, type APIRequestContext, type Page } from "@playwright/test";
import { signIn } from "./helpers/session";
import type { Task } from "../../src/features/tasks/model";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";
import { trackFaults } from "./helpers/faults";
import { registerFixture } from "./helpers/fixture-account";
test.describe.configure({ mode: "default" });
type Work = {
  id: string;
  taskId: string;
  state: string;
  source: string;
  version: number;
  activeSeconds: number | string;
  startedAt: string;
  endedAt: string | null;
};
type Segment = { id: string; startedAt: string; endedAt: string | null; isVoided: boolean; version: number };
let api: APIRequestContext;
let token: string;
let foreignSession: Work;
let otherToken: string;
const faults = new WeakMap<Page, string[]>();
const setupHost = "http://127.0.0.1:5182";
const tag = () => randomUUID().slice(0, 8);
/** Her senaryonun ayrı geçmiş günü var. İstanbul'da yaz saati yok; gerçek çakışma kuralları testleri birbirine bağlamasın. */
const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000 + 3 * 3_600_000).toISOString().slice(0, 10);
const utc = (date: string, time: string) => new Date(`${date}T${time}+03:00`).toISOString().replace(".000Z", "Z");
async function register() {
  const setup = await request.newContext({ baseURL: setupHost });
  const r = await registerFixture(setup, "/api/auth/register", {
    data: { email: `work-fix-${randomUUID()}@example.test`, password: randomUUID() },
  });
  expect(r.status()).toBe(201);
  const value = (await r.json()).accessToken as string;
  await setup.dispose();
  return value;
}
const client = async (value: string) =>
  request.newContext({ baseURL: setupHost, extraHTTPHeaders: { Authorization: `Bearer ${value}` } });
async function task(title: string, c = api): Promise<Task> {
  const r = await c.post("/api/tasks", { data: { title } });
  expect(r.status()).toBe(201);
  return r.json();
}
async function manual(taskId: string, startedAt: string, endedAt: string, c = api): Promise<Work> {
  const r = await c.post("/api/work-sessions/manual", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { taskId, startedAt, endedAt, reason: "fixture" },
  });
  expect(r.status()).toBe(201);
  return r.json();
}
async function work(id: string): Promise<Work> {
  const r = await api.get(`/api/work-sessions/${id}`);
  expect(r.status()).toBe(200);
  return r.json();
}
async function segments(id: string): Promise<Segment[]> {
  return (await (await api.get(`/api/work-sessions/${id}/segments?Limit=100`)).json()).items;
}
async function sessions(): Promise<Work[]> {
  const all: Work[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await (await api.get(`/api/work-sessions?Offset=${offset}&Limit=100`)).json();
    all.push(...page.items);
    if (all.length >= page.total || !page.items.length) return all;
  }
}
async function taskTime(id: string) {
  return Number((await (await api.get(`/api/tasks/${id}/time`)).json()).directActualSeconds);
}
test.beforeAll(async () => {
  token = await register();
  api = await client(token);
  // Worker başına tek ikinci hesap var. Sahiplik ve yaz saati senaryosu bunu paylaşır, kayıt hız sınırlıdır.
  otherToken = await register();
  const other = await client(otherToken);
  const foreignTask = await task(`Başka hesap ${tag()}`, other);
  foreignSession = await manual(foreignTask.id, utc(day(9), "09:00:00"), utc(day(9), "09:30:00"), other);
  await other.dispose();
});
test.afterAll(async () => {
  await api?.dispose();
});
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  faults.set(page, messages);
  trackFaults(page, messages);
  await signIn(page, token);
});
test.afterEach(async ({ page }) => {
  expect(faults.get(page)).toEqual([]);
});
const dialog = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });
async function openManual(page: Page, item: Task) {
  const verified = page.waitForResponse(
    r => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/auth/me",
  );
  await page.goto(`/tasks?taskId=${item.id}`);
  expect((await verified).status()).toBe(200);
  await expect(page.getByLabel("Görev başlığı", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Görev menüsü", exact: true }).click();
  await page.getByRole("menuitem", { name: "Geçmiş çalışma ekle", exact: true }).click();
  return dialog(page, "Manuel çalışma ekle");
}
async function fill(scope: ReturnType<typeof dialog>, start: string, end: string, reason?: string) {
  await scope.getByLabel("Başlangıç", { exact: true }).fill(start);
  await scope.getByLabel(/^Bitiş/).fill(end);
  if (reason !== undefined) await scope.getByLabel("Neden", { exact: true }).fill(reason);
}
const metric = (page: Page, term: string) =>
  page.getByLabel("Oturum süreleri").getByText(term, { exact: true }).locator("+ dd");

test("manual work: input boundaries stay local, server range/overlap errors keep the draft, adjacent ranges are accepted and actual is counted once", async ({
  page,
}, info) => {
  const item = await task(`Manuel ${tag()}`);
  const d = day(2);
  const before = (await sessions()).length;
  const posts: string[] = [];
  page.on("request", r => {
    if (r.method() === "POST" && r.url().endsWith("/api/work-sessions/manual"))
      posts.push(r.headers()["idempotency-key"] ?? "");
  });
  const form = await openManual(page, item);
  const save = form.getByRole("button", { name: "Manuel çalışmayı kaydet" });
  await save.click();
  await expect(form.getByRole("alert")).toContainText("Başlangıç zamanını gir.");
  await fill(form, `${d}T09:00`, `${d}T08:59:59`, "Toplantıdan sonra");
  await save.click();
  await expect(form.getByRole("alert")).toContainText("Bitiş başlangıçtan sonra olmalı.");
  await fill(form, `${d}T09:00`, `${d}T09:00`);
  await save.click();
  await expect(form.getByRole("alert")).toContainText("Bitiş başlangıçtan sonra olmalı.");
  await fill(form, `${d}T09:00`, `${d}T10:00`, "   ");
  await save.click();
  await expect(form.getByRole("alert")).toContainText("Neden gerekli");
  expect(posts).toHaveLength(0);
  // Gelecek bitişi tarayıcı saati değil sunucu reddeder. Taslak kalır.
  await fill(form, `${d}T09:00`, `${day(-1)}T10:00`, "Toplantıdan sonra");
  await save.click();
  await expect(form.getByRole("alert")).toContainText("gelecekte olamaz");
  await expect(form.getByLabel(/^Bitiş/)).toHaveValue(`${day(-1)}T10:00`);
  expect(posts).toHaveLength(1);
  await fill(form, `${d}T09:00`, `${d}T10:00`);
  await save.click();
  await expect(form.getByRole("status")).toContainText("Manuel çalışma kaydedildi");
  await expect(form.getByRole("status")).toContainText("· 1:00:00");
  const created = (await sessions()).filter(s => s.taskId === item.id);
  expect(created).toHaveLength(1);
  expect(created[0].source).toBe("Manual");
  expect(Number(created[0].activeSeconds)).toBe(3600);
  expect(await taskTime(item.id)).toBe(3600);
  await page.screenshot({ path: `${EVIDENCE}/manual-saved-${info.project.name}.png` });
  // Çakışmayı sunucu reddeder, taslak kalır ve yeni kayıt yazılmaz.
  await form.getByRole("button", { name: "Başka kayıt ekle" }).click();
  await fill(form, `${d}T09:30`, `${d}T09:45`, "Çakışan");
  await save.click();
  await expect(form.getByRole("alert")).toContainText("çakışıyor");
  await expect(form.getByLabel("Başlangıç", { exact: true })).toHaveValue(`${d}T09:30`);
  expect((await sessions()).filter(s => s.taskId === item.id)).toHaveLength(1);
  // Aralık başlangıç dahil, bitiş hariç. Tam önceki bitişte başlayan çakışmaz; 2000 karakter gerekçe kabul edilir.
  await fill(form, `${d}T10:00`, `${d}T10:15`, "a".repeat(2000));
  await save.click();
  await expect(form.getByRole("status")).toContainText("· 15:00");
  expect(await taskTime(item.id)).toBe(4500);
  expect((await sessions()).length).toBe(before + 2);
  expect(new Set(posts).size).toBe(posts.length);
  await auditTask(page, "manual", "work");
  await page.keyboard.press("Escape");
  await expect(form).toBeHidden();
  await expect(page.getByRole("button", { name: "Görev menüsü", exact: true })).toBeFocused();
});

test("an unknown manual result is resent only with the same key, the locked payload creates exactly one session, and a container task explains why it cannot take work", async ({
  page,
}) => {
  const item = await task(`Belirsiz ${tag()}`);
  const d = day(3);
  const keys: string[] = [];
  let lose = true;
  await page.route("**/api/work-sessions/manual", async route => {
    keys.push(route.request().headers()["idempotency-key"]);
    if (lose) {
      lose = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  const form = await openManual(page, item);
  await fill(form, `${d}T11:00`, `${d}T11:30`, "Bağlantı koptu");
  await form.getByRole("button", { name: "Manuel çalışmayı kaydet" }).click();
  await expect(form.getByRole("alert")).toContainText("Kaydedilmiş olabilir");
  await expect(form.getByLabel("Başlangıç", { exact: true })).toBeDisabled();
  expect((await sessions()).filter(s => s.taskId === item.id)).toHaveLength(1); // Sunucu gerçekten yazdı.
  await form.getByRole("button", { name: "Aynı kaydı güvenle yeniden gönder" }).click();
  await expect(form.getByRole("status")).toContainText("· 30:00");
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  expect((await sessions()).filter(s => s.taskId === item.id)).toHaveLength(1);
  await page.keyboard.press("Escape");
  await expect(form).toBeHidden();
  const container = await task(`Kapsayıcı ${tag()}`);
  const definition = await api.put(`/api/tasks/${container.id}/work-definition`, {
    data: { version: container.version, hasDirectWork: false, directEstimatedSeconds: null, targetBudgetSeconds: null },
  });
  expect(definition.status()).toBe(200);
  await page.goto(`/tasks?taskId=${container.id}`);
  await expect(page.getByLabel("Görev başlığı", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Görev menüsü", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Geçmiş çalışma ekle", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
});

test("corrections: adjust, void and restore with before/after/why; the journal never adds to actual; a stale version keeps the draft; a closed range cannot be reopened", async ({
  page,
}, info) => {
  const item = await task(`Düzeltme ${tag()}`);
  const d = day(4);
  const session = await manual(item.id, utc(d, "09:00:00"), utc(d, "10:00:00"));
  await page.goto(`/work?oturum=${session.id}`);
  await expect(page.getByRole("heading", { name: item.title, level: 2 })).toBeFocused();
  await expect(metric(page, "Aktif çalışma")).toContainText("1:00:00");
  const correct = async (reason: string, act: (form: ReturnType<typeof dialog>) => Promise<void>) => {
    await page.getByRole("button", { name: "Aralık 1 düzelt" }).click();
    const form = dialog(page, "Aralık 1 düzelt");
    await expect(form.getByRole("button", { name: "Düzeltmeyi kaydet" })).toBeDisabled();
    await act(form);
    await form.getByLabel("Neden", { exact: true }).fill(reason);
    await form.getByRole("button", { name: "Düzeltmeyi kaydet" }).click();
    await expect(form).toBeHidden();
  };
  await correct("Sayaç açık kaldı", form => form.getByLabel(/^Bitiş/).fill(`${d}T09:20`));
  await expect(metric(page, "Aktif çalışma")).toContainText("20 dakika");
  expect(Number((await work(session.id)).activeSeconds)).toBe(1200);
  const journal = page.getByRole("list", { name: "Düzeltme geçmişi" }).getByRole("listitem");
  await expect(journal).toHaveCount(2);
  await expect(journal.nth(0)).toContainText("Manuel eklendi");
  await expect(journal.nth(1)).toContainText("Düzeltildi");
  await expect(journal.nth(1)).toContainText("Önce:");
  await expect(journal.nth(1)).toContainText("10:00:00");
  await expect(journal.nth(1)).toContainText("09:20:00");
  await expect(journal.nth(1)).toContainText("Neden: Sayaç açık kaldı");
  await correct("Bu ben değildim", form => form.getByLabel(/geçersiz say/).check());
  await expect(page.getByRole("list", { name: "Aralıklar" })).toContainText("geçersiz sayıldı");
  expect(Number((await work(session.id)).activeSeconds)).toBe(0);
  expect(await taskTime(item.id)).toBe(0);
  await correct("Yanlışlıkla iptal", form => form.getByLabel(/geçersiz say/).uncheck());
  await expect(metric(page, "Aktif çalışma")).toContainText("20 dakika");
  expect(await taskTime(item.id)).toBe(1200);
  await expect(journal).toHaveCount(4);
  await page.screenshot({ path: `${EVIDENCE}/correction-journal-${info.project.name}.png`, fullPage: true });
  // Taslak açıkken diğer sekme aynı aralığı değiştirir.
  await page.getByRole("button", { name: "Aralık 1 düzelt" }).click();
  const form = dialog(page, "Aralık 1 düzelt");
  await form.getByLabel(/^Bitiş/).fill(`${d}T09:10`);
  await form.getByLabel("Neden", { exact: true }).fill("Benim düzeltmem");
  const [fresh] = await segments(session.id);
  expect(
    (
      await api.post(`/api/work-sessions/${session.id}/segments/${fresh.id}/corrections`, {
        data: {
          version: (await work(session.id)).version,
          segmentVersion: fresh.version,
          startedAt: utc(d, "09:00:00"),
          endedAt: utc(d, "09:40:00"),
          isVoided: false,
          reason: "Diğer sekme",
        },
      })
    ).status(),
  ).toBe(200);
  // Görünürlük/30sn yenilemesi yeni sürümü getirse de taslak kullanıcının gördüğü sürüme göre değerlendirilir.
  const refreshed = page.waitForResponse(
    r => r.request().method() === "GET" && r.url().includes(`/api/work-sessions/${session.id}/segments`),
  );
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await refreshed;
  await expect(form.getByText("Şu anki değer:", { exact: false })).toContainText("09:40:00");
  await form.getByRole("button", { name: "Düzeltmeyi kaydet" }).click();
  await expect(form.getByRole("alert")).toContainText("taslağın korundu");
  await expect(form.getByRole("region", { name: "Sunucudaki güncel aralık" })).toContainText("09:40:00");
  await expect(form.getByLabel(/^Bitiş/)).toHaveValue(`${d}T09:10`);
  await expect(form.getByLabel(/^Bitiş/)).toBeDisabled();
  expect(Number((await work(session.id)).activeSeconds)).toBe(2400);
  await form.getByRole("button", { name: "Taslağımı güncel kayda uygula" }).click();
  await form.getByRole("button", { name: "Düzeltmeyi kaydet" }).click();
  await expect(form).toBeHidden();
  expect(Number((await work(session.id)).activeSeconds)).toBe(600);
  await expect(journal).toHaveCount(6);
  // Kapalı aralığın bitişi gerekir. Tarayıcı yeniden açan düzeltme göndermez, sunucu da reddeder.
  await page.getByRole("button", { name: "Aralık 1 düzelt" }).click();
  const closed = dialog(page, "Aralık 1 düzelt");
  await closed.getByLabel(/^Bitiş/).fill("");
  await closed.getByLabel("Neden", { exact: true }).fill("Devam ettir");
  await closed.getByRole("button", { name: "Düzeltmeyi kaydet" }).click();
  await expect(closed.getByRole("alert")).toContainText("Bitiş zamanını gir.");
  const [latest] = await segments(session.id);
  const reopen = await api.post(`/api/work-sessions/${session.id}/segments/${latest.id}/corrections`, {
    data: {
      version: (await work(session.id)).version,
      segmentVersion: latest.version,
      startedAt: utc(d, "09:00:00"),
      endedAt: null,
      isVoided: false,
      reason: "x",
    },
  });
  expect(reopen.status()).toBe(409);
  expect((await reopen.json()).code).toBe("correction_cannot_resume");
  await auditTask(page, "correction", "work");
  page.once("dialog", prompt => prompt.dismiss());
  await page.keyboard.press("Escape");
  await expect(closed).toBeVisible();
  page.once("dialog", prompt => prompt.accept());
  await page.keyboard.press("Escape");
  await expect(closed).toBeHidden();
  await expect(page.getByRole("button", { name: "Aralık 1 düzelt" })).toBeFocused();
});

test("work log: 25-row paging, state filter, invalid and foreign links, keyboard access and a non-overflowing mobile layout", async ({
  page,
}, info) => {
  // Belgeyi bilerek değiştirmeden ilk okumaları bitiriyoruz. WebKit kesilen istekleri sayfa hatası diye bildirebilir.
  const visit = async (url: string) => {
    const sync = page.waitForResponse(
      r => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/workspace/snapshot",
    );
    await page.goto(url);
    await sync;
    await expect(page.getByRole("list", { name: / çalışma oturumları$/ }).first()).toBeVisible();
  };
  const item = await task(`Sayfalama ${tag()}`);
  const d = day(6);
  for (let index = 0; index < 26; index++) {
    const minute = index * 20;
    const at = (offset: number) =>
      `${String(Math.floor((minute + offset) / 60)).padStart(2, "0")}:${String((minute + offset) % 60).padStart(2, "0")}:00`;
    await manual(item.id, utc(d, at(0)), utc(d, at(10)));
  }
  const total = (await sessions()).length;
  await visit("/work");
  await expect(page.getByRole("heading", { name: "Çalışma kayıtları", level: 1 })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "oturum" })).toContainText(`25 / ${total} oturum`);
  await expect(page.getByRole("list", { name: / çalışma oturumları$/ }).getByRole("listitem")).toHaveCount(25);
  await page.getByRole("button", { name: "Sonraki", exact: true }).click();
  await expect(page).toHaveURL(/offset=25/);
  await expect(page.getByRole("status").filter({ hasText: "oturum" })).toContainText(`26–${total} / ${total} oturum`);
  await page.getByLabel("Durum", { exact: true }).selectOption("Running");
  await expect(page).not.toHaveURL(/offset=/);
  await expect(page.getByRole("heading", { name: "Bu durumda oturum yok" })).toBeVisible();
  await visit("/work?oturum=bad");
  await expect(page.getByRole("alert").filter({ hasText: "Oturum bağlantısı geçersiz" })).toBeVisible();
  await visit(`/work?oturum=${foreignSession.id}`);
  await expect(page.getByRole("alert").filter({ hasText: "erişilemiyor" })).toBeVisible();
  await visit("/work");
  const first = page.getByRole("button", { name: "Aralıkları ve geçmişi aç" }).first();
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/oturum=/);
  await expect(page.locator("#work-detail-heading")).toBeFocused();
  await expect(page.getByRole("button", { name: "Aralık 1 düzelt" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Aralık 1 düzelt" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog(page, "Aralık 1 düzelt")).toBeVisible();
  await expect(dialog(page, "Aralık 1 düzelt").getByLabel("Başlangıç", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog(page, "Aralık 1 düzelt")).toBeHidden();
  await auditTask(page, "work-log", "work");
  const widths = info.project.name === "chromium" ? [320, 390, 768, 1440] : [info.project.use.viewport!.width];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `${EVIDENCE}/work-log-${info.project.name}-${width}.png` });
  }
});

test("a DST-gap time is refused and a twice-occurring time is stored only after an explicit choice", async ({
  page,
}) => {
  const nyToken = otherToken;
  const ny = await client(nyToken);
  const current = await (await ny.get("/api/preferences")).json();
  expect(
    (
      await ny.put("/api/preferences", {
        data: { version: current.version, values: { ...current.values, timeZoneId: "America/New_York" } },
      })
    ).status(),
  ).toBe(200);
  const item = await task(`Yaz saati ${tag()}`, ny);
  await signIn(page, nyToken);
  const form = await openManual(page, item);
  await expect(form.getByText("Saniye girebilirsin.")).toBeVisible();
  await fill(form, "2026-03-08T02:30", "2026-03-08T03:30", "Gece");
  await form.getByRole("button", { name: "Manuel çalışmayı kaydet" }).click();
  await expect(form.getByRole("alert")).toContainText("yaz saati geçişinde bulunmuyor");
  await fill(form, "2025-11-02T01:30", "2025-11-02T01:45");
  await form.getByRole("button", { name: "Manuel çalışmayı kaydet" }).click();
  await expect(form.getByRole("alert")).toContainText("iki kez yaşanıyor");
  await form.getByLabel("Başlangıç hangi oluşum").selectOption("later");
  await form.getByLabel("Bitiş hangi oluşum").selectOption("later");
  await form.getByRole("button", { name: "Manuel çalışmayı kaydet" }).click();
  await expect(form.getByRole("status")).toContainText("· 15:00");
  const stored = (await (await ny.get("/api/work-sessions?Limit=10")).json()).items.find(
    (s: Work) => s.taskId === item.id,
  ) as Work;
  expect(Date.parse(stored.startedAt)).toBe(Date.parse("2025-11-02T06:30:00Z"));
  expect(Date.parse(stored.endedAt!)).toBe(Date.parse("2025-11-02T06:45:00Z"));
  await ny.dispose();
});

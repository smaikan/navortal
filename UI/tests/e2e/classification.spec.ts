import { randomUUID } from "node:crypto";
import { expect, test, request, type APIRequestContext, type Page, type Route } from "@playwright/test";
import { signIn } from "./helpers/session";
import type { Task } from "../../src/features/tasks/model";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";
import { trackFaults } from "./helpers/faults";
import { registerFixture } from "./helpers/fixture-account";
test.describe.configure({ mode: "default" });
type Resource = { id: string; name: string; version: number; archivedAt: string | null };
type Kind = "projects" | "pools" | "categories" | "tags";
type Values = { projectId: string | null; poolId: string | null; categoryId: string | null; tagIds: string[] };
let api: APIRequestContext;
let token: string;
let foreignProject: Resource;
const faults = new WeakMap<Page, string[]>();
const setupHost = "http://127.0.0.1:5182";
const evidence = EVIDENCE;
const tag = () => randomUUID().slice(0, 8);
async function register() {
  const setup = await request.newContext({ baseURL: setupHost });
  const r = await registerFixture(setup, "/api/auth/register", {
    data: { email: `cls-ui-${randomUUID()}@example.test`, password: randomUUID() },
  });
  expect(r.status()).toBe(201);
  const value = (await r.json()).accessToken as string;
  await setup.dispose();
  return value;
}
async function resource(kind: Kind, name: string, client = api): Promise<Resource> {
  const r = await client.post(`/api/${kind}`, { data: { name } });
  expect(r.status()).toBe(201);
  return r.json();
}
async function archive(kind: Kind, item: Resource) {
  const current = await (await api.get(`/api/${kind}/${item.id}`)).json();
  expect((await api.post(`/api/${kind}/${item.id}/archive`, { data: { version: current.version } })).status()).toBe(
    200,
  );
}
async function getTask(id: string): Promise<Task> {
  const r = await api.get(`/api/tasks/${id}`);
  expect(r.status()).toBe(200);
  return r.json();
}
async function task(title: string): Promise<Task> {
  const r = await api.post("/api/tasks", { data: { title } });
  expect(r.status()).toBe(201);
  return r.json();
}
async function child(parentId: string, title: string): Promise<Task> {
  const parent = await getTask(parentId);
  const r = await api.post(`/api/tasks/${parentId}/children`, {
    data: { title, parentVersion: parent.version, parentWorkDisposition: null },
  });
  expect(r.status()).toBe(201);
  return r.json();
}
async function read(id: string): Promise<{ version: number; planningVersion: number; values: Values }> {
  const r = await api.get(`/api/tasks/${id}/classification`);
  expect(r.status()).toBe(200);
  return r.json();
}
async function classify(id: string, values: Partial<Values>) {
  const current = await read(id);
  const r = await api.put(`/api/tasks/${id}/classification`, {
    data: { version: current.version, ...current.values, ...values, applyToSubtree: false },
  });
  expect(r.status()).toBe(200);
}
async function totalTasks() {
  return Number((await (await api.get("/api/tasks?offset=0&limit=1&includeArchived=true")).json()).total);
}
test.beforeAll(async () => {
  token = await register();
  api = await request.newContext({ baseURL: setupHost, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  expect((await api.get(`${process.env.UI_E2E_BASE_URL ?? "http://127.0.0.1:3400"}/api/auth/me`)).status()).toBe(200);
  const other = await request.newContext({
    baseURL: setupHost,
    extraHTTPHeaders: { Authorization: `Bearer ${await register()}` },
  });
  foreignProject = await resource("projects", `Başka hesap projesi ${tag()}`, other);
  await other.dispose();
});
test.afterAll(async () => {
  await api?.dispose();
});
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  faults.set(page, messages);
  trackFaults(page, messages);
  page.on("console", message => {
    if (message.type() === "error" && /Cannot update a component/.test(message.text())) messages.push(message.text());
  });
  await signIn(page, token);
});
test.afterEach(async ({ page }) => {
  expect(faults.get(page)).toEqual([]);
});
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
}
const status = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text });
const alert = (page: Page, text: string) => page.getByRole("alert").filter({ hasText: text });
const value = (page: Page, label: string) =>
  page
    .locator(".classification-row")
    .filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) })
    .locator("dd")
    .first();
const saved = (page: Page) => expect(status(page, "Sınıflandırma kaydedildi.")).toBeVisible();
// Sınıflama açık durur. Seçimi uygulamak kaydetme isteğidir.
async function openSection(page: Page, id: string) {
  await page.goto(`/tasks?taskId=${id}`);
  await expect(page.getByLabel("Görev başlığı", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Görev sınıflandırması")).toBeVisible();
}
async function picker(page: Page, field: "Proje" | "Havuz" | "Kategori" | "Etiket") {
  await page.getByRole("button", { name: `${field} seçimini değiştir`, exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: field === "Etiket" ? "Etiketleri seç" : `${field} seç`,
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function holdReads(page: Page, pattern: RegExp) {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let held = 0;
  const handler = async (route: Route) => {
    if (route.request().method() === "GET") {
      held++;
      await gate;
    }
    await route.continue().catch(() => {});
  };
  await page.route(pattern, handler);
  return {
    held: () => held,
    release: async () => {
      release();
      await page.unroute(pattern, handler);
    },
  };
}
const putUrl = (id: string) => `**/api/tasks/${id}/classification`;

test("cancelled choices never save; an applied choice saves at once, keeps untouched links and is reported before dependent reads", async ({
  page,
}, info) => {
  const run = tag();
  const project = await resource("projects", `Proje ${run}`);
  const category = await resource("categories", `Kategori ${run}`);
  const a = await resource("tags", `Etiket A ${run}`);
  const b = await resource("tags", `Etiket B ${run}`);
  const item = await task(`Sınıflanan iş ${run}`);
  await classify(item.id, { projectId: project.id, tagIds: [a.id, b.id] });
  const before = await totalTasks();
  await openSection(page, item.id);
  await expect(value(page, "Proje")).toContainText(project.name);
  await expect(value(page, "Kategori")).toContainText("Seç");
  // Etiketler görev panelinde gösterilmez; kayıtlı etiketler aşağıda korunur.
  await expect(page.locator(".classification-row dt", { hasText: /^Etiketler$/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sınıflandırmayı kaydet" })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Alt görevlere de uygula" })).toHaveCount(0);
  const puts: string[] = [];
  page.on("request", r => {
    if (r.method() === "PUT" && r.url().endsWith(`/api/tasks/${item.id}/classification`)) puts.push(r.url());
  });
  const trigger = page.getByRole("button", { name: "Kategori seçimini değiştir", exact: true });
  let dialog = await picker(page, "Kategori");
  await dialog.getByRole("radio", { name: category.name }).check();
  await dialog.getByRole("button", { name: "Vazgeç", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(value(page, "Kategori")).toContainText("Seç");
  dialog = await picker(page, "Kategori");
  await dialog.getByRole("radio", { name: category.name }).check();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(value(page, "Kategori")).toContainText("Seç");
  expect(puts).toHaveLength(0);
  dialog = await picker(page, "Kategori");
  await dialog.getByRole("radio", { name: category.name }).check();
  await auditTask(page, "classification-picker", "classification");
  const hold = await holdReads(page, /\/api\/(tasks(\?.*)?|tasks\/[^/]+|categories\/[^/]+\/workload)$/);
  await dialog.getByRole("button", { name: "Seçimi uygula", exact: true }).click();
  await expect(dialog).toBeHidden();
  await saved(page);
  await expect(value(page, "Kategori")).toContainText(category.name);
  await expect(page.getByText("kaydedilmedi")).toHaveCount(0);
  await expect.poll(hold.held).toBeGreaterThan(0);
  await hold.release();
  expect(puts).toHaveLength(1);
  const current = await read(item.id);
  expect(current.values.projectId).toBe(project.id);
  expect(current.values.categoryId).toBe(category.id);
  expect([...current.values.tagIds].sort()).toEqual([a.id, b.id].sort());
  expect(await totalTasks()).toBe(before);
  expect((await getTask(item.id)).id).toBe(item.id);
  await noOverflow(page);
  await auditTask(page, "classification-saved", "classification");
  await page.screenshot({ path: `${evidence}/classification-saved-${info.project.name}.png`, fullPage: true });
});

test("409 rebases a local category choice onto a remote pool change and keeps an archived project link", async ({
  page,
}) => {
  const run = tag();
  const old = await resource("projects", `Eski proje ${run}`);
  const pool = await resource("pools", `Uzak havuz ${run}`);
  const c1 = await resource("categories", `Yerel kategori ${run}`);
  const item = await task(`Çakışan iş ${run}`);
  await classify(item.id, { projectId: old.id });
  await archive("projects", old);
  await openSection(page, item.id);
  await expect(value(page, "Proje")).toContainText(`${old.name} (arşivlendi)`);
  // Kayıt yoldayken diğer cihaz havuzu değiştiriyor.
  await page.route(putUrl(item.id), async route => {
    if (route.request().method() !== "PUT") return route.continue();
    await classify(item.id, { poolId: pool.id });
    await route.continue();
  });
  const dialog = await picker(page, "Kategori");
  await dialog.getByRole("radio", { name: c1.name }).check();
  await dialog.getByRole("button", { name: "Seçimi uygula", exact: true }).click();
  await expect(alert(page, "Seçimlerin korundu")).toBeFocused();
  await expect(value(page, "Kategori")).toContainText("kaydedilmedi");
  await page.unroute(putUrl(item.id));
  await page.getByRole("button", { name: "Güncel sınıflandırmayı kontrol et", exact: true }).click();
  await expect(page.getByRole("region", { name: "Sunucudaki güncel sınıflandırma" })).toContainText(pool.name);
  await auditTask(page, "classification-conflict", "classification");
  await page.getByRole("button", { name: "Seçimlerimi güncel kayda uygula", exact: true }).click();
  await saved(page);
  await expect(value(page, "Havuz")).toContainText(pool.name);
  await expect(value(page, "Kategori")).toContainText(c1.name);
  expect((await read(item.id)).values).toEqual({
    projectId: old.id,
    poolId: pool.id,
    categoryId: c1.id,
    tagIds: [],
  });
});

test("a parent's choice changes only the parent; children keep their own classification", async ({ page }) => {
  const run = tag();
  const project = await resource("projects", `Ağaç projesi ${run}`);
  const category = await resource("categories", `Ağaç kategorisi ${run}`);
  const x = await resource("tags", `Çocuk etiketi ${run}`);
  const parent = await task(`Üst görev ${run}`);
  await classify(parent.id, { projectId: project.id });
  const c1 = await child(parent.id, `Çocuk 1 ${run}`);
  const c2 = await child(parent.id, `Çocuk 2 ${run}`);
  await classify(c1.id, { tagIds: [x.id] });
  const before = { c1: (await read(c1.id)).values, c2: (await read(c2.id)).values };
  await openSection(page, parent.id);
  const dialog = await picker(page, "Kategori");
  await dialog.getByRole("radio", { name: category.name }).check();
  await dialog.getByRole("button", { name: "Seçimi uygula", exact: true }).click();
  await saved(page);
  expect((await read(parent.id)).values.categoryId).toBe(category.id);
  expect((await read(c1.id)).values).toEqual(before.c1);
  expect((await read(c2.id)).values).toEqual(before.c2);
});

// Etiket seçimi görev panelinden kaldırıldı (30 Ekim kullanıcı kararı); büyük etiket seti testi bu yüzden yok.
test("foreign IDs, offline, a lost response and archived tasks never look saved", async ({ page, context }) => {
  const run = tag();
  const project = await resource("projects", `Doğru proje ${run}`);
  const pool = await resource("pools", `Çevrimdışı havuz ${run}`);
  const item = await task(`Hata işi ${run}`);
  await openSection(page, item.id);
  const puts: string[] = [];
  page.on("request", r => {
    if (r.method() === "PUT" && r.url().endsWith(`/api/tasks/${item.id}/classification`)) puts.push(r.url());
  });
  await page.route(putUrl(item.id), async route => {
    if (route.request().method() !== "PUT") return route.continue();
    await route.continue({
      postData: JSON.stringify({ ...route.request().postDataJSON(), projectId: foreignProject.id }),
    });
  });
  let dialog = await picker(page, "Proje");
  await dialog.getByRole("radio", { name: project.name }).check();
  await dialog.getByRole("button", { name: "Seçimi uygula", exact: true }).click();
  await expect(alert(page, "erişilemiyor")).toBeVisible();
  await expect(value(page, "Proje")).toContainText("kaydedilmedi");
  expect((await read(item.id)).values.projectId).toBeNull();
  await page.unroute(putUrl(item.id));
  await page.getByRole("button", { name: "Güncel sınıflandırmayı kontrol et", exact: true }).click();
  await page.getByRole("button", { name: "Seçimlerimi güncel kayda uygula", exact: true }).click();
  await saved(page);
  await expect(value(page, "Proje")).toContainText(project.name);
  expect((await read(item.id)).values.projectId).toBe(project.id);
  // Seçenekler çevrimiçi okunur, yalnız kaydetme çevrimdışı yapılır.
  dialog = await picker(page, "Havuz");
  await dialog.getByRole("radio", { name: pool.name }).check();
  await context.setOffline(true);
  const count = puts.length;
  await dialog.getByRole("button", { name: "Seçimi uygula", exact: true }).click();
  await expect(alert(page, "Bağlantı yok")).toBeVisible();
  expect(puts).toHaveLength(count);
  await expect(value(page, "Havuz")).toContainText("kaydedilmedi");
  await context.setOffline(false);
  // Sunucu denenen değişikliği kaydeder ama tarayıcı yanıtı alamaz.
  await page.route(putUrl(item.id), async route => {
    if (route.request().method() !== "PUT") return route.continue();
    await route.fetch();
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Yeniden dene", exact: true }).click();
  await expect(alert(page, "kaydedilmiş olabilir")).toBeVisible();
  expect(puts).toHaveLength(count + 1);
  await expect(page.getByRole("button", { name: "Proje seçimini değiştir" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Yeniden dene" })).toHaveCount(0);
  await page.unroute(putUrl(item.id));
  await page.getByRole("button", { name: "Güncel sınıflandırmayı kontrol et", exact: true }).click();
  await expect(page.getByRole("region", { name: "Sunucudaki güncel sınıflandırma" })).toContainText(pool.name);
  await page.getByRole("button", { name: "Sunucudakini kullan", exact: true }).click();
  await expect(page.getByText("kaydedilmedi")).toHaveCount(0);
  expect(puts).toHaveLength(count + 1);
  expect((await read(item.id)).values).toMatchObject({ projectId: project.id, poolId: pool.id });
  await auditTask(page, "classification-errors", "classification");
  const archivedTask = await task(`Arşivli iş ${run}`);
  expect(
    (
      await api.post(`/api/tasks/${archivedTask.id}/archive`, {
        data: { version: (await getTask(archivedTask.id)).version },
      })
    ).status(),
  ).toBe(200);
  await openSection(page, archivedTask.id);
  await expect(page.getByText("Arşivlenmiş görevin sınıflandırması değiştirilemez.")).toBeVisible();
  await expect(page.getByRole("button", { name: /seçimini değiştir$/ })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Proje seç" })).toHaveCount(0);
});

test("categories reuse the shared page; the saved choice survives panel layout swaps", async ({ page }, info) => {
  const run = tag();
  const longTag = await resource("tags", `Uzun etiket ${run} ${"çok uzun etiket adı ".repeat(9)}`.slice(0, 200));
  const item = await task(`Etiketli iş ${run}`);
  await classify(item.id, { tagIds: [longTag.id] });
  await page.goto("/categories");
  await expect(page.getByRole("heading", { name: "Kategoriler", level: 1 })).toBeVisible();
  const name = `Yeni kategori ${run}`;
  await page.getByLabel("Yeni kategori adı", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Kategori oluştur", exact: true }).click();
  await expect(
    page.getByRole("status", { includeHidden: true }).filter({ hasText: `Kategori oluşturuldu: ${name}` }),
  ).toHaveCount(1);
  await expect(page.getByText("Bu kategoride arşivlenmemiş görev yok.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Kategoriyi düzenle", exact: true }).click();
  await page.getByLabel("Açıklama", { exact: true }).fill("Taslak");
  page.once("dialog", d => d.dismiss());
  await page.getByRole("link", { name: "Görevler", exact: true }).first().click();
  await expect(page).toHaveURL(/\/categories/);
  await expect(page.getByLabel("Açıklama", { exact: true })).toHaveValue("Taslak");
  page.once("dialog", d => d.accept());
  await page.getByRole("link", { name: "Görevler", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Görevler", level: 1 })).toBeVisible();
  const pool = await resource("pools", `Taşınan havuz ${run}`);
  if (info.project.name === "chromium") await page.setViewportSize({ width: 1440, height: 900 });
  await openSection(page, item.id);
  const dialog = await picker(page, "Havuz");
  await dialog.getByRole("radio", { name: pool.name }).check();
  await dialog.getByRole("button", { name: "Seçimi uygula", exact: true }).click();
  await saved(page);
  const widths = info.project.name === "chromium" ? [390, 320, 768, 1199, 1440] : [info.project.use.viewport!.width];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expect(value(page, "Havuz")).toContainText(pool.name);
    await expect(page.locator(".classification-row dt", { hasText: /^Etiketler$/ })).toHaveCount(0);
    await noOverflow(page);
    const change = await page.getByRole("button", { name: "Havuz seçimini değiştir" }).boundingBox();
    expect(change!.height).toBeGreaterThanOrEqual(info.project.name.startsWith("mobile") ? 44 : 24);
    expect(change!.x + change!.width).toBeLessThanOrEqual(width);
  }
  await page.screenshot({ path: `${evidence}/classification-draft-${info.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Görev ayrıntısı panelini kapat" }).click();
  await expect(page.getByLabel("Görev başlığı", { exact: true })).toHaveCount(0);
  expect((await read(item.id)).values.poolId).toBe(pool.id);
});

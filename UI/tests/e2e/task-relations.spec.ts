import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { expect, test, request, type APIRequestContext, type Page, type Locator } from "@playwright/test";
import { signIn } from "./helpers/session";
import type { Task } from "../../src/features/tasks/model";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";
import { trackFaults } from "./helpers/faults";
import { registerFixture } from "./helpers/fixture-account";
import { outboxDrained, syncConnected } from "./helpers/live-sync";
test.describe.configure({ mode: "default" });
let api: APIRequestContext;
let token: string;
let foreign: Task;
const faults = new WeakMap<Page, string[]>();
const setupHost = "http://127.0.0.1:5182";
async function register() {
  const setup = await request.newContext({ baseURL: setupHost });
  const r = await registerFixture(setup, "/api/auth/register", {
    data: { email: `rel-ui-${randomUUID()}@example.test`, password: randomUUID() },
  });
  expect(r.status()).toBe(201);
  const value = (await r.json()).accessToken as string;
  await setup.dispose();
  return value;
}
async function get(id: string): Promise<Task> {
  const r = await api.get(`/api/tasks/${id}`);
  expect(r.status()).toBe(200);
  return r.json();
}
async function create(title: string): Promise<Task> {
  const r = await api.post("/api/tasks", { data: { title } });
  expect(r.status()).toBe(201);
  return r.json();
}
async function child(parentId: string, title: string): Promise<Task> {
  const parent = await get(parentId);
  const r = await api.post(`/api/tasks/${parentId}/children`, {
    data: {
      title,
      parentVersion: parent.version,
      parentWorkDisposition: parent.hasDirectWork && parent.directEstimatedSeconds !== null ? "PreserveDirect" : null,
    },
  });
  expect(r.status()).toBe(201);
  return r.json();
}
async function relate(kind: "dependencies" | "ordering", target: string, source: string) {
  const body = kind === "dependencies" ? { predecessorTaskId: source } : { beforeTaskId: source };
  const r = await api.post(`/api/tasks/${target}/${kind}`, { data: { version: (await get(target)).version, ...body } });
  expect(r.status()).toBe(201);
}
async function state(id: string, action: string) {
  const r = await api.post(`/api/tasks/${id}/state`, { data: { version: (await get(id)).version, action } });
  expect(r.status()).toBe(200);
}
const tag = () => randomUUID().slice(0, 8);
test.beforeAll(async () => {
  token = await register();
  api = await request.newContext({ baseURL: setupHost, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  expect((await api.get(`${process.env.UI_E2E_BASE_URL ?? "http://127.0.0.1:3400"}/api/auth/me`)).status()).toBe(200);
  const other = await request.newContext({
    baseURL: setupHost,
    extraHTTPHeaders: { Authorization: `Bearer ${await register()}` },
  });
  const r = await other.post("/api/tasks", { data: { title: `Başka hesap ${tag()}` } });
  expect(r.status()).toBe(201);
  foreign = await r.json();
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

async function openRelations(page: Page, id: string) {
  await page.goto(`/tasks?taskId=${id}`);
  await expect(page.getByLabel("Görev başlığı", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Görev menüsü", exact: true }).click();
  await page.getByRole("menuitem", { name: "Ön koşullar ve sıra", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Başlatılabilirlik", exact: true })).toBeVisible();
  await expect(page.getByText(/^Şu an başlatıl(abilir|amaz)\.$/)).toBeVisible();
}
const group = (page: Page, title: string) => page.getByRole("region", { name: new RegExp(`^${title}`) });
async function pick(page: Page, label: string, term: string, title: string, duringRefetch = false) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const modal = page.getByRole("dialog", { name: label, exact: true });
  await expect(modal).toBeVisible();
  await modal.getByLabel("Görev ara", { exact: true }).fill(term);
  await modal.getByRole("button", { name: "Ara", exact: true }).click();
  const candidate = modal
    .getByRole("list", { name: "Seçilebilecek görevler" })
    .getByRole("button")
    .filter({ hasText: title })
    .first();
  if (duringRefetch) {
    // Görünür arama sonucunun yenilemesini tutuyoruz. Görev seçimi onu beklememeli veya arada yutulmamalı.
    await expect(candidate).toBeVisible();
    let release!: () => void;
    const held = new Promise<void>(r => {
      release = r;
    });
    let holding = false;
    const results = (u: URL) => u.pathname === "/api/tasks" && u.searchParams.get("search") === term;
    await page.route(results, async route => {
      holding = true;
      await held;
      await route.continue().catch(() => {});
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => holding).toBe(true);
    try {
      await candidate.click();
      await expect(candidate).toHaveAttribute("aria-pressed", "true");
    } finally {
      release();
      await page.unroute(results);
    }
  } else {
    await candidate.click();
    await expect(candidate).toHaveAttribute("aria-pressed", "true");
  }
  await expect(modal.getByRole("heading", { name: "Seçilen görev", exact: true })).toBeFocused();
  return modal;
}
async function submit(modal: Locator, label: string) {
  const button = modal.getByRole("button", { name: label, exact: true });
  await expect(button).toBeEnabled();
  await button.focus();
  await button.press("Enter");
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
}

test("review: a confirmed relation is acknowledged while the target refresh is still pending", async ({
  page,
}, info) => {
  const id = tag();
  const source = await create(`Onay kaynağı ${id}`);
  const target = await create(`Onay hedefi ${id}`);
  await openRelations(page, target.id);
  const modal = await pick(page, "Ön koşul ekle", source.title, source.title);
  let release!: () => void;
  const hold = new Promise<void>(resolve => {
    release = resolve;
  });
  let refreshWaiting = false;
  await page.route(
    url => url.pathname === `/api/tasks/${target.id}`,
    async route => {
      refreshWaiting = true;
      await hold;
      await route.continue();
    },
  );
  try {
    const response = page.waitForResponse(
      r => new URL(r.url()).pathname === `/api/tasks/${target.id}/dependencies` && r.request().method() === "POST",
    );
    await submit(modal, "Ön koşulu ekle");
    expect((await response).status()).toBe(201);
    await expect.poll(() => refreshWaiting).toBe(true);
    const persisted = await api.get(`/api/tasks/${target.id}/dependencies?offset=0&limit=10`);
    expect(persisted.status()).toBe(200);
    expect(
      (await persisted.json()).items.some((item: { sourceTaskId: string }) => item.sourceTaskId === source.id),
    ).toBe(true);
    await modal.getByRole("status").filter({ hasText: "Ön koşul eklendi" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${EVIDENCE}/completion/ack-refresh-pending-${info.project.name}.png` });
    writeFileSync(
      `${EVIDENCE}/completion/ack-refresh-pending-${info.project.name}.json`,
      JSON.stringify(
        {
          postStatus: 201,
          persistedRelation: true,
          targetGetHeld: refreshWaiting,
          successVisible: await modal.getByRole("status").filter({ hasText: "Ön koşul eklendi" }).isVisible(),
          pendingVisible: await modal.getByText("İlişki işleniyor…", { exact: true }).isVisible(),
        },
        null,
        2,
      ),
    );
    await expect(modal.getByRole("status").filter({ hasText: "Ön koşul eklendi" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Kaydedildi", exact: true })).toBeDisabled();
    await expect(modal.getByRole("button", { name: "Kapat", exact: true })).toBeDisabled();
    await expect(modal.getByRole("button", { name: "Ön koşul ekle panelini kapat", exact: true })).toBeDisabled();
    await expect(modal.getByRole("button", { name: "Başka bir görev seç", exact: true })).toBeDisabled();
    await expect(modal.getByText("İlişki işleniyor…", { exact: true })).toBeHidden();
    await expect(modal.getByText(/Güncel görev sürümü okunuyor/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal).toBeVisible();
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
  await expect(modal.getByRole("button", { name: "Kapat", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
});

test("review: an inherited prerequisite must not be described as waiting for no other task", async ({ page }, info) => {
  const id = tag();
  const source = await create(`Miras ön koşul ${id}`);
  const parent = await create(`Miras üst ${id}`);
  const leaf = await child(parent.id, `Miras alt ${id}`);
  await relate("dependencies", parent.id, source.id);
  await openRelations(page, leaf.id);
  const decision = await api.get(`/api/tasks/${leaf.id}/start-eligibility`);
  expect(decision.status()).toBe(200);
  expect(await decision.json()).toMatchObject({
    canStart: false,
    reasons: expect.arrayContaining(["predecessor_incomplete"]),
    blockingPredecessorIds: expect.arrayContaining([source.id]),
  });
  await expect(page.getByText("Şu an başlatılamaz.", { exact: true })).toBeVisible();
  const local = group(page, "Ön koşullar");
  await expect(local.getByText(/Doğrudan eklenen ön koşul yok\./)).toBeVisible();
  await local.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${EVIDENCE}/completion/inherited-prerequisite-${info.project.name}.png` });
  await expect(local).not.toContainText("Bu görev başka bir görevin tamamlanmasını beklemiyor.");
});

test("review: committed add and remove response loss is inspected without automatic replay", async ({ page }) => {
  const id = tag();
  const source = await create(`Kayıtlı belirsiz kaynak ${id}`);
  const target = await create(`Kayıtlı belirsiz hedef ${id}`);
  await openRelations(page, target.id);
  let adds = 0;
  let removes = 0;
  await page.route(`**/api/tasks/${target.id}/dependencies`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    adds++;
    expect((await route.fetch()).status()).toBe(201);
    await route.abort("failed");
  });
  const modal = await pick(page, "Ön koşul ekle", source.title, source.title);
  await submit(modal, "Ön koşulu ekle");
  await expect(modal.getByRole("alert")).toContainText("kaydedilmiş olabilir");
  expect(adds).toBe(1);
  await expect(modal.getByRole("button", { name: "Ön koşulu ekle", exact: true })).toBeDisabled();
  await modal.getByRole("button", { name: "Güncel ilişkileri kontrol et", exact: true }).click();
  await expect(modal.getByRole("region", { name: "Güncel ön koşullar", exact: true })).toContainText(source.title);
  expect(adds).toBe(1);
  await modal.getByRole("button", { name: "Kontrol ettim, yeni işlem hazırla", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await page.unrouteAll({ behavior: "wait" });
  const hard = group(page, "Ön koşullar");
  const remove = hard.getByRole("button", { name: `${source.title} ön koşulunu kaldır`, exact: true });
  await expect(remove).toBeEnabled();
  await page.route(`**/api/tasks/${target.id}/dependencies/${source.id}?*`, async route => {
    removes++;
    expect(route.request().method()).toBe("DELETE");
    expect((await route.fetch()).status()).toBe(204);
    await route.abort("failed");
  });
  await remove.click();
  await expect(page.getByRole("alert").filter({ hasText: "kaydedilmiş olabilir" })).toBeVisible();
  expect(removes).toBe(1);
  await expect(hard.getByRole("button", { name: "Ön koşul ekle", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Güncel ilişkileri kontrol et", exact: true }).click();
  await expect(hard).toContainText("Doğrudan eklenen ön koşul yok.");
  expect(removes).toBe(1);
  expect(adds).toBe(1);
  const persisted = await api.get(`/api/tasks/${target.id}/dependencies?offset=0&limit=10`);
  expect(persisted.status()).toBe(200);
  expect((await persisted.json()).total).toBe(0);
  await page.unrouteAll({ behavior: "wait" });
});

test("hard prerequisite blocks a real start until completed; soft ordering is labelled and never blocks", async ({
  page,
}, info) => {
  const id = tag();
  const a = await create(`Ön iş ${id}`);
  const b = await create(`Sonraki iş ${id}`);
  const c = await create(`Tercihen önce ${id}`);
  await openRelations(page, b.id);
  await expect(page.getByText("Şu an başlatılabilir.", { exact: true })).toBeVisible();
  await expect(group(page, "Ön koşullar")).toContainText("Sert ön koşul");
  await expect(group(page, "Tercih edilen sıra")).toContainText("Yumuşak sıra");
  await expect(group(page, "Ön koşullar")).toContainText("Doğrudan eklenen ön koşul yok.");
  const modal = await pick(page, "Ön koşul ekle", `Ön iş ${id}`, a.title);
  await expect(modal.getByText(`“${a.title}” tamamlanmadan “${b.title}” başlatılamaz.`, { exact: true })).toBeVisible();
  await expect(
    modal
      .getByRole("list", { name: "Seçilebilecek görevler" })
      .getByRole("button")
      .filter({ hasText: "kendisine bağlanamaz" }),
  ).toHaveCount(0);
  await auditTask(page, "add-dependency", "relations");
  await submit(modal, "Ön koşulu ekle");
  await expect(modal.getByRole("status").filter({ hasText: `Ön koşul eklendi: “${a.title}”` })).toBeVisible();
  await modal.getByRole("button", { name: "Kapat", exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByRole("button", { name: "Ön koşul ekle", exact: true })).toBeFocused();
  const hard = group(page, "Ön koşullar");
  await expect(hard.getByText(a.title, { exact: true })).toBeVisible();
  await expect(hard).toContainText("Henüz tamamlanmadı; bu görevin başlatılmasını engeller.");
  await expect(page.getByText("Şu an başlatılamaz.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Tamamlanmamış bir ön koşul var/)).toBeVisible();
  const blocked = await api.post("/api/work-sessions/start", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { taskId: b.id },
  });
  expect(blocked.status()).toBe(409);
  expect((await blocked.json()).code).toBe("predecessor_incomplete");

  const soft = await pick(page, "Önce yapılacak görev ekle", `Tercihen önce ${id}`, c.title);
  await expect(soft.getByText(/Başlatma engellenmez\.$/)).toBeVisible();
  await submit(soft, "Sıra tercihini ekle");
  await expect(soft.getByRole("status").filter({ hasText: "Sıra tercihi eklendi" })).toBeVisible();
  await expect(soft.getByRole("button", { name: "Kapat", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(soft).toBeHidden();
  await expect(group(page, "Tercih edilen sıra")).toContainText(
    "Başlatmayı engellemez; yalnız planlama sırasını etkiler.",
  );
  await auditTask(page, "lists", "relations");
  await page.screenshot({ path: `${EVIDENCE}/relations-blocked-${info.project.name}.png`, fullPage: true });

  await state(a.id, "Complete");
  await page.getByRole("button", { name: "Yeniden denetle", exact: true }).click();
  await expect(page.getByText("Şu an başlatılabilir.", { exact: true })).toBeVisible();
  const started = await api.post("/api/work-sessions/start", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { taskId: b.id },
  });
  expect(started.status()).toBe(201);
  const work = await started.json();
  expect((await api.post(`/api/work-sessions/${work.id}/finish`, { data: { version: work.version } })).status()).toBe(
    200,
  );
});

test("cycle, self, foreign ID and deferred prerequisite explain themselves", async ({ page }) => {
  const id = tag();
  const a = await create(`Döngü A ${id}`);
  const b = await create(`Döngü B ${id}`);
  await relate("dependencies", b.id, a.id);
  await openRelations(page, a.id);
  let modal = await pick(page, "Ön koşul ekle", `Döngü B ${id}`, b.title, true);
  await submit(modal, "Ön koşulu ekle");
  await expect(modal.getByRole("alert")).toContainText("döngü");
  await expect(modal.getByRole("alert")).toBeFocused();
  await modal.getByLabel("Görev ara", { exact: true }).fill(`Döngü A ${id}`);
  await modal.getByRole("button", { name: "Ara", exact: true }).click();
  const self = modal
    .getByRole("list", { name: "Seçilebilecek görevler" })
    .getByRole("button")
    .filter({ hasText: a.title });
  await expect(self).toBeDisabled();
  await expect(self).toContainText("kendisine bağlanamaz");
  await auditTask(page, "cycle", "relations");
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();

  // Başka hesabın kimliği gerçek API'ye gider. Sahipliği sunucu seçer.
  await page.route("**/api/tasks/*/dependencies", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON();
    await route.continue({ postData: JSON.stringify({ ...body, predecessorTaskId: foreign.id }) });
  });
  modal = await pick(page, "Ön koşul ekle", `Döngü B ${id}`, b.title);
  await submit(modal, "Ön koşulu ekle");
  await expect(modal.getByRole("alert")).toContainText("bu hesaba ait olmayabilir");
  await page.unroute("**/api/tasks/*/dependencies");
  await page.keyboard.press("Escape");

  await state(a.id, "Defer");
  await openRelations(page, b.id);
  const hard = group(page, "Ön koşullar");
  await expect(hard).toContainText("Ertelendi");
  await expect(hard).toContainText("engeli kaldırmaz");
  await expect(page.getByText("Şu an başlatılamaz.", { exact: true })).toBeVisible();
});

test("409 rereads the target; pagination and successive removals use the current version", async ({ page }) => {
  const id = tag();
  const target = await create(`Çok ön koşul ${id}`);
  const sources: Task[] = [];
  for (let index = 0; index < 11; index++) {
    const source = await create(`Sayfa kaynağı ${String(index).padStart(2, "0")} ${id}`);
    sources.push(source);
    await relate("dependencies", target.id, source.id);
  }
  await openRelations(page, target.id);
  const hard = group(page, "Ön koşullar");
  await expect(hard.getByText("10 / 11", { exact: true })).toBeVisible();
  await hard.getByRole("button", { name: "Sonraki", exact: true }).click();
  await expect(hard.getByText("11 / 11", { exact: true })).toBeVisible();
  const last = hard
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: /ön koşulunu kaldır$/ }) })
    .first();
  await expect(last.locator(".relation-title")).not.toHaveText("Görev okunuyor…");
  const lastTitle = (await last.locator(".relation-title").textContent())!;
  // Panel sürümü okuduktan sonra diğer istemci hedefi değiştirir.
  const other = await create(`Başka istemci ${id}`);
  await relate("ordering", target.id, other.id);
  await last.getByRole("button", { name: `${lastTitle} ön koşulunu kaldır`, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Güncel sürüm yüklendi" })).toBeVisible();
  await expect(group(page, "Tercih edilen sıra").getByText(other.title, { exact: true })).toBeVisible();
  await hard.getByRole("button", { name: `${lastTitle} ön koşulunu kaldır`, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: `Ön koşul kaldırıldı: ${lastTitle}` })).toBeVisible();
  await expect(hard.getByText("10 / 10", { exact: true })).toBeVisible();
  await expect(hard.getByRole("heading")).toBeFocused();
  const first = hard.getByRole("button", { name: /ön koşulunu kaldır$/ }).first();
  await expect(first).toBeEnabled();
  await first.click();
  await expect(hard.getByText("9 / 9", { exact: true })).toBeVisible();
  const r = await api.get(`/api/tasks/${target.id}/dependencies?offset=0&limit=50`);
  expect((await r.json()).total).toBe(9);
});

test("uncertain and offline writes are never replayed or shown as saved", async ({ page, context }) => {
  const id = tag();
  const a = await create(`Belirsiz kaynak ${id}`);
  const b = await create(`Belirsiz hedef ${id}`);
  await openRelations(page, b.id);
  const posts: string[] = [];
  page.on("request", r => {
    if (r.method() === "POST" && new URL(r.url()).pathname.endsWith("/dependencies")) posts.push(r.url());
  });
  await page.route("**/api/tasks/*/dependencies", route =>
    route.request().method() === "POST" ? route.abort("failed") : route.continue(),
  );
  const modal = await pick(page, "Ön koşul ekle", `Belirsiz kaynak ${id}`, a.title);
  await submit(modal, "Ön koşulu ekle");
  await expect(modal.getByRole("alert")).toContainText("kaydedilmiş olabilir");
  expect(posts).toHaveLength(1);
  await expect(modal.getByRole("button", { name: "Ön koşulu ekle", exact: true })).toBeDisabled();
  await page.unroute("**/api/tasks/*/dependencies");
  await modal.getByRole("button", { name: "Güncel ilişkileri kontrol et", exact: true }).click();
  await expect(modal.getByRole("heading", { name: "Güncel ön koşullar", exact: true })).toBeVisible();
  await expect(modal).toContainText("Doğrudan eklenen ön koşul yok.");
  await auditTask(page, "unknown", "relations");
  await modal.getByRole("button", { name: "Kontrol ettim, yeni işlem hazırla", exact: true }).click();
  expect(posts).toHaveLength(1);
  await context.setOffline(true);
  await submit(modal, "Ön koşulu ekle");
  await expect(modal.getByRole("alert")).toContainText("Bağlantı yok");
  expect(posts).toHaveLength(1);
  await context.setOffline(false);
  await expect(modal.getByRole("status").filter({ hasText: "Ön koşul eklendi" })).toHaveCount(0);
  await submit(modal, "Ön koşulu ekle");
  await expect(modal.getByRole("status").filter({ hasText: "Ön koşul eklendi" })).toBeVisible();
  expect(posts).toHaveLength(2);
});

test("long ancestor paths, keyboard picking and narrow layouts stay usable", async ({ page }, info) => {
  const id = tag();
  const long = (level: number) => `Uzun üst ${level} ${id} ${"çok uzun başlık ".repeat(16)}`.slice(0, 300);
  let node = await create(long(0));
  for (let level = 1; level < 6; level++) node = await child(node.id, long(level));
  const leaf = await child(node.id, `Derin yaprak ${id}`);
  const target = await create(`Klavye hedefi ${id}`);
  await openRelations(page, target.id);
  const trigger = page.getByRole("button", { name: "Ön koşul ekle", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const modal = page.getByRole("dialog", { name: "Ön koşul ekle", exact: true });
  await expect(modal.getByRole("heading", { name: "Ön koşul ekle", exact: true })).toBeFocused();
  await modal.getByLabel("Görev ara", { exact: true }).focus();
  await page.keyboard.type(`Derin yaprak ${id}`);
  await page.keyboard.press("Enter");
  const candidate = modal
    .getByRole("list", { name: "Seçilebilecek görevler" })
    .getByRole("button")
    .filter({ hasText: leaf.title });
  await candidate.focus();
  await page.keyboard.press("Enter");
  await expect(modal.getByRole("heading", { name: "Seçilen görev", exact: true })).toBeFocused();
  const path = modal.getByRole("list", { name: "Üst görev yolu, 6 düzey" });
  await expect(path).toBeVisible();
  await expect(path.getByRole("button", { name: "3 ara üst görevi göster", exact: true })).toBeVisible();
  await noOverflow(page);
  await auditTask(page, "path-picker", "relations");
  await page.screenshot({ path: `${EVIDENCE}/relations-path-picker-${info.project.name}.png` });
  const add = modal.getByRole("button", { name: "Ön koşulu ekle", exact: true });
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(modal.getByRole("status").filter({ hasText: "Ön koşul eklendi" })).toBeVisible();
  await expect(modal.getByRole("button", { name: "Kapat", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await expect(trigger).toBeFocused();
  const row = group(page, "Ön koşullar").getByRole("listitem").filter({ hasText: leaf.title });
  await row.getByText("Üst görev yolu", { exact: true }).click();
  const rowPath = row.getByRole("list", { name: "Üst görev yolu, 6 düzey" });
  const expand = rowPath.getByRole("button", { name: "3 ara üst görevi göster", exact: true });
  await expand.focus();
  await page.keyboard.press("Enter");
  await expect(rowPath.getByRole("listitem")).toHaveCount(6);
  await expect(rowPath.getByRole("listitem").nth(1)).toBeFocused();
  await expect(row).toContainText("Sert ön koşul");
  const widths =
    info.project.name === "chromium" ? [320, 390, 768, 1199, 1440, 1920] : [info.project.use.viewport!.width];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    // Yan panel/modal değişiminde içerik yeniden kurulur. Bölüm açık kalmalı.
    await expect(page.getByRole("heading", { name: "Başlatılabilirlik", exact: true })).toBeVisible();
    await expect(row).toBeVisible();
    await noOverflow(page);
    const box = await row.getByRole("button", { name: /ön koşulunu kaldır$/ }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(info.project.name.startsWith("mobile") ? 44 : 32);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  }
  await auditTask(page, "path-row", "relations");
  await page.screenshot({ path: `${EVIDENCE}/relations-path-row-${info.project.name}.png`, fullPage: true });
});

test("removing a soft preference uses the target version and preserves hard prerequisites", async ({ page }) => {
  const id = tag();
  const target = await create(`Sıra kaldırma hedefi ${id}`);
  const hard = await create(`Sert kalan ${id}`);
  const soft = await create(`Yumuşak kaldır ${id}`);
  await relate("dependencies", target.id, hard.id);
  await relate("ordering", target.id, soft.id);
  await openRelations(page, target.id);
  const before = await get(target.id);
  const response = page.waitForResponse(
    r =>
      r.request().method() === "DELETE" && new URL(r.url()).pathname === `/api/tasks/${target.id}/ordering/${soft.id}`,
  );
  await group(page, "Tercih edilen sıra")
    .getByRole("button", { name: `${soft.title} sıra tercihini kaldır`, exact: true })
    .click();
  const removed = await response;
  expect(removed.status()).toBe(204);
  expect(new URL(removed.url()).searchParams.get("version")).toBe(String(before.version));
  await expect(page.getByRole("status").filter({ hasText: `Sıra tercihi kaldırıldı: ${soft.title}` })).toBeVisible();
  await expect(group(page, "Tercih edilen sıra")).toContainText("Sıra tercihi yok.");
  await expect(group(page, "Ön koşullar").getByText(hard.title, { exact: true })).toBeVisible();
  await expect(page.getByText("Şu an başlatılamaz.", { exact: true })).toBeVisible();
  const hardPage = await api.get(`/api/tasks/${target.id}/dependencies?offset=0&limit=10`);
  const softPage = await api.get(`/api/tasks/${target.id}/ordering?offset=0&limit=10`);
  expect(await hardPage.json()).toMatchObject({
    total: 1,
    items: [expect.objectContaining({ sourceTaskId: hard.id })],
  });
  expect(await softPage.json()).toMatchObject({ total: 0 });
  expect(Number((await get(target.id)).version)).toBeGreaterThan(Number(before.version));
  expect((await get(soft.id)).id).toBe(soft.id);
});

test.describe("deep ancestor continuation", () => {
  let chain: Task[];
  let target: Task;
  test.beforeAll(async () => {
    const id = tag();
    chain = [await create(`Derin kök ${id}`)];
    for (let level = 1; level <= 129; level++) chain.push(await child(chain.at(-1)!.id, `Derin ${level} ${id}`));
    target = await create(`Derin yol hedefi ${id}`);
    await relate("dependencies", target.id, chain.at(-1)!.id);
  });
  test("129 ancestors load in explicit chunks, preserve read pages after failure and remain keyboard accessible", async ({
    page,
  }, info) => {
    const ancestors = new Set(chain.slice(0, -1).map(task => task.id));
    const read = new Set<string>();
    let pathReads = 0;
    page.on("response", async response => {
      if (
        response.status() === 200 &&
        new URL(response.url()).pathname === `/api/tasks/${chain.at(-1)!.id}/ancestors`
      ) {
        pathReads++;
        try {
          if (await response.finished()) return;
          const value = await response.json();
          for (const item of value.items) if (ancestors.has(item.id)) read.add(item.id);
        } catch {
          // Gezinme veya kapatma gövde bitmeden yanıtı kesebilir. Yalnız tamamlanmış sayfa sayılır;
          // alttaki kontroller bütün üstleri ve kullanıcının istediği her devam sayfasını yine şart koşar.
        }
      }
    });
    // 503 aralığı kullanıcının tekrarıyla kapanmalı, 130 görevlik verinin canlı yenilemesiyle değil.
    await outboxDrained(api);
    await openRelations(page, target.id);
    await syncConnected(page);
    const row = group(page, "Ön koşullar")
      .getByRole("listitem")
      .filter({ hasText: chain.at(-1)!.title });
    await row.getByText("Üst görev yolu", { exact: true }).click();
    await expect(row.getByRole("list", { name: "Üst görev yolu, 16 düzey yüklendi", exact: true })).toBeVisible();
    await expect.poll(() => read.size).toBe(16);
    expect(pathReads).toBe(1);
    await expect(row).toContainText("Daha üst görevler henüz okunmadı.");
    const failedPath = `/api/tasks/${chain.at(-1)!.id}/ancestors`;
    await page.route(
      url => url.pathname === failedPath && url.searchParams.has("cursor"),
      route =>
        route.fulfill({
          status: 503,
          contentType: "application/problem+json",
          body: JSON.stringify({ title: "Controlled ancestor read failure", status: 503 }),
        }),
    );
    await row.getByRole("button", { name: "Daha üst görevleri yükle", exact: true }).click();
    await expect(row.getByRole("alert")).toContainText("Okunan üst görevler korunuyor.");
    await expect(row.getByRole("list", { name: "Üst görev yolu, 16 düzey yüklendi", exact: true })).toBeVisible();
    await expect.poll(() => read.size).toBe(16);
    await page.unrouteAll({ behavior: "wait" });
    await row.getByRole("button", { name: "Üst görev yolunu yeniden yükle", exact: true }).click();
    await expect(row.getByRole("list", { name: "Üst görev yolu, 32 düzey yüklendi", exact: true })).toBeVisible();
    await expect.poll(() => read.size).toBe(32);
    for (const count of [48, 64, 80, 96, 112, 128, 129]) {
      const more = row.getByRole("button", { name: "Daha üst görevleri yükle", exact: true });
      // Odak eşitlemesi React düğmeyi kapatmadan aynı turda aktif sorguları yeniler;
      // açık devam isteği bunu beklemeli, arada kaybolmamalı.
      if (count === 48)
        await more.evaluate(button => {
          window.dispatchEvent(new Event("focus"));
          (button as HTMLButtonElement).click();
        });
      else await more.click();
      await expect(
        row.getByRole("list", { name: `Üst görev yolu, ${count} düzey${count < 129 ? " yüklendi" : ""}`, exact: true }),
      ).toBeVisible();
      await expect.poll(() => read.size).toBe(count);
    }
    const path = row.getByRole("list", { name: "Üst görev yolu, 129 düzey", exact: true });
    await expect(path.getByText(chain[0].title, { exact: true })).toBeVisible();
    await expect(row.getByRole("button", { name: "Daha üst görevleri yükle", exact: true })).toHaveCount(0);
    await noOverflow(page);
    await auditTask(page, "deep-path", "relations");
    await page.screenshot({ path: `${EVIDENCE}/completion/relations-deep-${info.project.name}.png` });
    const expand = path.getByRole("button", { name: "126 ara üst görevi göster", exact: true });
    await expand.focus();
    await expand.press("Enter");
    await expect(path.getByRole("listitem")).toHaveCount(129);
    await expect(path.getByRole("listitem").nth(1)).toBeFocused();
    await noOverflow(page);
  });
});

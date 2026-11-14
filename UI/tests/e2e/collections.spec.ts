import { randomUUID } from "node:crypto";
import { expect, test, request, type APIRequestContext, type Page, type Route } from "@playwright/test";
import { Temporal } from "temporal-polyfill";
import { signIn } from "./helpers/session";
import type { Task } from "../../src/features/tasks/model";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";
import { trackFaults } from "./helpers/faults";
import { registerFixture } from "./helpers/fixture-account";
import { rewriteExtensionText } from "./helpers/extension-text";
test.describe.configure({ mode: "default" });
type Resource = { id: string; name: string; description: string | null; version: number; archivedAt: string | null };
let api: APIRequestContext;
let token: string;
let foreignPool: Resource;
const faults = new WeakMap<Page, string[]>();
const setupHost = process.env.UI_E2E_SETUP_URL ?? "http://127.0.0.1:5182";
const evidence = EVIDENCE;
const tag = () => randomUUID().slice(0, 8);
async function register() {
  const setup = await request.newContext({ baseURL: setupHost });
  const r = await registerFixture(setup, "/api/auth/register", {
    data: { email: `col-ui-${randomUUID()}@example.test`, password: randomUUID() },
  });
  expect(r.status()).toBe(201);
  const value = (await r.json()).accessToken as string;
  await setup.dispose();
  return value;
}
async function resource(kind: "projects" | "pools", name: string, client = api): Promise<Resource> {
  const r = await client.post(`/api/${kind}`, { data: { name } });
  expect(r.status()).toBe(201);
  return r.json();
}
async function current(kind: "projects" | "pools", id: string): Promise<Resource> {
  const r = await api.get(`/api/${kind}/${id}`);
  expect(r.status()).toBe(200);
  return r.json();
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
async function define(id: string, seconds: number | null) {
  const r = await api.put(`/api/tasks/${id}/work-definition`, {
    data: {
      version: (await getTask(id)).version,
      hasDirectWork: true,
      directEstimatedSeconds: seconds,
      targetBudgetSeconds: null,
    },
  });
  expect(r.status()).toBe(200);
}
async function classify(id: string, link: { poolId?: string; projectId?: string }) {
  const r = await api.put(`/api/tasks/${id}/classification`, {
    data: {
      version: (await getTask(id)).version,
      projectId: link.projectId ?? null,
      poolId: link.poolId ?? null,
      categoryId: null,
      tagIds: [],
      applyToSubtree: false,
    },
  });
  expect(r.status()).toBe(200);
}
async function child(parentId: string, title: string): Promise<Task> {
  const parent = await getTask(parentId);
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
async function totalTasks() {
  const r = await api.get("/api/tasks?offset=0&limit=1&includeArchived=true");
  expect(r.status()).toBe(200);
  return Number((await r.json()).total);
}
test.beforeAll(async () => {
  token = await register();
  api = await request.newContext({ baseURL: setupHost, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  expect((await api.get(`${process.env.UI_E2E_BASE_URL ?? "http://127.0.0.1:3400"}/api/auth/me`)).status()).toBe(200);
  const other = await request.newContext({
    baseURL: setupHost,
    extraHTTPHeaders: { Authorization: `Bearer ${await register()}` },
  });
  foreignPool = await resource("pools", `Başka hesap havuzu ${tag()}`, other);
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
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
}
const heading = (page: Page, kind: string) => page.locator(`#${kind}-detail-heading`);
const metric = (page: Page, group: string, term: string) =>
  page.getByLabel(group).getByText(term, { exact: true }).locator("+ dd");
const status = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text });
// Oluşturma listede. Telefonda ayrıntı listenin yerine geçtiği için onayı görünürlük şartı olmadan kontrol ediyoruz.
const confirmed = (page: Page, text: string) =>
  page.getByRole("status", { includeHidden: true }).filter({ hasText: text });
const alert = (page: Page, text: string) => page.getByRole("alert").filter({ hasText: text });
/** Bağlı GET'leri tutuyoruz, doğrulanmış yazı onlar bitmeden bildiriliyor mu bakalım. */
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

test("projects: empty state, long-name create, immediate save feedback, 409 rebase and stale archive", async ({
  page,
}, info) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projeler", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Henüz proje yok" })).toBeVisible();
  await auditTask(page, "projects-empty", "collections");
  const name = `Uzun proje ${tag()} ${"çok uzun proje adı ".repeat(12)}`.slice(0, 200);
  await page.getByLabel("Yeni proje adı", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Proje oluştur", exact: true }).click();
  await expect(confirmed(page, "Proje oluşturuldu")).toHaveCount(1);
  await expect(heading(page, "projects")).toHaveText(name);
  await expect(heading(page, "projects")).toBeFocused();
  await expect(page.getByLabel("Yeni proje adı", { exact: true })).toHaveValue("");
  const id = new URL(page.url()).searchParams.get("id")!;
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  await expect(metric(page, "Proje iş yükü", "Görev")).toHaveText("0");
  await noOverflow(page);
  await page.screenshot({ path: `${evidence}/projects-detail-${info.project.name}.png`, fullPage: true });

  // Düzenleme kapalı bölümde, açılınca odak ad alanına geçer.
  await page.getByRole("button", { name: "Projeyi düzenle", exact: true }).click();
  await expect(page.getByLabel("Proje adı", { exact: true })).toBeFocused();
  // Liste ve iş yükü yenilemesi beklerken kayıt makbuzu gösterilir.
  await page.getByLabel("Açıklama", { exact: true }).fill("İlk açıklama");
  const hold = await holdReads(page, /\/api\/projects(\?.*|\/[^/]+\/workload)$/);
  await page.getByRole("button", { name: "Proje bilgilerini kaydet", exact: true }).click();
  await expect(status(page, "Proje kaydedildi.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Proje bilgilerini kaydet", exact: true })).toBeDisabled();
  await expect.poll(hold.held).toBeGreaterThan(0);
  await hold.release();
  expect((await current("projects", id)).description).toBe("İlk açıklama");

  // Diğer istemci adı değiştirir. Yerel açıklama korunarak yeni adla uzlaştırılır.
  await page.getByLabel("Açıklama", { exact: true }).fill("İkinci açıklama");
  const before = await current("projects", id);
  expect(
    (
      await api.put(`/api/projects/${id}`, {
        data: { version: before.version, name: `Sunucu adı ${tag()}`, description: before.description },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "Proje bilgilerini kaydet", exact: true }).click();
  await expect(alert(page, "Taslağın korundu")).toBeFocused();
  await expect(page.getByRole("button", { name: "Proje bilgilerini kaydet", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Sunucudaki kaydı kontrol et", exact: true }).click();
  await expect(page.getByRole("region", { name: "Sunucudaki güncel kayıt" })).toContainText("Sunucu adı");
  await auditTask(page, "projects-conflict", "collections");
  await page.getByRole("button", { name: "Taslağımı güncel kayıtla düzenle", exact: true }).click();
  await expect(page.getByLabel("Proje adı", { exact: true })).toHaveValue(/^Sunucu adı/);
  await expect(page.getByLabel("Açıklama", { exact: true })).toHaveValue("İkinci açıklama");
  await page.getByRole("button", { name: "Proje bilgilerini kaydet", exact: true }).click();
  await expect(status(page, "Proje kaydedildi.")).toBeVisible();
  const saved = await current("projects", id);
  expect(saved.name).toMatch(/^Sunucu adı/);
  expect(saved.description).toBe("İkinci açıklama");

  // Eski arşivleme 409 almalı, görülmemiş sürümü sessizce arşivlememeli.
  expect(
    (
      await api.put(`/api/projects/${id}`, {
        data: { version: saved.version, name: saved.name, description: "Başka sekme" },
      })
    ).status(),
  ).toBe(200);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Projeyi arşivle", exact: true }).click();
  await expect(alert(page, "Taslağın korundu")).toBeVisible();
  expect((await current("projects", id)).archivedAt).toBeNull();
  await page.getByRole("button", { name: "Sunucudaki kaydı kontrol et", exact: true }).click();
  await page.getByRole("button", { name: "Sunucudaki kaydı kullan", exact: true }).click();
  await expect(page.getByLabel("Açıklama", { exact: true })).toHaveValue("Başka sekme");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Projeyi arşivle", exact: true }).click();
  await expect(status(page, "Proje arşivlendi")).toBeVisible();
  await expect(page.locator(".resource-state")).toHaveText("Arşivlendi · düzenlenemez");
  await expect(page.getByRole("button", { name: "Proje bilgilerini kaydet" })).toHaveCount(0);
  expect((await current("projects", id)).archivedAt).not.toBeNull();
  await page.goto("/projects");
  await expect(page.getByText("0 proje", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Arşivlenenleri göster" }).check();
  await expect(
    page.getByRole("list", { name: "Projeler listesi" }).getByRole("button").filter({ hasText: "Arşivlendi" }),
  ).toHaveCount(1);
  await expect(page).toHaveURL(/includeArchived=true/);
});

test("pools: paging, parent+child counted once, no task copies, workload refresh, draft kept across task panel and Back", async ({
  page,
}) => {
  const run = tag();
  const pools: Resource[] = [];
  for (let index = 0; index < 26; index++)
    pools.push(await resource("pools", `Havuz ${run} ${String(index).padStart(2, "0")}`));
  const pool = pools[0];
  const before = await totalTasks();
  const parent = await task(`Havuz üst ${run}`);
  await define(parent.id, 600);
  await classify(parent.id, { poolId: pool.id });
  const leaf = await child(parent.id, `Havuz alt ${run}`);
  await define(leaf.id, 1200);
  expect((await getTask(leaf.id)).poolId).toBe(pool.id);
  await page.goto(`/pool?search=${encodeURIComponent(`Havuz ${run}`)}`);
  await expect(page.getByText("25 / 26 havuz")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Havuz sayfaları" })).toBeVisible();
  // Öne dönüş önbelleği gerçekten yeniler. GET beklerken sayfalama kullanılabilmeli.
  let releasePage!: () => void;
  const pageGate = new Promise<void>(resolve => {
    releasePage = resolve;
  });
  let heldPage = 0;
  await page.route("**/api/pools?**", async route => {
    if (new URL(route.request().url()).searchParams.get("offset") !== "0") return route.continue();
    const response = await route.fetch();
    heldPage++;
    await pageGate;
    await route.fulfill({ response }).catch(() => {});
  });
  try {
    await expect(page.locator("[data-sync-state]")).toHaveAttribute("data-sync-state", "connected");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => heldPage).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: "Sonraki", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Sonraki", exact: true }).click();
    await expect(page.getByText("26 / 26 havuz")).toBeVisible();
  } finally {
    releasePage();
    await page.unrouteAll({ behavior: "wait" });
  }
  await page.getByRole("button", { name: "Önceki", exact: true }).click();
  await expect(page.getByText("25 / 26 havuz")).toBeVisible();
  await page.getByRole("list", { name: "Havuz listesi" }).getByRole("button").filter({ hasText: pool.name }).click();
  await expect(heading(page, "pools")).toHaveText(pool.name);
  await expect(metric(page, "Havuz iş yükü", "Görev")).toHaveText("1");
  await expect(metric(page, "Havuz iş yükü", "Bilinen tahmin süre")).toHaveText("30 dk");
  await expect(page.getByText("Hesaplanan toplam", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Kendi işi olan iş", { exact: true })).toHaveCount(0);
  await expect(page.locator(".resource-detail .relation-count")).toHaveText("1 ana / tekil görev grubu");
  expect(await totalTasks()).toBe(before + 2);

  // Aynı görev paneli açılıp kapanırken taslak korunur.
  await page.getByRole("button", { name: "Havuzu düzenle", exact: true }).click();
  await page.getByLabel("Açıklama", { exact: true }).fill("Taslak not");
  await page
    .getByRole("list", { name: "Havuz görevleri" })
    .getByRole("button", { name: `${leaf.title} ayrıntısını aç` })
    .click();
  await expect(page.getByRole("heading", { name: "Görev ayrıntısı" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`taskId=${leaf.id}`));
  await expect(page).toHaveURL(new RegExp(`id=${pool.id}`));
  // Paneldeki görev yazısı havuz yükünü sayfa yenilemeden günceller.
  const minutes = page.getByLabel("Tahmini süre (dakika)", { exact: true });
  await minutes.fill("30");
  await minutes.press("Tab");
  await expect(page.getByRole("status").filter({ hasText: "Kaydedildi" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Görev ayrıntısı panelini kapat" }).click();
  await expect(page.getByRole("heading", { name: "Görev ayrıntısı" })).toBeHidden();
  await expect(metric(page, "Havuz iş yükü", "Bilinen tahmin süre")).toHaveText("40 dk");
  await expect(page.getByLabel("Açıklama", { exact: true })).toHaveValue("Taslak not");
  expect(await totalTasks()).toBe(before + 2);
  await auditTask(page, "pools-workload", "collections");

  // Taslakla Geri önce sorar, vazgeçmek ayrıntıyı ve taslağı korur.
  page.once("dialog", dialog => dialog.dismiss());
  await page.goBack();
  await expect(heading(page, "pools")).toHaveText(pool.name);
  await expect(page.getByLabel("Açıklama", { exact: true })).toHaveValue("Taslak not");
  await expect(page).toHaveURL(new RegExp(`id=${pool.id}`));
  page.once("dialog", dialog => dialog.accept());
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]id=/);
  await expect(heading(page, "pools")).toHaveCount(0);
  await expect(
    page.getByRole("list", { name: "Havuz listesi" }).getByRole("button").filter({ hasText: pool.name }),
  ).toBeFocused();
  expect((await current("pools", pool.id)).description).toBeNull();

  // Bilinmeyen tahmin toplamı da bilinmeyen bırakır, sıfır yapmaz.
  const unknown = await task(`Tahminsiz ${run}`);
  await classify(unknown.id, { poolId: pool.id });
  await page.goto(`/pool?id=${pool.id}`);
  await expect(metric(page, "Havuz iş yükü", "Tahminsiz iş")).toHaveText("1");
  await expect(page.getByText("Hesaplanan toplam", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Görev listesinde bu filtreyle aç" })).toHaveCount(0);
});

test("pools: foreign/invalid IDs, offline, a lost-response create and trimming are handled without false success", async ({
  page,
  context,
}) => {
  await page.goto(`/pool?id=${foreignPool.id}`);
  await expect(alert(page, "bu hesaba ait olmayabilir")).toBeVisible();
  await page.goto("/pool?id=bad");
  await expect(alert(page, "kimliği geçersiz")).toBeVisible();
  await page.goto("/pool");
  await expect(page.getByRole("heading", { name: "Havuz", level: 1 })).toBeVisible();
  const posts: string[] = [];
  page.on("request", r => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/pools") posts.push(r.url());
  });
  const input = page.getByLabel("Yeni havuz adı", { exact: true });
  const create = page.getByRole("button", { name: "Havuz oluştur", exact: true });
  const name = `AAA Kaybolan yanıt ${tag()}`;
  await input.fill(name);
  await context.setOffline(true);
  await create.click();
  await expect(alert(page, "Bağlantı yok")).toBeVisible();
  expect(posts).toHaveLength(0);
  await context.setOffline(false);
  // Sunucu havuzu gerçekten açar, tarayıcı yanıtı alamaz.
  await page.route("**/api/pools", async route => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fetch();
    await route.abort("failed");
  });
  const lists: string[] = [];
  page.on("request", r => {
    if (r.method() === "GET" && new URL(r.url()).pathname === "/api/pools") lists.push(r.url());
  });
  await create.click();
  await expect(alert(page, "ikinci bir kayıt")).toBeVisible();
  expect(posts).toHaveLength(1);
  await expect(create).toBeDisabled();
  await expect(input).toHaveValue(name);
  await expect.poll(() => lists.length).toBeGreaterThan(0);
  await expect(
    page.getByRole("list", { name: "Havuz listesi" }).getByRole("button").filter({ hasText: name }),
  ).toBeVisible();
  await page.unroute("**/api/pools");
  await auditTask(page, "pools-lost-response", "collections");
  await page.getByRole("button", { name: "Listeyi kontrol ettim, formu aç", exact: true }).click();
  expect(posts).toHaveLength(1);
  const created = await api.get(`/api/pools?search=${encodeURIComponent(name)}`);
  expect((await created.json()).total).toBe(1);
  await input.fill("   ");
  await expect(create).toHaveCount(0);
  await input.press("Enter");
  await expect(page.getByText("Bir ad yaz.")).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  expect(posts).toHaveLength(1);
  const spaced = `Boşluklu ${tag()}`;
  await input.fill(`   ${spaced}   `);
  await create.click();
  await expect(confirmed(page, `Havuz oluşturuldu: ${spaced}`)).toHaveCount(1);
  const trimmed = await current("pools", new URL(page.url()).searchParams.get("id")!);
  expect(trimmed.name).toBe(spaced);
  expect(trimmed.description).toBeNull();
});

test("archived-only membership, keyboard, narrow and wide layouts stay truthful and usable", async ({ page }, info) => {
  const run = tag();
  const project = await resource(
    "projects",
    `Uzun proje ${run} ${"oldukça uzun bir proje adı ".repeat(7)}`.slice(0, 200),
  );
  const old = await task(`Arşivli iş ${run}`);
  await classify(old.id, { projectId: project.id });
  expect(
    (await api.post(`/api/tasks/${old.id}/archive`, { data: { version: (await getTask(old.id)).version } })).status(),
  ).toBe(200);
  const widths = info.project.name === "chromium" ? [320, 390, 768, 1199, 1440] : [info.project.use.viewport!.width];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/projects?search=${encodeURIComponent(`Uzun proje ${run}`)}`);
    const item = page
      .getByRole("list", { name: "Projeler listesi" })
      .getByRole("button")
      .filter({ hasText: `Uzun proje ${run}` });
    await expect(item).toBeVisible();
    await noOverflow(page);
    await expect(page.getByRole("navigation", { name: "Projeler sayfaları" })).toHaveCount(0);
    await item.focus();
    await page.keyboard.press("Enter");
    await expect(heading(page, "projects")).toBeFocused();
    await expect(heading(page, "projects")).toHaveText(project.name);
    await noOverflow(page);
    await expect(page.getByText("Bu projede arşivlenmemiş görev yok.", { exact: false })).toBeVisible();
    await expect(metric(page, "Proje iş yükü", "Görev")).toHaveText("0");
    const back = page.getByRole("button", { name: "Projeler listesine dön", exact: true });
    if (await back.isVisible()) {
      await expect(item).toBeHidden();
      const box = await back.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(info.project.name.startsWith("mobile") ? 44 : 32);
      await back.click();
      await expect(item).toBeFocused();
      // Geri bittikten sonra odak satırda kalmalı. Geç gelen atlama bağlantısı veya belge odağına gitmemeli.
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      await expect(item).toBeFocused();
    } else await expect(item).toHaveAttribute("aria-current", "true");
  }
  await auditTask(page, "projects-layout", "collections");
  await page.screenshot({ path: `${evidence}/projects-layout-${info.project.name}.png`, fullPage: true });
});

for (const kind of ["projects", "pools"] as const) {
  test(`${kind}: checkbox selection saves immediately, preserves other links and children, removes without confirmation`, async ({
    page,
  }, info) => {
    const run = tag();
    const item = await resource(kind, `Seçim ${run}`);
    const other = await resource(kind === "projects" ? "pools" : "projects", `Diğer bağ ${run}`);
    const previous = await resource(kind, `Önceki grup ${run}`);
    const chosen = await task(`Seçilecek ${run} ${"uzun görev başlığı ".repeat(8)}`);
    const nested = await child(chosen.id, `Alt görev ${run}`);
    const category = await api.post("/api/categories", { data: { name: `Kategori ${run}` } });
    const label = await api.post("/api/tags", { data: { name: `Etiket ${run}` } });
    expect(category.status()).toBe(201);
    expect(label.status()).toBe(201);
    const categoryId = (await category.json()).id;
    const tagId = (await label.json()).id;
    const field = kind === "projects" ? "projectId" : "poolId";
    const otherField = kind === "projects" ? "poolId" : "projectId";
    expect(
      (
        await api.put(`/api/tasks/${chosen.id}/classification`, {
          data: {
            version: (await getTask(chosen.id)).version,
            [field]: previous.id,
            [otherField]: other.id,
            categoryId,
            tagIds: [tagId],
            applyToSubtree: false,
          },
        })
      ).status(),
    ).toBe(200);
    const total = await totalTasks();
    const writes: string[] = [];
    let dialogs = 0;
    page.on("dialog", async dialog => {
      dialogs++;
      await dialog.dismiss();
    });
    page.on("request", r => {
      if (r.method() === "PUT" && r.url().includes(`/tasks/${chosen.id}/classification`)) writes.push(r.url());
    });
    await page.goto(`${kind === "projects" ? "/projects" : "/pool"}?id=${item.id}`);
    await expect(heading(page, kind)).toHaveText(item.name);
    await page.getByRole("button", { name: "Görev ekle", exact: true }).click();
    const search = page.getByRole("searchbox", { name: "Görevlerde ara", exact: true });
    await expect(search).toBeFocused();
    await search.fill(`Seçilecek ${run}`);
    const checkbox = page.getByRole("checkbox", { name: chosen.title, exact: true });
    await expect(checkbox).toBeEnabled();
    await expect(
      page.getByText(kind === "projects" ? "Diğer projeden buraya taşınır" : "Diğer havuzdan buraya taşınır"),
    ).toBeVisible();
    await checkbox.focus();
    const followUp = await holdReads(page, /\/api\/tasks\?/);
    try {
      await page.keyboard.press("Space");
      await expect(checkbox).toBeChecked();
      await expect(checkbox).toBeFocused();
      await expect.poll(followUp.held).toBeGreaterThan(0);
    } finally {
      await followUp.release();
    }
    await expect(metric(page, kind === "projects" ? "Proje iş yükü" : "Havuz iş yükü", "Görev")).toHaveText("1");
    expect(writes).toHaveLength(1);
    const saved = await api.get(`/api/tasks/${chosen.id}/classification`);
    expect((await saved.json()).values).toEqual({
      [field]: item.id,
      [otherField]: other.id,
      categoryId,
      tagIds: [tagId],
    });
    expect((await getTask(nested.id))[field]).toBeNull();
    expect(await totalTasks()).toBe(total);
    await noOverflow(page);
    await auditTask(page, `${kind}-checkbox`, "collection-tasks");
    await page.screenshot({ path: `${evidence}/${kind}-checkbox-${info.project.name}.png`, fullPage: true });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await auditTask(page, `${kind}-checkbox-dark`, "collection-tasks", "dark");
    await page.screenshot({ path: `${evidence}/${kind}-checkbox-dark-${info.project.name}.png`, fullPage: true });
    await page.reload();
    await page.getByRole("button", { name: "Görev ekle", exact: true }).click();
    await page.getByRole("searchbox", { name: "Görevlerde ara", exact: true }).fill(`Seçilecek ${run}`);
    await expect(checkbox).toBeChecked();
    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
    expect((await getTask(chosen.id))[field]).toBeNull();
    expect(writes).toHaveLength(2);
    expect(dialogs).toBe(0);
    await expect(page.getByRole("link", { name: "Görev listesinde bu filtreyle aç" })).toHaveCount(0);
    await page.getByRole("button", { name: "Görev seçimini kapat", exact: true }).click();
    await expect(page.getByRole("button", { name: "Görev ekle", exact: true })).toBeFocused();
    await expect(page.getByRole("region", { name: /için görev seç/ })).toHaveCount(0);
  });
}

test("collection pickers exclude routine occurrences on the server while daily planning keeps them", async ({
  page,
}) => {
  const prefix = `Seçim kaynağı ${tag()}`;
  const date = Temporal.Now.zonedDateTimeISO("Europe/Istanbul").toPlainDate().add({ days: 1 }).toString();
  const normal = await task(`${prefix} normal`);
  const routineTitle = `${prefix} rutin`;
  const created = await api.post("/api/recurrence-templates", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      rule: {
        startDate: date,
        untilDate: date,
        timeZoneId: "Europe/Istanbul",
        frequency: "Daily",
        autoAddToPlan: true,
      },
      task: { title: routineTitle, estimatedSeconds: 600 },
    },
  });
  expect(created.status()).toBe(201);
  const { template } = await created.json();
  const generated = await api.post(`/api/recurrence-templates/${template.id}/materialize`, {
    headers: { "Idempotency-Key": randomUUID() },
    data: { version: template.version, fromDate: date, toDate: date },
  });
  expect(generated.status()).toBe(200);
  const { occurrences } = await generated.json();
  expect(occurrences[0].taskId).toBeTruthy();

  for (const [kind, path] of [
    ["projects", "/projects"],
    ["pools", "/pool"],
  ] as const) {
    const item = await resource(kind, `${prefix} ${kind}`);
    await page.goto(`${path}?id=${item.id}`);
    const initial = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === "/api/tasks" && !url.searchParams.has("projectId") && !url.searchParams.has("poolId");
    });
    await page.getByRole("button", { name: "Görev ekle", exact: true }).click();
    expect(new URL((await initial).url()).searchParams.get("excludeRecurring")).toBe("true");
    const searched = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === "/api/tasks" && url.searchParams.get("search") === prefix;
    });
    await page.getByRole("searchbox", { name: "Görevlerde ara", exact: true }).fill(prefix);
    const response = await searched;
    expect(response.status()).toBe(200);
    const results = await response.json();
    expect(Number(results.total)).toBe(1);
    expect(results.items.map((item: Task) => item.id)).toEqual([normal.id]);
    const picker = page.getByRole("region", { name: /için görev seç/ });
    await expect(picker.getByRole("checkbox", { name: normal.title, exact: true })).toBeEnabled();
    await expect(picker.getByRole("checkbox", { name: routineTitle, exact: true })).toHaveCount(0);
  }

  await page.goto(`/recurrences?templateId=${template.id}`);
  await expect(page.getByRole("region", { name: "Seçili seri", exact: true })).toContainText(routineTitle);
  await page.goto(`/planning?date=${date}`);
  await expect(page.getByRole("checkbox", { name: `${routineTitle} plan öğesi bitti`, exact: true })).toBeVisible();
});

test("pools: lost membership response and 409 require GET reconciliation without replay; offline never saves", async ({
  page,
  context,
}) => {
  const run = tag();
  const item = await resource("pools", `Güvenli seçim ${run}`);
  const chosen = await task(`Güvenli görev ${run}`);
  const endpoint = `**/api/tasks/${chosen.id}/classification`;
  let puts = 0;
  page.on("request", r => {
    if (r.method() === "PUT" && r.url().endsWith(`/tasks/${chosen.id}/classification`)) puts++;
  });
  await page.goto(`/pool?id=${item.id}`);
  await page.getByRole("button", { name: "Görev ekle", exact: true }).click();
  await page.getByRole("searchbox", { name: "Görevlerde ara", exact: true }).fill(chosen.title);
  const checkbox = page.getByRole("checkbox", { name: chosen.title, exact: true });
  await expect(checkbox).toBeEnabled();
  await context.setOffline(true);
  await checkbox.click();
  await expect(alert(page, "Bağlantı yok")).toBeVisible();
  expect(puts).toBe(0);
  await expect(checkbox).not.toBeChecked();
  await context.setOffline(false);
  await page.route(endpoint, async route => {
    if (route.request().method() !== "PUT") return route.continue();
    await route.fetch();
    await route.abort("failed");
  });
  await checkbox.click();
  await expect(alert(page, "otomatik tekrar gönderilmedi")).toBeVisible();
  await expect(checkbox).toBeDisabled();
  expect(puts).toBe(1);
  expect((await getTask(chosen.id)).poolId).toBe(item.id);
  await page.unroute(endpoint);
  await page.getByRole("button", { name: "Güncel görev bağını kontrol et", exact: true }).click();
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeEnabled();
  expect(puts).toBe(1);
  // Sınıflama okumasından sonra PUT ulaşmadan gerçek görev sürümünü ilerletiyoruz.
  await page.route(endpoint, async route => {
    if (route.request().method() !== "PUT") return route.continue();
    const latest = await getTask(chosen.id);
    expect(
      (
        await api.put(`/api/tasks/${chosen.id}`, {
          data: {
            version: latest.version,
            title: latest.title,
            description: "Başka istemci",
            priority: latest.priority,
            deadlineAt: latest.deadlineAt,
            canSplit: latest.canSplit,
          },
        })
      ).status(),
    ).toBe(200);
    await route.continue();
  });
  await checkbox.click();
  await expect(alert(page, "Görev başka bir yerde değişti")).toBeVisible();
  await expect(checkbox).toBeChecked();
  expect(puts).toBe(2);
  await page.unroute(endpoint);
  await page.getByRole("button", { name: "Güncel görev bağını kontrol et", exact: true }).click();
  await expect(checkbox).toBeEnabled();
  expect(puts).toBe(2);
  expect((await getTask(chosen.id)).poolId).toBe(item.id);
});

test("projects: task selection paginates, searches, omits archived tasks and works at 320px", async ({ page }) => {
  const run = tag();
  const item = await resource("projects", `Sayfalı seçim ${run}`);
  for (let i = 0; i < 26; i++) await task(`Sayfa ${run} ${String(i).padStart(2, "0")}`);
  const old = await task(`Arşivli seçim ${run}`);
  expect((await api.post(`/api/tasks/${old.id}/archive`, { data: { version: old.version } })).status()).toBe(200);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(`/projects?id=${item.id}`);
  await page.getByRole("button", { name: "Görev ekle", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Görevlerde ara", exact: true });
  await search.fill(`Sayfa ${run}`);
  await expect(page.getByRole("checkbox", { name: `Sayfa ${run} 00`, exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Seçilebilir görevler" }).getByRole("checkbox")).toHaveCount(25);
  const pages = page.getByRole("navigation", { name: "Görev seçimi sayfaları" });
  await pages.getByRole("button", { name: "Sonraki", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: `Sayfa ${run} 25`, exact: true })).toBeVisible();
  await pages.getByRole("button", { name: "Önceki", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: `Sayfa ${run} 00`, exact: true })).toBeVisible();
  await search.fill(old.title);
  await expect(page.getByText("Bu aramada görev yok. Başka bir adla arayabilirsin.")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: old.title, exact: true })).toHaveCount(0);
  await noOverflow(page);
});

test("pools: extension text replacement cannot crash picker close or navigate away", async ({ page }) => {
  const item = await resource("pools", `Eklenti testi ${tag()}`);
  const chosen = await task(`Seçim testi ${tag()}`);
  await page.goto(`/pool?id=${item.id}`);
  await page.getByRole("button", { name: "Görev ekle", exact: true }).click();
  await page.getByRole("searchbox", { name: "Görevlerde ara", exact: true }).fill(chosen.title);
  const checkbox = page.getByRole("checkbox", { name: chosen.title, exact: true });
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  const before = page.url();
  const close = page.getByRole("button", { name: "Görev seçimini kapat", exact: true });
  expect(await rewriteExtensionText(close)).toBeGreaterThan(0);
  await close.click();
  await expect(page.getByRole("button", { name: "Görev ekle", exact: true })).toBeVisible();
  await expect(heading(page, "pools")).toHaveText(item.name);
  expect(page.url()).toBe(before);
  await expect(page.getByRole("heading", { name: "Bu ekran açılamadı", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Havuz için görev seç", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `${chosen.title} ayrıntısını aç`, exact: true })).toBeVisible();
});

test("projects: leaf progress refreshes on completion, subtree completion and reopening without reload", async ({
  page,
}) => {
  const run = tag();
  const project = await resource("projects", `İlerleme ${run}`);
  const root = await task(`Ana ${run}`);
  const first = await child(root.id, `Birinci ${run}`);
  const second = await child(root.id, `İkinci ${run}`);
  await classify(root.id, { projectId: project.id });
  // Yerel yazıdan sonra yenileme SignalR bağlantısına bağlı olmamalı.
  await page.route("**/api/hubs/planner/negotiate?**", route => route.abort());
  await page.goto(`/projects?id=${project.id}`);
  const item = page
    .getByRole("list", { name: "Projeler listesi", includeHidden: true })
    .getByRole("button", { includeHidden: true })
    .filter({ hasText: project.name });
  await expect(item.locator(".resource-progress")).toHaveText("0/2");
  await expect(metric(page, "Proje iş yükü", "Görev")).toHaveText("2");
  await expect(page.locator(".resource-task-count")).toHaveText("2");
  const firstCheck = page.getByRole("checkbox", { name: `${first.title} tamamlandı`, exact: true });
  await firstCheck.click();
  await expect(firstCheck).toBeChecked();
  await expect(item.locator(".resource-progress")).toHaveText("1/2");
  await expect(item.locator(".resource-summary")).toContainText("1 açık");
  await page.getByRole("checkbox", { name: `${root.title} tamamlandı`, exact: true }).click();
  await expect(item.locator(".resource-progress")).toHaveText("2/2");
  await expect(item.locator(".resource-summary")).toContainText("0 açık");
  const secondCheck = page.getByRole("checkbox", { name: `${second.title} tamamlandı`, exact: true });
  await expect(secondCheck).toBeEnabled();
  await secondCheck.click();
  await expect(secondCheck).not.toBeChecked();
  await expect(item.locator(".resource-progress")).toHaveText("1/2");
});

test("projects: a committed completion with a lost response is confirmed by GET without replay or a stale warning", async ({
  page,
}) => {
  const project = await resource("projects", `Kayıp yanıt ${tag()}`);
  const chosen = await task(`Doğrulanan ${tag()}`);
  await classify(chosen.id, { projectId: project.id });
  let writes = 0;
  let inspections = 0;
  const before = await getTask(chosen.id);
  await page.route(`**/api/tasks/${chosen.id}`, async route => {
    inspections++;
    // Yanıt kaybının hemen ardından ilk GET hâlâ eski durumu görebilir.
    if (inspections === 1) return route.fulfill({ json: before });
    await route.continue();
  });
  await page.route(`**/api/tasks/${chosen.id}/state`, async route => {
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort("failed");
  });
  await page.goto(`/projects?id=${project.id}`);
  const checkbox = page.getByRole("checkbox", { name: `${chosen.title} tamamlandı`, exact: true });
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeEnabled();
  await expect(alert(page, "İşlemin sonucu alınamadı")).toHaveCount(0);
  await expect(page.locator(".resource-progress").filter({ hasText: "1/1" })).toHaveCount(1);
  expect(writes).toBe(1);
  expect(inspections).toBe(2);
});

test("projects: an unconfirmed completion stays blocked until a successful inspection and is never replayed", async ({
  page,
}) => {
  const project = await resource("projects", `Belirsiz ${tag()}`);
  const chosen = await task(`Kontrol ${tag()}`);
  await classify(chosen.id, { projectId: project.id });
  let writes = 0;
  page.on("request", r => {
    if (r.method() === "POST" && r.url().endsWith(`/tasks/${chosen.id}/state`)) writes++;
  });
  const endpoint = `**/api/tasks/${chosen.id}/state`;
  await page.route(endpoint, route => route.abort("failed"));
  await page.goto(`/projects?id=${project.id}`);
  const checkbox = page.getByRole("checkbox", { name: `${chosen.title} tamamlandı`, exact: true });
  await checkbox.click();
  await expect(alert(page, "İşlemin sonucu alınamadı")).toBeVisible();
  await expect(checkbox).not.toBeChecked();
  await expect(checkbox).toBeDisabled();
  expect(writes).toBe(1);
  await page.unroute(endpoint);
  await page.getByRole("button", { name: "Güncel görev durumunu kontrol et", exact: true }).click();
  await expect(checkbox).toBeEnabled();
  expect(writes).toBe(1);
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  expect(writes).toBe(2);
});

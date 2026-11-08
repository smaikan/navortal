import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  expect,
  test,
  request as apiRequest,
  type APIRequestContext,
  type CDPSession,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./helpers/session";
import type { Task } from "../../src/features/tasks/model";
import { EVIDENCE } from "./helpers/evidence";
import { trackFaults } from "./helpers/faults";
import { registerFixture } from "./helpers/fixture-account";

// Görev ağacı: yerinde çocuk ekleme, bitir/ekle/sil menüsü, hemen sürükleme ve Alt+ok taşıması.
test.describe.configure({ mode: "default" });
let setup: APIRequestContext;
let token: string;
let root: Task;
let chain: Task;
const faults = new WeakMap<Page, string[]>();
async function create(title: string, priority?: Task["priority"]): Promise<Task> {
  const r = await setup.post("/api/tasks", { data: { title, priority } });
  expect(r.status()).toBe(201);
  return r.json();
}
async function child(parentId: string, title: string): Promise<Task> {
  const parent = await setup.get(`/api/tasks/${parentId}`);
  expect(parent.status()).toBe(200);
  const r = await setup.post(`/api/tasks/${parentId}/children`, {
    data: { parentVersion: (await parent.json()).version, title, parentWorkDisposition: "PreserveDirect" },
  });
  expect(r.status()).toBe(201);
  return r.json();
}
const get = async (id: string): Promise<Task> => (await setup.get(`/api/tasks/${id}`)).json();
/** Yeni kökler 1000 kaydın sonuna gider. Senaryo kökünü ilk sayfada görmek için öne koyuyoruz. */
async function top(title: string, priority?: Task["priority"]): Promise<Task> {
  const task = await create(title, priority);
  const r = await setup.post(`/api/tasks/${task.id}/move`, {
    data: {
      version: task.version,
      parentTaskId: null,
      parentVersion: null,
      beforeSiblingId: root.id,
      parentWorkDisposition: null,
    },
  });
  expect(r.status()).toBe(200);
  return r.json();
}
const order = async (parentId: string | null) =>
  (
    (await (await setup.get(`/api/tasks/children${parentId ? `?parentId=${parentId}` : "?limit=100"}`)).json())
      .items as Task[]
  ).map(x => x.id);
test.beforeAll(async ({ browser, browserName }, info) => {
  const register = await apiRequest.newContext({ baseURL: "http://127.0.0.1:5182" });
  const auth = await registerFixture(register, "/api/auth/register", {
    data: { email: `tree-${randomUUID()}@example.test`, password: randomUUID() },
  });
  expect(auth.status()).toBe(201);
  token = (await auth.json()).accessToken;
  setup = await apiRequest.newContext({
    baseURL: "http://127.0.0.1:5182",
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  await register.dispose();
  expect((await setup.get(`${process.env.UI_E2E_BASE_URL ?? "http://127.0.0.1:3400"}/api/auth/me`)).status()).toBe(200);
  root = await create("Proje taslağı");
  const first = await child(root.id, "İlk küçük adım");
  await child(root.id, "İkinci küçük adım");
  await child(root.id, "Üçüncü küçük adım");
  await child(first.id, "İlk alt adım");
  await child(first.id, "İkinci alt adım");
  const bulk = await create("Toplu kök 0000");
  chain = await create("Derin 000");
  if (!/^adhd_ui_test_[a-f0-9]{32}$/.test(process.env.PGDATABASE ?? "") || !process.env.ADHD_UI_TEST_PSQL)
    throw new Error("Owned DB fixture unavailable");
  const sql = `INSERT INTO tasks SELECT (jsonb_populate_record(null::tasks,to_jsonb(seed)||jsonb_build_object('Id',gen_random_uuid(),'Title','Toplu kök '||lpad(i::text,4,'0'),'SortOrder',(i+1000)*1024))).* FROM tasks seed CROSS JOIN generate_series(1,999) i WHERE seed."Id"=:'bulk'::uuid;
  WITH RECURSIVE chain(depth,id,parent) AS (SELECT 1,gen_random_uuid(),:'chain'::uuid UNION ALL SELECT depth+1,gen_random_uuid(),id FROM chain WHERE depth<127)
  INSERT INTO tasks SELECT (jsonb_populate_record(null::tasks,to_jsonb(seed)||jsonb_build_object('Id',chain.id,'ParentTaskId',chain.parent,'Title','Derin '||lpad(chain.depth::text,3,'0'),'SortOrder',1024))).* FROM chain CROSS JOIN tasks seed WHERE seed."Id"=:'chain'::uuid;`;
  execFileSync(
    process.env.ADHD_UI_TEST_PSQL,
    ["--no-psqlrc", "--set=ON_ERROR_STOP=1", `--set=bulk=${bulk.id}`, `--set=chain=${chain.id}`],
    { input: sql, stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
  );
  writeFileSync(
    `${EVIDENCE}/environment-tree-${info.project.name}.json`,
    JSON.stringify(
      {
        buildId: readFileSync(`${process.env.UI_E2E_BUILD_DIR ?? ".next"}/BUILD_ID`, "utf8").trim(),
        browserName,
        browserVersion: browser.version(),
        node: process.version,
        project: info.project.name,
        viewport: info.project.use.viewport,
        fixture: "real 3children/2grandchildren HTTP tree; owned DB bulk1000 roots +128depth chain; all user auth real",
      },
      null,
      2,
    ),
  );
});
test.afterAll(async () => {
  await setup?.dispose();
});
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  faults.set(page, errors);
  trackFaults(page, errors);
  await signIn(page, token);
});
test.afterEach(({ page }) => {
  expect(faults.get(page)).toEqual([]);
});
async function audit(page: Page, name: string, scope?: string) {
  const scan = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]);
  if (scope) scan.include(scope);
  const r = await scan.analyze();
  writeFileSync(
    `${EVIDENCE}/axe-tree-${test.info().project.name}-${name}.json`,
    JSON.stringify({ violations: r.violations, incomplete: r.incomplete }, null, 2),
  );
  expect(r.violations.map(x => ({ id: x.id, nodes: x.nodes.map(n => n.target) }))).toEqual([]);
  expect(r.incomplete).toEqual([]);
}
const tree = (page: Page) => page.getByRole("region", { name: "Görev ağacı", exact: true });
const title = (page: Page, text: string) => page.getByRole("button", { name: `${text} ayrıntısını aç`, exact: true });
const row = (page: Page, text: string) => page.locator("[data-task-row]").filter({ has: title(page, text) });
async function expand(page: Page, text: string) {
  const toggle = page.getByRole("button", { name: `${text} alt görevlerini göster`, exact: true });
  await toggle.click();
  await expect(page.getByRole("button", { name: `${text} alt görevlerini gizle`, exact: true })).toBeVisible();
}
async function menu(page: Page, text: string, item: string) {
  await row(page, text).hover();
  await page.getByRole("button", { name: `${text} işlemleri`, exact: true }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

test("priority and effort are visibly distinct in the tree and filtered results", async ({ page }, info) => {
  const task = await top("Öncelik ve efor ayrı etiket", "High");
  const saved = await setup.put(`/api/tasks/${task.id}/energy`, {
    data: { version: task.version, energyDemand: "High" },
  });
  expect(saved.status()).toBe(200);
  if (info.project.name === "mobile-chromium") await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/tasks");
  const rootRow = row(page, task.title);
  const checkBadges = async (scope: typeof rootRow) => {
    const priority = scope.getByText("Öncelik: Yüksek", { exact: true });
    const effort = scope.getByText("Efor: Yüksek", { exact: true });
    await expect(priority).toBeVisible();
    await expect(effort).toBeVisible();
    await expect(priority.locator("svg")).toBeVisible();
    await expect(effort.locator("svg")).toBeVisible();
    const color = await priority.evaluate(el => getComputedStyle(el).color);
    expect(await effort.evaluate(el => getComputedStyle(el).color)).not.toBe(color);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  };
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => (document.documentElement.dataset.theme = value), theme);
    await checkBadges(rootRow);
    await audit(page, `row-levels-${theme}`, "#main");
    await rootRow.screenshot({ path: `${EVIDENCE}/row-levels-${info.project.name}-${theme}.png` });
  }
  await page.goto(`/tasks?search=${encodeURIComponent(task.title)}&priority=High&energyDemand=High`);
  const results = page.getByRole("region", { name: "Arama sonuçları", exact: true });
  await checkBadges(results);
  await expect(page.getByLabel("Önceliğe göre süz").locator("option:checked")).toHaveText("Yüksek öncelik");
  await expect(page.getByLabel("Efora göre süz").locator("option:checked")).toHaveText("Yüksek efor");
});

test(
  "soft tree: paged roots, lazy children with row facts, keyboard disclosure and panel focus",
  { tag: "@smoke" },
  async ({ page }, info) => {
    const reads: { parent: string | null; completed: string | null; offset: string | null; count: number }[] = [];
    page.on("response", async response => {
      const url = new URL(response.url());
      if (response.ok() && response.request().method() === "GET" && url.pathname === "/api/tasks/children") {
        const body = await response.json();
        reads.push({
          parent: url.searchParams.get("parentId"),
          completed: url.searchParams.get("completed"),
          offset: url.searchParams.get("offset"),
          count: body.items.length,
        });
      }
    });
    await page.goto("/tasks");
    await expect(title(page, root.title)).toBeVisible();
    await expect(tree(page).getByRole("button", { name: / ayrıntısını aç$/ })).toHaveCount(25);
    // Bağlantı ilk sayfayı bir kere yenileyebilir, Firefox geç bağlanabilir. Başka sayfa veya üst okunmamalı.
    expect(
      [...new Set(reads.filter(r => r.completed === "false").map(r => JSON.stringify(r)))].map(r => JSON.parse(r)),
    ).toEqual([{ parent: null, completed: "false", offset: "0", count: 25 }]);
    await expect(page.getByRole("button", { name: "Ağaç", exact: true })).toHaveCount(0);
    // Bağlantı telafisi ilk sayfayı yenilerken gelen sonraki sayfa isteği iptal edilir; önce sakinleşsin.
    await expect(page.locator('[data-sync-state="connected"]')).toHaveCount(1);
    await page.waitForLoadState("networkidle");
    await tree(page).getByRole("button", { name: "Daha fazla göster", exact: true }).click();
    await expect(tree(page).getByRole("button", { name: / ayrıntısını aç$/ })).toHaveCount(50);
    await expect(row(page, root.title).locator(".r2-progress")).toContainText("0/33 alt görevden 0 tamamlandı");
    await expect(page.getByRole("button", { name: "Toplu kök 0000 alt görevlerini göster", exact: true })).toHaveCount(
      0,
    );
    await expand(page, root.title);
    await expect(title(page, "Üçüncü küçük adım")).toBeVisible();
    const first = title(page, "İlk küçük adım");
    await title(page, root.title).focus();
    await page.keyboard.press("ArrowDown");
    await expect(first).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(title(page, "İkinci alt adım")).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(title(page, "İkinci alt adım")).toHaveCount(0);
    await audit(page, "expanded");
    await page.screenshot({ path: `${EVIDENCE}/tree-expanded-${info.project.name}.png` });
    const details = title(page, "İkinci küçük adım");
    await details.click();
    await expect(page.getByLabel("Görev başlığı", { exact: true })).toHaveValue("İkinci küçük adım");
    await page.goBack();
    await expect(details).toBeFocused();
    for (const width of info.project.name === "chromium"
      ? [320, 390, 768, 1199, 1440, 1920]
      : [info.project.use.viewport!.width]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await page.screenshot({ path: `${EVIDENCE}/tree-${info.project.name}-${width}.png` });
    }
    writeFileSync(`${EVIDENCE}/tree-reads-${info.project.name}.json`, JSON.stringify(reads, null, 2));
  },
);

test("the task panel follows row clicks and the menu does not select a task", async ({ page }, info) => {
  await page.goto("/tasks");
  const first = title(page, root.title);
  const second = title(page, chain.title);
  const secondRow = row(page, chain.title);
  const secondMenu = page.getByRole("button", { name: `${chain.title} işlemleri`, exact: true });
  const mobile = info.project.name === "mobile-chromium";
  const panel = page.getByRole(mobile ? "dialog" : "complementary", { name: "Görev ayrıntısı", exact: true });
  const editor = panel.getByRole("textbox", { name: "Görev başlığı", exact: true });
  if (!mobile) await secondRow.hover();
  await secondMenu.click();
  await expect(secondMenu).toHaveAttribute("aria-expanded", "true");
  await expect(second).not.toHaveAttribute("aria-current", "true");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  await first.click();
  await expect(editor).toHaveValue(root.title);
  const current = page.locator(".r2-title[aria-current=true]");
  await expect(current).toHaveText(root.title);
  await expect(current.locator("..")).toHaveCSS("background-color", "rgb(235, 244, 255)");
  await audit(page, "task-panel-selection");
  if (!mobile) {
    await secondRow.hover();
    await secondMenu.click();
    await expect(editor).toHaveValue(root.title);
    await expect(current).toHaveText(root.title);
    await page.keyboard.press("Escape");
    await expect(editor).toHaveValue(root.title);

    await second.click();
    await expect(editor).toHaveValue(chain.title);
    await expect(current).toHaveText(chain.title);
    await expect(first).not.toHaveAttribute("aria-current", "true");
    await expect(page).toHaveURL(new RegExp(`taskId=${chain.id}$`));
  }

  await page.goBack();
  await expect(panel).toHaveCount(0);
  await expect(current).toHaveCount(0);
  await expect(mobile ? first : second).toBeFocused();
});

test("deep chains expand level by level without horizontal overflow", async ({ page }, info) => {
  await page.goto("/tasks");
  let current = "Derin 000";
  for (let depth = 1; depth <= 12; depth++) {
    await expand(page, current);
    current = `Derin ${String(depth).padStart(3, "0")}`;
    await expect(title(page, current)).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: `${EVIDENCE}/tree-depth-${info.project.name}.png` });
  await audit(page, "deep");
});

test("branch read errors recover in place", async ({ page }) => {
  const children = (url: URL) => url.pathname === "/api/tasks/children";
  await page.route(children, route =>
    route.fulfill({ status: 503, contentType: "application/problem+json", body: JSON.stringify({ status: 503 }) }),
  );
  await page.goto("/tasks");
  await expect(tree(page).getByRole("alert")).toContainText("Görev ağacı alınamadı.");
  await page.unroute(children);
  // İlk bağlantı yenilemesi kullanıcıdan önce dalı kurtarabilir.
  const retry = tree(page).getByRole("button", { name: "Yeniden yükle", exact: true });
  if (await retry.isVisible()) await retry.click({ timeout: 3000 }).catch(() => undefined);
  await expect(title(page, root.title)).toBeVisible();
});

test("in-place child entry: Enter keeps going, failures keep the text, unknown results are never replayed, offline never queues", async ({
  page,
  context,
}, info) => {
  const parent = await top(`Ekleme üstü ${info.project.name}`);
  await page.goto("/tasks");
  await menu(page, parent.title, "Alt görev ekle");
  const field = page.getByLabel("Yeni alt görev adı", { exact: true });
  await expect(field).toBeFocused();
  await field.fill("Birinci adım");
  await field.press("Enter");
  await expect(title(page, "Birinci adım")).toBeVisible();
  await expect(field).toHaveValue("");
  await expect(field).toBeFocused();
  let writes = 0;
  await page.route(`**/api/tasks/${parent.id}/children`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    writes++;
    await route.fulfill({
      status: 503,
      contentType: "application/problem+json",
      body: JSON.stringify({ status: 503 }),
    });
  });
  await field.fill("Reddedilen adım");
  await field.press("Enter");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /alınamadı|tamamlanamadı|bağlantını/i })
      .first(),
  ).toBeVisible();
  await expect(field).toHaveValue("Reddedilen adım");
  expect(writes).toBe(1);
  await page.unroute(`**/api/tasks/${parent.id}/children`);
  writes = 0;
  await page.route(`**/api/tasks/${parent.id}/children`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    writes++;
    expect((await route.fetch()).status()).toBe(201);
    await route.abort("failed");
  });
  await field.fill("Gerçekte eklenen adım");
  await field.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Kaydedilmiş olabilir" })).toBeVisible();
  await expect(title(page, "Gerçekte eklenen adım")).toBeVisible();
  expect(writes).toBe(1);
  await page.unroute(`**/api/tasks/${parent.id}/children`);
  await context.setOffline(true);
  await field.fill("Çevrimdışı taslak");
  await field.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Değişiklik gönderilmedi" })).toBeVisible();
  await context.setOffline(false);
  await expect(field).toHaveValue("Çevrimdışı taslak");
  await field.press("Escape");
  await expect(field).toHaveCount(0);
  expect(
    (await (await setup.get(`/api/tasks/children?parentId=${parent.id}`)).json()).items.map((x: Task) => x.title),
  ).toEqual(["Birinci adım", "Gerçekte eklenen adım"]);
  await page.screenshot({ path: `${EVIDENCE}/tree-add-${info.project.name}.png` });
  await audit(page, "add");
});

test("finish from the row menu: subtasks strike in place, roots move to Tamamlananlar and Biten görevler, reopen returns them", async ({
  page,
}, info) => {
  const project = await top(`Bitirme projesi ${info.project.name}`);
  const a = await child(project.id, "Bitirme bir");
  const b = await child(project.id, "Bitirme iki");
  await page.goto("/tasks");
  await expand(page, project.title);
  await row(page, a.title).hover();
  const trigger = page.getByRole("button", { name: `${a.title} işlemleri`, exact: true });
  const childMenu = page.getByRole("menu", { name: `${a.title} işlemleri`, exact: true });
  await trigger.click();
  await expect(childMenu).toBeVisible();
  const labels = await childMenu.getByRole("menuitem").allTextContents();
  const triggerMenuBounds = (await childMenu.boundingBox())!;
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  const taskTitle = title(page, a.title);
  await taskTitle.scrollIntoViewIfNeeded();
  const titleBounds = (await taskTitle.boundingBox())!;
  const position = { x: 12, y: 8 };
  await taskTitle.click({ button: "right", position });
  await expect(childMenu.getByRole("menuitem")).toHaveText(labels);
  await expect
    .poll(async () => {
      const bounds = (await childMenu.boundingBox())!;
      return Math.max(Math.abs(bounds.x - titleBounds.x - position.x), Math.abs(bounds.y - titleBounds.y - position.y));
    })
    .toBeLessThan(2);
  const { width, height } = page.viewportSize()!;
  // Playwright dispatchEvent bu olayda koordinat taşımıyor; gerçek bir MouseEvent gönderiyoruz.
  await taskTitle.evaluate(
    (el, at) =>
      el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y })),
    { x: width - 1, y: height - 1 },
  );
  await expect
    .poll(async () => {
      const bounds = (await childMenu.boundingBox())!;
      return Math.max(Math.abs(width - 8 - bounds.x - bounds.width), Math.abs(height - 8 - bounds.y - bounds.height));
    })
    // Telefonda alt piksel ölçeklemesi köşeyi birkaç piksel kaydırabilir.
    .toBeLessThan(4);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect
    .poll(async () => {
      const bounds = (await childMenu.boundingBox())!;
      return Math.max(Math.abs(bounds.x - triggerMenuBounds.x), Math.abs(bounds.y - triggerMenuBounds.y));
    })
    .toBeLessThan(2);
  await page.keyboard.press("Escape");
  await taskTitle.click({ button: "right", position });
  await childMenu.getByRole("menuitem", { name: "Görevi bitir", exact: true }).click();
  await expect(row(page, a.title)).toHaveClass(/\bdone\b/);
  await expect(row(page, project.title).locator(".r2-progress")).toContainText("1/22 alt görevden 1 tamamlandı");
  expect((await get(a.id)).state).toBe("Completed");
  expect((await get(b.id)).state).toBe("Pending");
  await menu(page, project.title, "Görevi bitir");
  await expect(title(page, project.title)).toHaveCount(0, { timeout: 5000 });
  expect((await get(b.id)).state).toBe("Completed");
  const completed = page.getByRole("region", { name: "Tamamlanan görevler", exact: true });
  await completed.getByRole("button", { name: /Tamamlananlar/ }).click();
  await expect(completed.getByRole("button", { name: `Yeniden aç: ${project.title}`, exact: true })).toBeVisible();
  await audit(page, "completed");
  await page.goto("/tasks/completed");
  await expect(
    page
      .getByRole("region", { name: "Bugün", exact: true })
      .getByRole("button", { name: `${project.title} ayrıntısını aç`, exact: true }),
  ).toBeVisible();
  await audit(page, "done-page");
  await page.screenshot({ path: `${EVIDENCE}/done-page-${info.project.name}.png` });
  await page.getByRole("button", { name: `Yeniden aç: ${project.title}`, exact: true }).click();
  await expect(page.getByRole("button", { name: `Yeniden aç: ${project.title}`, exact: true })).toHaveCount(0);
  expect((await get(project.id)).state).toBe("Pending");
});

test("delete asks nothing, offers Geri al and restores the same subtree", async ({ page }, info) => {
  const project = await top(`Silme projesi ${info.project.name}`);
  await child(project.id, "Silinecek adım");
  const stale = await get(project.id);
  expect(
    (
      await setup.put(`/api/tasks/${project.id}`, {
        data: {
          version: stale.version,
          title: project.title,
          description: "Başka sekmede değişti",
          priority: "High",
          deadlineAt: null,
          canSplit: true,
        },
      })
    ).status(),
  ).toBe(200);
  let prompts = 0;
  page.on("dialog", d => {
    prompts++;
    void d.dismiss();
  });
  await page.goto("/tasks");
  await menu(page, project.title, "Görevi sil");
  await expect(page.getByRole("status").filter({ hasText: "Görev silindi" })).toBeVisible();
  await expect(title(page, project.title)).toHaveCount(0);
  expect(prompts).toBe(0);
  expect((await order(null)).includes(project.id)).toBe(false);
  await page.screenshot({ path: `${EVIDENCE}/delete-toast-${info.project.name}.png` });
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect(title(page, project.title)).toBeVisible();
  await expect(row(page, project.title).locator(".r2-progress")).toContainText("1 alt görevden 0 tamamlandı");
  expect((await get(project.id)).archivedAt).toBeNull();
});

async function drag(
  page: Page,
  cdp: CDPSession | null,
  source: string,
  target: string | "root-end",
  zone: "top" | "middle" | "bottom",
  release = true,
) {
  // Kaydırma dokunma sürerken yapılırsa sürükleme bozulur; kaynağı ve hedefi önce görünür kılıyoruz.
  const end = target === "root-end" ? page.getByText("En üst düzeye, sona bırak", { exact: true }) : row(page, target);
  await title(page, source).evaluate(element => element.scrollIntoView({ block: "center" }));
  // Kök sonu alanı yalnız sürükleme sırasında görünür.
  if (target !== "root-end") await end.evaluate(element => element.scrollIntoView({ block: "nearest" }));
  const from = (await title(page, source).boundingBox())!;
  const x0 = from.x + 20,
    y0 = from.y + from.height / 2;
  if (cdp) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
    // Dokunmada sürükleme 250 ms basılı tutunca başlar; yük altında zamanlayıcı gecikebilir.
    await page.waitForTimeout(600);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0, y: y0 + 4 }] });
  } else {
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x0 + 10, y0, { steps: 3 });
  }
  if (target === "root-end") await end.evaluate(element => element.scrollIntoView({ block: "center" }));
  const box = (await end.boundingBox())!;
  const y =
    target === "root-end"
      ? box.y + box.height / 2
      : zone === "top"
        ? box.y + 3
        : zone === "bottom"
          ? box.y + box.height - 3
          : box.y + box.height / 2;
  const x = box.x + Math.min(160, box.width / 2);
  for (let i = 1; i <= 8; i++) {
    const step = { x: x0 + ((x - x0) * i) / 8, y: y0 + ((y - y0) * i) / 8 };
    if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [step] });
    else await page.mouse.move(step.x, step.y);
  }
  if (target !== "root-end")
    await expect(row(page, target)).toHaveClass(
      new RegExp(`over-${zone === "top" ? "before" : zone === "bottom" ? "after" : "child"}`),
    );
  if (!release) return;
  if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  else await page.mouse.up();
}
test("drag and drop saves at once: before, as child, to the root end; a cycle is refused calmly and Escape cancels", async ({
  page,
  context,
}, info) => {
  const parent = await top(`Sürükleme projesi ${info.project.name}`);
  const a = await child(parent.id, "Sürükleme birinci");
  const b = await child(parent.id, "Sürükleme ikinci");
  const c = await child(parent.id, "Sürükleme üçüncü");
  const cdp = info.project.name === "mobile-chromium" ? await context.newCDPSession(page) : null;
  let writes = 0;
  page.on("request", r => {
    if (r.method() === "POST" && /\/move$/.test(new URL(r.url()).pathname)) writes++;
  });
  await page.goto("/tasks");
  await expand(page, parent.title);
  await drag(page, cdp, c.title, a.title, "top", false);
  await page.keyboard.press("Escape");
  if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  else await page.mouse.up();
  await page.waitForTimeout(300);
  expect(writes).toBe(0);
  expect(await order(parent.id)).toEqual([a.id, b.id, c.id]);
  await drag(page, cdp, c.title, a.title, "top");
  await expect.poll(() => order(parent.id)).toEqual([c.id, a.id, b.id]);
  expect(writes).toBe(1);
  await drag(page, cdp, c.title, b.title, "middle");
  await expect.poll(async () => (await get(c.id)).parentTaskId).toBe(b.id);
  await expect(page.getByRole("button", { name: `${b.title} alt görevlerini gizle`, exact: true })).toBeVisible();
  await audit(page, "dnd");
  await drag(page, cdp, b.title, c.title, "middle");
  await expect(page.getByRole("alert").filter({ hasText: "döngüsü" })).toBeVisible();
  expect((await get(b.id)).parentTaskId).toBe(parent.id);
  await drag(page, cdp, a.title, "root-end", "middle");
  await expect.poll(async () => (await get(a.id)).parentTaskId).toBeNull();
  await page.screenshot({ path: `${EVIDENCE}/dnd-${info.project.name}.png` });
  writeFileSync(
    `${EVIDENCE}/dnd-${info.project.name}.json`,
    JSON.stringify(
      { input: cdp ? "CDP touch long-press in mobile Chromium" : "mouse", cancelledWrites: 0, writes, immediate: true },
      null,
      2,
    ),
  );
  await cdp?.detach();
});

test("Alt+arrows reorder, indent and outdent with focus kept on the moved task", async ({ page }, info) => {
  const parent = await top(`Klavye projesi ${info.project.name}`);
  const x = await child(parent.id, "Klavye x");
  const y = await child(parent.id, "Klavye y");
  const z = await child(parent.id, "Klavye z");
  // Sunucu makbuzu/odak, UI yenilemesi bitti demek değil. Sonraki komut satırın meşgul durumu bitince gelir.
  await page.goto("/tasks");
  await expand(page, parent.title);
  await title(page, z.title).focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => order(parent.id)).toEqual([x.id, z.id, y.id]);
  await expect(title(page, z.title)).toBeFocused();
  await expect(row(page, z.title)).not.toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(async () => (await get(z.id)).parentTaskId).toBe(x.id);
  await expect(title(page, z.title)).toBeFocused();
  await expect(row(page, z.title)).not.toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Alt+ArrowLeft");
  await expect.poll(() => order(parent.id)).toEqual([x.id, z.id, y.id]);
  await expect(title(page, z.title)).toBeFocused();
  await expect(row(page, z.title)).not.toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => order(parent.id)).toEqual([x.id, y.id, z.id]);
});

test("unknown move results are reconciled by reading and never replayed", async ({ page }, info) => {
  const parent = await top(`Belirsiz taşıma ${info.project.name}`);
  const first = await child(parent.id, "Belirsiz bir");
  const second = await child(parent.id, "Belirsiz iki");
  await page.goto("/tasks");
  await expand(page, parent.title);
  let writes = 0;
  await page.route(`**/api/tasks/${second.id}/move`, async route => {
    writes++;
    expect((await route.fetch()).status()).toBe(200);
    await route.abort("failed");
  });
  await title(page, second.title).focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(page.getByRole("alert").filter({ hasText: "Kaydedilmiş olabilir" })).toBeVisible();
  expect(writes).toBe(1);
  await expect.poll(() => order(parent.id)).toEqual([second.id, first.id]);
  await expect(
    page
      .locator(`[data-task-row]`)
      .filter({ hasText: /Belirsiz (bir|iki)/ })
      .first(),
  ).toContainText(second.title);
  expect(writes).toBe(1);
});

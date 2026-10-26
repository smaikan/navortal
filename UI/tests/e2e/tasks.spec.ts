import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, request as apiRequest, type APIRequestContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./helpers/session";
import type { Task } from "../../src/features/tasks/model";
import { EVIDENCE } from "./helpers/evidence";
import { trackFaults } from "./helpers/faults";
import { registerFixture } from "./helpers/fixture-account";

test.describe.configure({ mode: "default" });
let setup: APIRequestContext;
let foreign: string;
let token: string;
const faults = new WeakMap<Page, string[]>();
test.beforeAll(async ({ browser, browserName }, info) => {
  const register = await apiRequest.newContext({ baseURL: "http://127.0.0.1:5182" });
  const auth = await registerFixture(register, "/api/auth/register", {
    data: { email: `tasks-${randomUUID()}@example.test`, password: randomUUID() },
  });
  expect(auth.status()).toBe(201);
  token = (await auth.json()).accessToken;
  setup = await apiRequest.newContext({
    baseURL: "http://127.0.0.1:5182",
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  const other = await registerFixture(register, "/api/auth/register", {
    data: { email: `foreign-${randomUUID()}@example.test`, password: randomUUID() },
  });
  expect(other.status()).toBe(201);
  const foreignTask = await register.post("/api/tasks", {
    headers: { Authorization: `Bearer ${(await other.json()).accessToken}` },
    data: { title: "Başka hesabın işi" },
  });
  expect(foreignTask.status()).toBe(201);
  foreign = (await foreignTask.json()).id;
  await register.dispose();
  const warm = await setup.get(`${process.env.UI_E2E_BASE_URL ?? "http://127.0.0.1:3400"}/api/auth/me`);
  expect(warm.status()).toBe(200);
  const seed = await create("Kayıt 0000");
  // Toplu veri yalnız okuma hazırlığı, koşunun rastgele DB'sinde. Kabuldeki bütün yazılar
  // gerçek HTTP komutları, sürümler, olaylar ve eşgüdüm kilitleriyle yapılır.
  if (
    !/^adhd_ui_test_[a-f0-9]{32}$/.test(process.env.PGDATABASE ?? "") ||
    !process.env.ADHD_UI_TEST_PSQL ||
    !/^\d+$/.test(process.env.PGPORT ?? "")
  )
    throw new Error("Owned DB fixture unavailable");
  execFileSync(process.env.ADHD_UI_TEST_PSQL, ["--no-psqlrc", "--set=ON_ERROR_STOP=1", `--set=seed=${seed.id}`], {
    input: `INSERT INTO tasks SELECT (jsonb_populate_record(null::tasks, to_jsonb(seed) || jsonb_build_object('Id', gen_random_uuid(), 'Title', 'Kayıt ' || lpad(i::text, 4, '0'), 'SortOrder', i * 1024, 'CreatedAt', now() - interval '2 days'))).* FROM tasks seed CROSS JOIN generate_series(1,999) i WHERE seed."Id" = :'seed'::uuid;`,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  writeFileSync(
    `${EVIDENCE}/environment-tasks-${info.project.name}.json`,
    JSON.stringify(
      {
        buildId: readFileSync(`${process.env.UI_E2E_BUILD_DIR ?? ".next"}/BUILD_ID`, "utf8").trim(),
        browserName,
        browserVersion: browser.version(),
        project: info.project.name,
        viewport: info.project.use.viewport,
        node: process.version,
        fixture:
          "1000 task owned DB read fixture + real HTTP writes/JWT/me; response failure scenarios explicitly injected",
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
async function create(title: string, extra: Record<string, unknown> = {}): Promise<Task> {
  const response = await setup.post("/api/tasks", { data: { title, ...extra } });
  expect(response.status()).toBe(201);
  return response.json();
}
async function current(id: string): Promise<Task> {
  const response = await setup.get(`/api/tasks/${id}`);
  expect(response.status()).toBe(200);
  return response.json();
}
async function audit(page: Page, name: string) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const reviewed = [];
  for (const item of result.incomplete) {
    // axe 4.14 üst katman sınırını kapatmıyor, ölçerek inceliyoruz.
    expect(item.id).toBe("color-contrast");
    for (const node of item.nodes) {
      expect(node.any.some(check => check.data?.messageKey === "elmPartiallyObscuring")).toBe(true);
      expect(node.target.length).toBe(1);
      const selector = node.target[0];
      expect([".surface-body > .muted", ".form-error > p"]).toContain(selector);
      const measurement = await page.locator(`dialog[open] ${selector}`).evaluate(element => {
        const text = getComputedStyle(element);
        const background = getComputedStyle(element.parentElement!);
        const channel = (value: number) =>
          value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4;
        const luminance = (color: string) => {
          const numbers = color.match(/[\d.]+/g)!.map(Number);
          return 0.2126 * channel(numbers[0]) + 0.7152 * channel(numbers[1]) + 0.0722 * channel(numbers[2]);
        };
        const front = luminance(text.color);
        const back = luminance(background.backgroundColor);
        const range = document.createRange();
        range.selectNodeContents(element);
        const samples = [...range.getClientRects()].flatMap(rect =>
          [rect.left + 2, rect.left + rect.width / 2, rect.right - 2].map(x => {
            const hit = document.elementFromPoint(x, rect.top + rect.height / 2);
            return hit === element || (hit !== null && element.contains(hit));
          }),
        );
        return {
          foreground: text.color,
          background: background.backgroundColor,
          backgroundImage: background.backgroundImage,
          opaque:
            background.opacity === "1" &&
            [
              "rgb(255, 255, 255)",
              "rgb(242, 242, 242)",
              "rgb(253, 236, 238)",
              "rgb(255, 244, 229)",
              "rgb(235, 244, 255)",
            ].includes(background.backgroundColor),
          ratio: (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05),
          samples,
          nativeModal: element.closest("dialog")!.matches(":modal"),
        };
      });
      expect(measurement.nativeModal).toBe(true);
      expect(measurement.opaque).toBe(true);
      expect(measurement.backgroundImage).toBe("none");
      expect(measurement.ratio).toBeGreaterThanOrEqual(4.5);
      expect(measurement.samples.length).toBeGreaterThan(0);
      expect(measurement.samples.every(Boolean)).toBe(true);
      reviewed.push({
        target: node.target,
        reason:
          "Native modal top-layer overlap measurement reviewed with actual colors and text-line hit tests; visual review also required.",
        measurement,
      });
    }
  }
  writeFileSync(
    `${EVIDENCE}/axe-tasks-${test.info().project.name}-${name}.json`,
    JSON.stringify({ violations: result.violations, incomplete: result.incomplete, reviewed }, null, 2),
  );
  expect(result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
}
const title = (page: Page) => page.getByLabel("Görev başlığı", { exact: true });
const close = (page: Page) => page.getByRole("button", { name: "Görev ayrıntısı panelini kapat", exact: true });
const results = (page: Page) => page.getByRole("region", { name: "Arama sonuçları", exact: true });
async function quickAdd(page: Page) {
  await page.locator(".quick-open").click();
  const dialog = page.getByRole("dialog", { name: "Hızlı görev ekle", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

// Liste/ağaç seçimi veya Kaydet yok. Arama/bağlı filtre düz liste açar; panel alanı çıkışta kaydolur.
test("search over 1000 tasks, quick add and an exact full-field PUT when a panel field is left", async ({
  page,
}, info) => {
  const reads: { search: string | null; limit: string | null; items: number }[] = [];
  page.on("response", async response => {
    const url = new URL(response.url());
    if (url.pathname === "/api/tasks" && response.request().method() === "GET" && response.ok()) {
      const data = await response.json();
      reads.push({
        search: url.searchParams.get("search"),
        limit: url.searchParams.get("limit"),
        items: data.items.length,
      });
    }
  });
  await page.goto("/tasks?date=2026-10-17");
  const search = page.getByRole("searchbox", { name: "Görevlerde ara" });
  await search.fill("Kayıt 0001");
  await expect(page).toHaveURL(/date=2026-10-17&search=Kay/);
  await expect(results(page).getByRole("status")).toHaveText("1 sonuç");
  expect(reads.every(r => r.limit === "50" && r.items <= 50)).toBe(true);
  const row = page.getByRole("button", { name: "Kayıt 0001 ayrıntısını aç", exact: true });
  await row.focus();
  await row.press("Enter");
  await expect(title(page)).toHaveValue("Kayıt 0001");
  await page.goBack();
  await expect(row).toBeFocused();
  await expect(search).toHaveValue("Kayıt 0001");
  const longTitle = "Türkçe uzun görev ".padEnd(300, "a");
  const dialog = await quickAdd(page);
  const input = dialog.getByLabel("Aklındaki işi yaz", { exact: true });
  await input.fill(longTitle);
  await input.press("Enter");
  await expect(dialog.getByRole("status").filter({ hasText: "Görev eklendi." })).toBeVisible();
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  const created = (await (await setup.get("/api/tasks", { params: { search: longTitle.slice(0, 100) } })).json())
    .items[0] as Task;
  expect(created.description).toBeNull();
  expect(created.directEstimatedSeconds).toBeNull();
  // Dokunulmayan açıklama ve tam kayıtlı deadline anı korunur. canSplit daima true gider.
  const seeded = await create(`Korunan alan ${randomUUID()}`, {
    description: "Satır 1\nSatır 2",
    priority: "High",
    canSplit: false,
    deadlineAt: "2026-10-25T01:30:00.1234567Z",
  });
  const preserved = await current(seeded.id);
  await page.goto(`/tasks?date=2026-10-17&taskId=${preserved.id}`);
  await expect(title(page)).toHaveValue(preserved.title);
  const puts: Record<string, unknown>[] = [];
  page.on("request", request => {
    if (request.method() === "PUT" && new URL(request.url()).pathname === `/api/tasks/${preserved.id}`) {
      expect(request.headers()["idempotency-key"]).toBeUndefined();
      puts.push(request.postDataJSON());
    }
  });
  await title(page).fill(longTitle);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("status").filter({ hasText: "Kaydedildi" }).first()).toBeVisible();
  expect(puts).toEqual([
    {
      version: preserved.version,
      title: longTitle,
      description: preserved.description,
      priority: "High",
      canSplit: true,
      deadlineAt: preserved.deadlineAt,
    },
  ]);
  await page.getByLabel("Öncelik", { exact: true }).selectOption("Urgent");
  await expect.poll(() => puts.length).toBe(2);
  expect(puts[1]).toMatchObject({ priority: "Urgent", title: longTitle });
  await expect.poll(async () => (await current(preserved.id)).priority).toBe("Urgent");
  expect(await current(preserved.id)).toMatchObject({
    title: longTitle,
    description: preserved.description,
    deadlineAt: preserved.deadlineAt,
    priority: "Urgent",
  });
  await audit(page, "detail");
  await page.screenshot({ path: `${EVIDENCE}/tasks-detail-${info.project.name}.png`, fullPage: true });
  await close(page).click();
  await expect(close(page)).toHaveCount(0);
  for (const width of info.project.name === "chromium"
    ? [320, 390, 768, 1199, 1440, 1920]
    : [info.project.use.viewport!.width]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflowing: [...document.querySelectorAll("body *")]
        .map(element => ({
          tag: element.tagName,
          classes: element.getAttribute("class"),
          left: element.getBoundingClientRect().left,
          right: element.getBoundingClientRect().right,
        }))
        .filter(rect => rect.right > innerWidth || rect.left < 0)
        .slice(0, 30),
    }));
    writeFileSync(
      `${EVIDENCE}/tasks-search-layout-${info.project.name}-${width}.json`,
      JSON.stringify(layout, null, 2),
    );
    expect(layout.scrollWidth > layout.viewport).toBe(false);
    await page.screenshot({ path: `${EVIDENCE}/tasks-search-${info.project.name}-${width}.png`, fullPage: true });
  }
  await audit(page, "search");
  writeFileSync(`${EVIDENCE}/bounded-tasks-${info.project.name}.json`, JSON.stringify(reads, null, 2));
});

test("unsaved draft guard, real stale conflict with field merge, delete from the panel and ownership 404", async ({
  page,
}, info) => {
  const task = await create(`Taslak ${randomUUID()}`, { description: "İlk açıklama" });
  await page.goto(`/tasks?search=${encodeURIComponent(task.title)}&date=2026-10-17`);
  await page.getByRole("button", { name: `${task.title} ayrıntısını aç`, exact: true }).click();
  await expect(title(page)).toHaveValue(task.title);
  const remote = await setup.put(`/api/tasks/${task.id}`, {
    data: {
      version: task.version,
      title: task.title,
      description: "Diğer sekmeden açıklama",
      priority: "Urgent",
      deadlineAt: null,
      canSplit: true,
    },
  });
  expect(remote.status()).toBe(200);
  await title(page).fill("Benim taslağım");
  if (info.project.name === "chromium") {
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(title(page)).toHaveValue("Benim taslağım");
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(title(page)).toHaveValue("Benim taslağım");
  }
  await Promise.all([
    page.waitForEvent("dialog").then(dialog => dialog.dismiss()),
    page.evaluate(() => history.back()),
  ]);
  await expect(title(page)).toHaveValue("Benim taslağım");
  await expect(page).toHaveURL(new RegExp(`taskId=${task.id}`));
  await title(page).press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Görev başka bir yerde değişti." })).toBeVisible();
  await page.getByRole("button", { name: "Güncel görevi kontrol et", exact: true }).click();
  await expect(page.getByRole("region", { name: "Güncel görev" })).toContainText("Diğer sekmeden açıklama");
  await page.getByRole("button", { name: "Taslağımı güncel görevle düzenle", exact: true }).click();
  await expect(title(page)).toHaveValue("Benim taslağım");
  await expect(page.getByLabel("Açıklama", { exact: true })).toHaveValue("Diğer sekmeden açıklama");
  await title(page).focus();
  await title(page).press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Kaydedildi" }).first()).toBeVisible();
  expect(await current(task.id)).toMatchObject({
    title: "Benim taslağım",
    description: "Diğer sekmeden açıklama",
    priority: "Urgent",
  });
  let prompts = 0;
  page.on("dialog", d => {
    prompts++;
    void d.dismiss();
  });
  await page.getByRole("button", { name: "Görev menüsü", exact: true }).click();
  await page.getByRole("menuitem", { name: "Görevi sil", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Görev silindi" })).toBeVisible();
  await expect(title(page)).toHaveCount(0);
  expect(prompts).toBe(0);
  expect((await current(task.id)).archivedAt).not.toBeNull();
  await page.goto(`/tasks?taskId=${foreign}`);
  await expect(page.getByRole("alert").filter({ hasText: "Bu göreve erişilemiyor." })).toBeVisible();
  await expect(title(page)).toHaveCount(0);
  await audit(page, "not-found");
  await page.screenshot({ path: `${EVIDENCE}/tasks-not-found-${info.project.name}.png`, fullPage: true });
});

test("search read recovery, quick add 400, offline no queue, double submit and committed create response loss", async ({
  page,
  context,
}, info) => {
  await page.route("**/api/tasks?**", async route =>
    route.request().method() === "GET" &&
    !(await page.evaluate(() => document.documentElement.dataset.tasksRecovery === "yes"))
      ? route.fulfill({ status: 503, contentType: "application/problem+json", body: JSON.stringify({ status: 503 }) })
      : route.continue(),
  );
  await page.goto("/tasks?search=Kay%C4%B1t%200002");
  await expect(page.getByRole("alert").filter({ hasText: "Arama yapılamadı." })).toBeVisible();
  const recover = page.getByRole("button", { name: "Yeniden dene", exact: true });
  // İlk bağlantı kurtarması hata düğmesini değiştirebilir. Gerçek klavye tıklamasını sabit belgede izliyoruz.
  await expect(page.locator('[data-sync-state="connected"]')).toBeAttached();
  await page.evaluate(() =>
    document.addEventListener(
      "click",
      event => {
        const button = event.target instanceof Element ? event.target.closest("button") : null;
        if (button?.textContent?.trim() === "Yeniden dene" && event.isTrusted)
          document.documentElement.dataset.tasksRecovery = "yes";
      },
      { capture: true },
    ),
  );
  await recover.press("Enter");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.tasksRecovery)).toBe("yes");
  await expect(page.getByRole("button", { name: "Kayıt 0002 ayrıntısını aç", exact: true })).toBeVisible();
  await page.unroute("**/api/tasks?**");
  const dialog = await quickAdd(page);
  const input = dialog.getByLabel("Aklındaki işi yaz", { exact: true });
  const add = dialog.getByRole("button", { name: "Ekle", exact: true });
  const posts: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/tasks") {
      posts.push(request.postData()!);
      expect(request.headers()["idempotency-key"]).toBeUndefined();
    }
  });
  await input.fill("Sunucu reddi");
  await page.route("**/api/tasks", route =>
    route.request().method() === "POST"
      ? route.continue({ postData: JSON.stringify({ title: " " }) })
      : route.continue(),
  );
  await add.click();
  await expect(dialog.getByRole("alert").filter({ hasText: "Sunucu bu alanları kabul etmedi." })).toBeVisible();
  await expect(input).toHaveValue("Sunucu reddi");
  await page.unroute("**/api/tasks");
  await input.fill(`Ağdan sonra ${randomUUID()}`);
  await context.setOffline(true);
  await add.click();
  await expect(dialog.getByRole("alert").filter({ hasText: "Bağlantı yok. Değişiklik gönderilmedi;" })).toBeVisible();
  expect(posts).toHaveLength(1);
  await context.setOffline(false);
  await expect(add).toBeEnabled();
  expect(posts).toHaveLength(1);
  await page.route("**/api/tasks", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    await route.abort("failed");
  });
  await input.evaluate((element: HTMLInputElement) => {
    element.form!.requestSubmit();
    element.form!.requestSubmit();
  });
  await expect(dialog.getByRole("alert").filter({ hasText: "Kaydedilmiş olabilir" })).toBeVisible();
  await expect(add).toBeDisabled();
  expect(posts).toHaveLength(2);
  await input.press("Enter");
  expect(posts).toHaveLength(2);
  await page.unroute("**/api/tasks");
  expect((await (await setup.get("/api/tasks", { params: { search: JSON.parse(posts[1]).title } })).json()).total).toBe(
    1,
  );
  await dialog.getByRole("button", { name: "Listeyi kontrol et", exact: true }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "1 benzer başlık bulundu." })).toBeVisible();
  await expect(add).toBeDisabled();
  expect(posts).toHaveLength(2);
  await audit(page, "unknown-create");
  await page.screenshot({ path: `${EVIDENCE}/tasks-unknown-create-${info.project.name}.png`, fullPage: true });
  const unlock = dialog.getByRole("button", { name: "Kontrol ettim, yeniden eklemeyi aç", exact: true });
  page.once("dialog", d => d.dismiss());
  await unlock.click();
  await expect(add).toBeDisabled();
  page.once("dialog", d => d.accept());
  await unlock.click();
  await expect(input).toBeFocused();
  await expect(add).toBeEnabled();
  expect(posts).toHaveLength(2);
});

test("effort filter shows matching active tasks and lets users reach older matches", async ({ page }) => {
  const prefix = `Efor ${randomUUID()}`;
  const low = await create(`${prefix} düşük`);
  const medium = await create(`${prefix} orta`);
  const high = await create(`${prefix} yüksek`);
  const done = await create(`${prefix} bitti`);
  const unspecified = await create(`${prefix} belirtilmedi`);
  for (const [task, energyDemand] of [
    [low, "Low"],
    [medium, "Medium"],
    [high, "High"],
    [done, "Low"],
  ] as const) {
    expect(
      (await setup.put(`/api/tasks/${task.id}/energy`, { data: { version: task.version, energyDemand } })).status(),
    ).toBe(200);
  }
  expect(
    (
      await setup.post(`/api/tasks/${done.id}/state`, {
        data: { version: (await current(done.id)).version, action: "Complete" },
      })
    ).status(),
  ).toBe(200);
  // Bu koşunun sahipliği beforeAll'da doğrulanan veritabanında eski eşleşmeler oluştur.
  execFileSync(process.env.ADHD_UI_TEST_PSQL!, ["--no-psqlrc", "--set=ON_ERROR_STOP=1", `--set=seed=${low.id}`], {
    input: `INSERT INTO tasks SELECT (jsonb_populate_record(null::tasks, to_jsonb(seed) || jsonb_build_object('Id', gen_random_uuid(), 'Title', seed."Title" || ' ' || i, 'SortOrder', seed."SortOrder" + i * 1024, 'CreatedAt', seed."CreatedAt" - i * interval '1 second'))).* FROM tasks seed CROSS JOIN generate_series(1,50) i WHERE seed."Id" = :'seed'::uuid;`,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  await page.goto(`/tasks?search=${encodeURIComponent(prefix)}`);
  const filter = page.getByLabel("Efora göre süz");
  const list = results(page);
  await filter.selectOption("Low");
  await expect(list.getByRole("status")).toHaveText("50 / 51 sonuç");
  await expect(list.getByText("Efor: Düşük", { exact: true })).toHaveCount(50);
  const lowColor = await list
    .getByText("Efor: Düşük", { exact: true })
    .first()
    .evaluate(el => getComputedStyle(el).color);
  await expect(list.getByText(done.title, { exact: true })).toHaveCount(0);
  await list.getByRole("button", { name: "Sonraki sayfa" }).click();
  await expect(list.getByRole("status")).toHaveText("51 / 51 sonuç");
  await expect(list.getByText(`${low.title} 50`, { exact: true })).toBeVisible();
  await list.getByRole("button", { name: "Önceki sayfa" }).click();
  await expect(list.getByText(low.title, { exact: true })).toBeVisible();
  await list.getByRole("button", { name: "Sonraki sayfa" }).click();
  await expect(page).toHaveURL(/offset=50/);

  await filter.selectOption("Medium");
  await expect(page).not.toHaveURL(/offset=/);
  await expect(list.getByRole("status")).toHaveText("1 sonuç");
  await expect(list.getByText(medium.title, { exact: true })).toBeVisible();
  await expect(list.getByText("Efor: Orta", { exact: true })).toBeVisible();
  const mediumColor = await list.getByText("Efor: Orta", { exact: true }).evaluate(el => getComputedStyle(el).color);
  await filter.selectOption("High");
  await expect(list.getByRole("status")).toHaveText("1 sonuç");
  await expect(list.getByText(high.title, { exact: true })).toBeVisible();
  await expect(list.getByText("Efor: Yüksek", { exact: true })).toBeVisible();
  const highColor = await list.getByText("Efor: Yüksek", { exact: true }).evaluate(el => getComputedStyle(el).color);
  expect(new Set([lowColor, mediumColor, highColor]).size).toBe(3);
  await filter.selectOption("");
  await expect(list.getByText(unspecified.title, { exact: true })).toBeVisible();
  await expect(list.getByText(done.title, { exact: true })).toBeVisible();
});

test("linked filters and struck completed results, archived tasks stay out and an unknown PUT is reconciled without replay", async ({
  page,
}, info) => {
  const prefix = `Filtre %_ ${randomUUID()}`;
  await create(`${prefix} açık`, { priority: "High" });
  const completed = await create(`${prefix} bitti`);
  expect(
    (
      await setup.post(`/api/tasks/${completed.id}/state`, { data: { version: completed.version, action: "Complete" } })
    ).status(),
  ).toBe(200);
  const archived = await create(`${prefix} arşiv`);
  expect(
    (await setup.post(`/api/tasks/${archived.id}/archive`, { data: { version: archived.version } })).status(),
  ).toBe(200);
  await page.goto(`/tasks?date=2026-10-17&search=${encodeURIComponent(prefix)}`);
  await expect(results(page).getByRole("status")).toHaveText("2 sonuç");
  expect(
    await results(page)
      .getByText(completed.title, { exact: true })
      .evaluate(element => getComputedStyle(element).textDecorationLine),
  ).toContain("line-through");
  await page.goto(`/tasks?priority=High&search=${encodeURIComponent(prefix)}`);
  await expect(results(page).getByRole("status")).toHaveText("1 sonuç");
  await page.getByRole("button", { name: "Filtreyi temizle", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByRole("region", { name: "Görev ağacı", exact: true })).toBeVisible();
  await page.goto(`/tasks?taskId=${completed.id}`);
  await expect(title(page)).toHaveValue(completed.title);
  let writes = 0;
  await page.route(`**/api/tasks/${completed.id}`, async route => {
    if (route.request().method() !== "PUT") return route.continue();
    writes++;
    const reply = await route.fetch();
    expect(reply.status()).toBe(200);
    await route.abort("failed");
  });
  await title(page).fill(`${prefix} düzeltilmiş`);
  await title(page).press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Kaydedilmiş olabilir" })).toBeVisible();
  expect(writes).toBe(1);
  await title(page).focus();
  await title(page).press("Enter");
  expect(writes).toBe(1);
  await page.unroute(`**/api/tasks/${completed.id}`);
  await page.getByRole("button", { name: "Güncel görevi kontrol et", exact: true }).click();
  await expect(page.getByRole("region", { name: "Güncel görev" })).toContainText(`${prefix} düzeltilmiş`);
  await page.getByRole("button", { name: "Sunucudaki görevi kullan", exact: true }).click();
  await expect(title(page)).toHaveValue(`${prefix} düzeltilmiş`);
  expect(writes).toBe(1);
  await audit(page, "reconciled-update");
  await page.screenshot({ path: `${EVIDENCE}/tasks-reconciled-${info.project.name}.png`, fullPage: true });
});

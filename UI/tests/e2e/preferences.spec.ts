import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, request as apiRequest, type APIRequestContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openAccountMenu, signIn } from "./helpers/session";
import { EVIDENCE } from "./helpers/evidence";
import { trackFaults } from "./helpers/faults";
import { registerFixture } from "./helpers/fixture-account";

// Proje başına tek gerçek hesap, senaryo başına temiz tarayıcı/sayfa;
// iki gerçek API de değişmeyen 30/5dk giriş sınırının altında kalır.
test.describe.configure({ mode: "default" });
let setup: APIRequestContext;
let token: string;
const pageFaults = new WeakMap<Page, string[]>();
const values = {
  timeZoneId: "Europe/Istanbul",
  language: "en-GB",
  timeFormat: "12h",
  weekStartsOn: 0,
  planningMode: "Preview",
  parentCompletionPolicy: "ParentOnly",
  minimumSplitSeconds: 900,
  transitionSeconds: 0,
  supportEnabled: true,
  weekly: [] as { dayOfWeek: number; startMinute: number; endMinute: number }[],
  exceptions: [],
};
test.beforeAll(async ({ browser, browserName }, worker) => {
  setup = await apiRequest.newContext({
    baseURL: ["firefox", "webkit"].includes(worker.project.name) ? "http://127.0.0.1:5181" : "http://127.0.0.1:5180",
  });
  const response = await registerFixture(setup, "/api/auth/register", {
    data: { email: `preferences-${randomUUID()}@example.test`, password: randomUUID() },
  });
  expect(response.status()).toBe(201);
  token = (await response.json()).accessToken;
  writeFileSync(
    `${EVIDENCE}/environment-preferences-${worker.project.name}.json`,
    JSON.stringify(
      {
        browserName,
        browserVersion: browser.version(),
        project: worker.project.name,
        node: process.version,
        buildId: readFileSync(`${process.env.UI_E2E_BUILD_DIR ?? ".next"}/BUILD_ID`, "utf8").trim(),
        viewport: worker.project.use.viewport,
        locale: "tr-TR",
        timeZone: "Europe/Istanbul",
        fixture: "real JWT/me/preferences/working-hours with isolated PostgreSQL; only named failures injected",
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
  const faults: string[] = [];
  pageFaults.set(page, faults);
  trackFaults(page, faults);
  await signIn(page, token);
});
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus && !page.isClosed()) {
    const historyState = await page
      .evaluate(() => ({ path: location.pathname, entries: history.length, checkpoint: !!history.state?.adhdUnsaved }))
      .catch(() => null);
    writeFileSync(`${EVIDENCE}/failure-history-${info.project.name}-${info.line}.json`, JSON.stringify(historyState));
  }
  expect(pageFaults.get(page)).toEqual([]);
});
async function current() {
  return (await setup.get("/api/preferences", { headers: { Authorization: `Bearer ${token}` } })).json();
}
async function seed(next = values) {
  const snapshot = await current();
  const response = await setup.put("/api/preferences", {
    headers: { Authorization: `Bearer ${token}` },
    data: { version: snapshot.version, values: next },
  });
  expect(response.status()).toBe(200);
  return response.json();
}
async function audit(page: Page, name: string) {
  await expect(page).toHaveTitle(new URL(page.url()).pathname === "/planning" ? /^Gün Planlama/ : /^Ayarlar/);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  writeFileSync(
    `${EVIDENCE}/axe-preferences-${test.info().project.name}-${name}.json`,
    JSON.stringify({ violations: result.violations, incomplete: result.incomplete }, null, 2),
  );
  expect(result.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
  expect(result.incomplete.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
}
const save = (page: Page) => page.getByRole("button", { name: "Kaydet", exact: true });
async function saved(page: Page) {
  await expect(
    page.getByRole("status").filter({ hasText: "Çalışma saatlerin ve tercihlerin kaydedildi." }),
  ).toBeVisible();
}

test("empty calendar, version zero, full document, overlaps, exceptions and mobile hours", async ({ page }, info) => {
  const faults: string[] = [];
  trackFaults(page, faults);
  const commands: { version: number; values: typeof values }[] = [];
  const keys: boolean[] = [];
  const reads: { event: string; path: string; status?: number; time: number }[] = [];
  const start = Date.now();
  page.on("request", request => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      reads.push({ event: "request", path: new URL(request.url()).pathname, time: Date.now() - start });
  });
  page.on("response", response => {
    if (new URL(response.url()).pathname.startsWith("/api/"))
      reads.push({
        event: "response",
        path: new URL(response.url()).pathname,
        status: response.status(),
        time: Date.now() - start,
      });
  });
  page.on("request", request => {
    if (request.method() === "PUT" && new URL(request.url()).pathname === "/api/preferences") {
      commands.push(request.postDataJSON());
      keys.push("idempotency-key" in request.headers());
    }
  });
  const firstRead = page.waitForResponse(
    response => new URL(response.url()).pathname === "/api/workspace/snapshot" && response.request().method() === "GET",
  );
  await page.goto("/planning");
  await firstRead;
  writeFileSync(`${EVIDENCE}/preferences-initial-network-${info.project.name}.json`, JSON.stringify(reads, null, 2));
  await expect(page.getByText("Henüz haftalık çalışma saati belirlemedin.", { exact: false })).toBeVisible();
  expect((await current()).version).toBe(0);
  expect(commands).toHaveLength(0);
  await page.getByRole("link", { name: "Çalışma saatlerini belirle" }).click();
  await expect(page.getByRole("combobox", { name: "Saat dilimi", exact: true })).toHaveValue("Europe/Istanbul");
  await expect(page.getByText("Saat belirlenmedi", { exact: true })).toHaveCount(7);
  await expect(save(page)).toBeDisabled();
  await audit(page, "empty");
  await page.getByRole("button", { name: "Pazartesi saat aralığı ekle", exact: true }).click();
  await page.getByLabel("Başlangıç Pazartesi 1", { exact: true }).fill("09:00");
  await page.getByLabel("Bitiş Pazartesi 1", { exact: true }).fill("10:00");
  await page.getByRole("button", { name: "Pazartesi saat aralığı ekle", exact: true }).click();
  await page.getByLabel("Başlangıç Pazartesi 2", { exact: true }).fill("09:30");
  await page.getByLabel("Bitiş Pazartesi 2", { exact: true }).fill("11:00");
  await page.getByLabel("Bitiş Pazartesi 2", { exact: true }).press("Enter");
  await expect(page.getByText("Bu günün saat aralıkları çakışıyor.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Başlangıç Pazartesi 2", { exact: true })).toBeFocused();
  expect(commands).toHaveLength(0);
  await audit(page, "invalid");
  await page.getByLabel("Başlangıç Pazartesi 2", { exact: true }).fill("10:00");
  await page.getByRole("button", { name: "Cuma saat aralığı ekle", exact: true }).click();
  await page.getByLabel("Başlangıç Cuma 1", { exact: true }).fill("23:00");
  await page.getByLabel("Bitiş Cuma 1", { exact: true }).fill("24:00");
  await page.getByRole("button", { name: "Tarih istisnası ekle", exact: true }).click();
  await page.getByLabel("Tarih istisnası 1", { exact: true }).fill("2026-10-19");
  await page.getByRole("button", { name: "Tarih istisnası ekle", exact: true }).click();
  await page.getByLabel("Tarih istisnası 2", { exact: true }).fill("2026-10-19");
  await save(page).click();
  await expect(page.getByText("Bu tarih zaten eklenmiş. Aynı istisnayı düzenle.")).toBeVisible();
  await page.getByLabel("Tarih istisnası 2", { exact: true }).fill("2026-10-20");
  await page.getByRole("button", { name: "İstisna 2 saat aralığı ekle", exact: true }).click();
  await page.getByLabel("Başlangıç İstisna 2 1", { exact: true }).fill("12:00");
  await page.getByLabel("Bitiş İstisna 2 1", { exact: true }).fill("13:00");
  await expect(page.getByText("Planlama ve destek tercihleri", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Kaydedilmiş saatleri kontrol et", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Gelişmiş", { exact: true })).toHaveCount(0);
  // Ayarlar bölüm bölümdür; destekler saat bölümünde görünmez.
  await expect(page.getByLabel("Bugün tek görevle açılsın", { exact: false })).toHaveCount(0);
  const zoneSelect = page.getByRole("combobox", { name: "Saat dilimi", exact: true });
  await expect(zoneSelect.locator('option[value="Pacific/Auckland"]')).toHaveCount(1);
  expect(await zoneSelect.locator("option").count()).toBeGreaterThan(300);
  await save(page).focus();
  await page.keyboard.press("Enter");
  await saved(page);
  expect(commands).toHaveLength(1);
  expect(commands[0].version).toBe(0);
  expect(keys).toEqual([false]);
  const snapshot = await current();
  expect(snapshot.version).toBe(1);
  expect(snapshot.values.weekly).toEqual([
    { dayOfWeek: 1, startMinute: 540, endMinute: 600 },
    { dayOfWeek: 1, startMinute: 600, endMinute: 660 },
    { dayOfWeek: 5, startMinute: 1380, endMinute: 1440 },
  ]);
  expect(snapshot.values).toMatchObject({
    language: "tr",
    timeFormat: "24h",
    weekStartsOn: 1,
    parentCompletionPolicy: "Ask",
    minimumSplitSeconds: 900,
    transitionSeconds: 0,
    supportEnabled: true,
    planningMode: "Preview",
  });
  for (const width of info.project.name === "chromium"
    ? [320, 390, 768, 1199, 1440, 1920]
    : info.project.name === "mobile-chromium"
      ? [info.project.use.viewport!.width]
      : []) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `${EVIDENCE}/preferences-${info.project.name}-${width}.png`, fullPage: true });
    if (width === 1440 || info.project.name === "mobile-chromium") {
      await page
        .getByRole("heading", { name: "Ayarlar", exact: true })
        .evaluate(element => element.scrollIntoView({ block: "start" }));
      await page.screenshot({ path: `${EVIDENCE}/preferences-top-${info.project.name}.png` });
    }
  }
  await audit(page, "saved");
  await page
    .getByRole("status")
    .filter({ hasText: "Çalışma saatlerin ve tercihlerin kaydedildi." })
    .evaluate(element => element.scrollIntoView({ block: "center" }));
  if (["chromium", "mobile-chromium"].includes(info.project.name))
    await page.screenshot({ path: `${EVIDENCE}/preferences-save-viewport-${info.project.name}.png` });
  writeFileSync(
    `${EVIDENCE}/preferences-render-${info.project.name}.json`,
    JSON.stringify(
      await page.evaluate(() => ({
        bodyFont: getComputedStyle(document.body).fontFamily,
        bodySize: getComputedStyle(document.body).fontSize,
        viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        fontsStatus: document.fonts.status,
      })),
      null,
      2,
    ),
  );
  await page.reload();
  await expect(page.getByLabel("Bitiş Cuma 1", { exact: true })).toHaveValue("24:00");
  expect(commands).toHaveLength(1);
  expect(faults).toEqual([]);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Gün Planlama", exact: true })).toBeVisible();
});

test("draft navigation and logout cancellation, stale conflict and explicit reconciliation preserve hidden preferences", async ({
  page,
}, info) => {
  await seed();
  await page.goto("/planning");
  await page.getByRole("link", { name: "Çalışma saatlerini belirle" }).click();
  await (await zoneField(page)).selectOption("UTC");
  await expect.poll(() => page.evaluate(() => !!history.state?.adhdUnsaved)).toBe(true);
  // Ayarlar penceredir; arka plandaki gezinme pasif. Taslak pencereyi kapatırken ve geçmişte geri giderken korunur.
  const settings = page.getByRole("dialog", { name: "Ayarlar" });
  page.once("dialog", dialog => dialog.dismiss());
  await settings.getByRole("button", { name: "Ayarlar panelini kapat", exact: true }).click();
  await expect(settings).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Saat dilimi", exact: true })).toHaveValue("UTC");
  await Promise.all([
    page.waitForEvent("dialog", { timeout: 5000 }).then(dialog => dialog.dismiss()),
    page.evaluate(() => history.go(-2)),
  ]);
  await expect.poll(() => page.evaluate(() => !!history.state?.adhdUnsaved)).toBe(true);
  await expect(page.getByRole("combobox", { name: "Saat dilimi", exact: true })).toHaveValue("UTC");
  await Promise.all([
    page.waitForEvent("dialog", { timeout: 5000 }).then(dialog => dialog.dismiss()),
    page.evaluate(() => history.back()),
  ]);
  await expect.poll(() => page.evaluate(() => !!history.state?.adhdUnsaved)).toBe(true);
  await expect(page.getByRole("combobox", { name: "Saat dilimi", exact: true })).toHaveValue("UTC");
  // Bölüm değiştirmek de taslağı sorar; telefonda bölüm listesine dönmek de bir bölüm değişimidir.
  page.once("dialog", dialog => dialog.dismiss());
  if ((page.viewportSize()?.width ?? 1280) <= 640)
    await settings.getByRole("button", { name: "Ayarlar listesine dön", exact: true }).click();
  else await settings.getByRole("button", { name: "Profil", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Saat dilimi", exact: true })).toHaveValue("UTC");
  page.once("dialog", dialog => dialog.dismiss());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("combobox", { name: "Saat dilimi", exact: true })).toHaveValue("UTC");
  // Onaylanınca taslak bırakılır; yeniden açılan bölüm kayıtlı değeri gösterir.
  page.once("dialog", dialog => dialog.accept());
  await settings.getByRole("button", { name: "Ayarlar panelini kapat", exact: true }).click();
  await expect(settings).toHaveCount(0);
  await page.goto("/settings?section=hours");
  await expect(page.getByRole("combobox", { name: "Saat dilimi", exact: true })).toHaveValue("Europe/Istanbul");
  await (await zoneField(page)).selectOption("UTC");
  const other = await seed({
    ...values,
    timeZoneId: "Europe/Berlin",
    planningMode: "Auto",
    language: "fr",
    timeFormat: "24h",
    parentCompletionPolicy: "CompleteSubtree",
  });
  await save(page).click();
  await expect(settings.getByRole("alert")).toContainText("Tercihler başka bir yerde değişti.");
  await expect(save(page)).toBeDisabled();
  await expect(settings.getByRole("alert")).toBeFocused();
  await page.getByRole("button", { name: "Sunucudaki durumu kontrol et", exact: true }).click();
  await expect(page.getByRole("region", { name: "Güncel tercihler", exact: true })).toContainText("Europe/Berlin");
  await audit(page, "conflict");
  await page.screenshot({ path: `${EVIDENCE}/preferences-conflict-${info.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Taslağımı güncel kayıt üzerinden düzenle", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Saat dilimi", exact: true })).toHaveValue("UTC");
  const committed = page.waitForResponse(
    r => r.request().method() === "PUT" && new URL(r.url()).pathname === "/api/preferences",
  );
  await save(page).click();
  expect((await committed).status()).toBe(200);
  await saved(page);
  const result = await current();
  expect(result.version).toBe(other.version + 1);
  expect(result.values).toMatchObject({
    timeZoneId: "UTC",
    language: "fr",
    timeFormat: "24h",
    weekStartsOn: 0,
    parentCompletionPolicy: "CompleteSubtree",
    planningMode: "Auto",
    minimumSplitSeconds: 900,
    transitionSeconds: 0,
    supportEnabled: true,
  });
  // Yeni taslakta Geri, yönlendirici formu sökmeden önce sormalı.
  await (await zoneField(page)).selectOption("Europe/London");
  await Promise.all([
    page.waitForEvent("dialog", { timeout: 5000 }).then(dialog => dialog.accept()),
    page.evaluate(() => history.back()),
  ]);
  await expect(page.getByRole("heading", { name: "Gün Planlama", exact: true })).toBeVisible();
  await expect(settings).toHaveCount(0);
});

test("read recovery, offline no queue, committed response loss and server DST intervals", async ({ page, context }) => {
  await seed({ ...values, timeZoneId: "Europe/Berlin", weekly: [{ dayOfWeek: 0, startMinute: 150, endMinute: 240 }] });
  await page.route("**/api/preferences", async route =>
    route.request().method() === "GET" &&
    !(await page.evaluate(() => document.documentElement.dataset.preferencesRecovery === "yes"))
      ? route.fulfill({
          status: 503,
          contentType: "application/problem+json",
          body: JSON.stringify({ status: 503, code: "test_unavailable" }),
        })
      : route.continue(),
  );
  await page.goto("/settings?section=hours");
  await expect(page.getByRole("dialog", { name: "Ayarlar" }).getByRole("alert")).toContainText("Tercihler alınamadı.");
  const recover = page.getByRole("button", { name: "Tercihleri yeniden yükle", exact: true });
  await page.evaluate(() =>
    document.addEventListener(
      "click",
      event => {
        if (
          event.isTrusted &&
          event.target instanceof Element &&
          event.target.closest("button")?.textContent?.trim() === "Tercihleri yeniden yükle"
        )
          document.documentElement.dataset.preferencesRecovery = "yes";
      },
      { capture: true },
    ),
  );
  await recover.press("Enter");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.preferencesRecovery)).toBe("yes");
  await expect(page.getByRole("combobox", { name: "Saat dilimi", exact: true })).toHaveValue("Europe/Berlin");
  await page.unrouteAll({ behavior: "ignoreErrors" });
  for (const [date, start, end] of [
    ["2026-03-29", "2026-03-29T01:00:00+00:00", "2026-03-29T02:00:00+00:00"],
    ["2026-10-25", "2026-10-25T00:30:00+00:00", "2026-10-25T03:00:00+00:00"],
  ]) {
    const response = await setup.get(`/api/preferences/working-hours?date=${date}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(200);
    const day = await response.json();
    expect(day.utcIntervals[0].startsAt).toBe(start);
    expect(day.utcIntervals.at(-1).endsAt).toBe(end);
  }
  await (await zoneField(page)).selectOption("UTC");
  const commands: string[] = [];
  page.on("request", request => {
    if (request.method() === "PUT" && new URL(request.url()).pathname === "/api/preferences")
      commands.push("PUT /api/preferences");
  });
  await context.setOffline(true);
  await save(page).click();
  await expect(page.getByRole("dialog", { name: "Ayarlar" }).getByRole("alert")).toContainText(
    "Bağlantı yok. Değişiklik gönderilmedi;",
  );
  expect(commands).toHaveLength(0);
  await context.setOffline(false);
  // Gerçek sunucu kaydı ardından kayıp yanıt. Sahte başarılı yanıt değil.
  await page.route("**/api/preferences", async route => {
    if (route.request().method() !== "PUT") return route.continue();
    const reply = await route.fetch();
    expect(reply.status()).toBe(200);
    await route.abort("failed");
  });
  await expect(save(page)).toBeEnabled();
  expect(commands).toHaveLength(0);
  await save(page).click();
  await expect(page.getByRole("dialog", { name: "Ayarlar" }).getByRole("alert")).toContainText(
    "Kaydın sonucu alınamadı.",
  );
  await expect(save(page)).toBeDisabled();
  expect(commands).toHaveLength(1);
  await page.unroute("**/api/preferences");
  await page.getByRole("button", { name: "Sunucudaki durumu kontrol et", exact: true }).click();
  await expect(page.getByRole("region", { name: "Güncel tercihler", exact: true })).toBeVisible();
  expect((await current()).values.timeZoneId).toBe("UTC");
  await page.getByRole("button", { name: "Sunucudaki değerleri kullan", exact: true }).click();
  await expect(save(page)).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Saat dilimi", exact: true })).toHaveValue("UTC");
  expect(commands).toHaveLength(1);
  await audit(page, "recovered-dst");
});

test("settings save actions follow scrolling while status stays in the document", async ({ page }, info) => {
  await seed({
    ...values,
    weekly: Array.from({ length: 7 }, (_, dayOfWeek) => [
      { dayOfWeek, startMinute: 540, endMinute: 720 },
      { dayOfWeek, startMinute: 780, endMinute: 1020 },
    ]).flat(),
  });
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 740 });
  await page.goto("/settings?section=hours");
  const zone = await zoneField(page);
  const actions = page.locator(".preferences-save");
  const status = page.locator(".preferences-save-status");
  for (const dirty of [false, true]) {
    if (dirty) await zone.selectOption("UTC");
    await expect(status).toHaveText(dirty ? "Kaydedilmemiş değişiklikler var." : "Kaydedilmemiş değişiklik yok.");
    // Ayarlar penceresi kendi içinde kayar. Sabit eylemler yalnız formun içinde kalır.
    await page.evaluate(() => {
      const box = document.querySelector<HTMLElement>("dialog[open]")!;
      box.scrollTop = 80;
    });
    await expect(actions).toBeInViewport();
    const measure = () =>
      page.evaluate(() => ({
        actions: document.querySelector(".preferences-save")!.getBoundingClientRect().top,
        status: document.querySelector(".preferences-save-status")!.getBoundingClientRect().top,
        scroll: document.querySelector<HTMLElement>("dialog[open]")!.scrollTop,
      }));
    const before = await measure();
    await page.evaluate(async () => {
      document.querySelector<HTMLElement>("dialog[open]")!.scrollBy(0, 180);
      await new Promise(requestAnimationFrame);
    });
    const after = await measure();
    expect(after.scroll - before.scroll).toBeGreaterThan(150);
    expect(Math.abs(after.actions - before.actions)).toBeLessThan(2);
    expect(Math.abs(before.status - after.status - (after.scroll - before.scroll))).toBeLessThan(2);
    expect(await status.evaluate(el => getComputedStyle(el).position)).toBe("static");
    expect(await actions.locator('[role="status"]').count()).toBe(0);
    // Telefonda pencere tam ekran; eylem çubuğu pencerenin görünür alanında kalır.
    const bar = await actions.boundingBox();
    const box = await page.locator("dialog[open]").boundingBox();
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(box!.y + box!.height + 1);
    await page.screenshot({
      path: `${EVIDENCE}/settings-sticky-${dirty ? "dirty" : "clean"}-${info.project.name}.png`,
    });
  }
  await audit(page, "sticky-actions");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Değişiklikleri bırak", exact: true }).click();
  await expect(save(page)).toBeDisabled();
  await expect(status).toHaveText("Kaydedilmemiş değişiklik yok.");
});

test("settings window opens one section at a time, keeps the address, restores focus and lists sections on phones", async ({
  page,
}, info) => {
  await seed();
  await page.goto("/planning");
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Ayarlar", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Ayarlar" });
  await expect(settings).toBeVisible();
  const phone = (page.viewportSize()?.width ?? 1280) <= 640;
  if (phone) {
    // Telefonda önce bölüm listesi, seçince geri oklu ayrıntı.
    await expect(page).toHaveURL(/settings=menu$/);
    await expect(settings.getByRole("navigation", { name: "Ayar bölümleri" })).toBeVisible();
    await settings.getByRole("button", { name: "Görünüm", exact: true }).click();
    await expect(settings.getByRole("heading", { name: "Görünüm", exact: true })).toBeVisible();
    await expect(settings.getByRole("navigation", { name: "Ayar bölümleri" })).toBeHidden();
    await settings.getByRole("button", { name: "Ayarlar listesine dön", exact: true }).click();
    await expect(settings.getByRole("navigation", { name: "Ayar bölümleri" })).toBeVisible();
    await settings.getByRole("button", { name: "Profil", exact: true }).click();
  } else await expect(page).toHaveURL(/settings=profile$/);
  // Yalnız seçili bölüm görünür; Profil açıkken Görünüm yok.
  await expect(settings.getByRole("region", { name: "Profil", exact: true })).toBeVisible();
  await expect(settings.getByRole("heading", { name: "Görünüm", exact: true })).toHaveCount(0);
  await expect(settings.getByLabel("Ad", { exact: true })).toBeVisible();
  await expect(settings.getByLabel("Soyad", { exact: true })).toBeVisible();
  if (phone) await settings.getByRole("button", { name: "Ayarlar listesine dön", exact: true }).click();
  await settings.getByRole("button", { name: "Saat ve çalışma günü", exact: true }).click();
  await expect(page).toHaveURL(/settings=hours$/);
  await expect(page.getByRole("combobox", { name: "Saat dilimi", exact: true })).toBeVisible();
  await expect(settings.getByRole("region", { name: "Profil", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await audit(page, "settings-window");
  await page.screenshot({ path: `${EVIDENCE}/settings-window-${info.project.name}.png` });
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
  // Telefonda Ayarlar Daha fazla menüsünden açılır; kapanınca geçmişte o menüye dönülür.
  await expect(page).toHaveURL(phone ? /\/planning(\?menu=more)?$/ : /\/planning$/);
  // Kalıcı bağlantı istenen bölümle pencereyi açar.
  await page.goto("/settings?section=supports");
  await expect(page).toHaveURL(/\/planning\?settings=supports$/);
  await expect(settings.getByRole("region", { name: "Destekler", exact: true })).toBeVisible();
  await page.goBack();
  await expect(settings).toHaveCount(0);
});

async function zoneField(page: Page) {
  return page.getByRole("combobox", { name: "Saat dilimi", exact: true });
}

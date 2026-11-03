import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { auditAnalytics } from "./helpers/analytics-audit";
import { trackFaults } from "./helpers/faults";
import { EVIDENCE } from "./helpers/evidence";
import { seedAnalytics } from "./helpers/owned-analytics";
let fx: FocusFixture;
const faults = new WeakMap<Page, string[]>(),
  base = "/analytics?period=custom&fromDate=2026-01-14&toDate=2026-01-15&dimension=Task";
/** Tam sunucu toplamları kapalı ayrıntıda. Başlık yalnız yuvarlar. */
async function details(p: Page) {
  const box = p.locator("#main details").filter({ has: p.locator("summary", { hasText: /^Ayrıntılar$/ }) });
  if (!(await box.evaluate(el => (el as HTMLDetailsElement).open))) await box.locator("summary").click();
  return box;
}
const total = async (p: Page, term = "Gerçek çalışma") =>
  (await details(p)).getByLabel("Çalışma ve odak toplamları").getByText(term, { exact: true }).locator("+ dd");
const list = (p: Page, name = "Görev dağılımı") => p.getByRole("list", { name, exact: true });
async function manual(taskId: string, startedAt: string, endedAt: string) {
  const r = await fx.api.post("/api/work-sessions/manual", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { taskId, startedAt, endedAt, reason: "Analiz kontrollü geçmiş kayıt" },
  });
  expect(r.status()).toBe(201);
  return r.json();
}
async function read(path: string) {
  const r = await fx.api.get(path);
  expect(r.status()).toBe(200);
  return r.json();
}
test.beforeEach(async ({ page }) => {
  fx = await FocusFixture.create();
  await fx.login(page);
  const messages: string[] = [];
  faults.set(page, messages);
  trackFaults(page, messages);
});
test.afterEach(async ({ page }) => {
  expect(faults.get(page)).toEqual([]);
  await fx?.api.dispose();
});

test("custom period stays with preset chips and repeated selection preserves the selected dates", async ({
  page,
}, info) => {
  await page.goto("/analytics?period=lastMonth&dimension=Task");
  const nav = page.getByRole("navigation", { name: "Dönem", exact: true });
  const custom = nav.getByRole("link", { name: "Özel aralık", exact: true });
  await expect(nav.getByRole("link", { name: "Geçen ay", exact: true })).toHaveAttribute("aria-current", "page");
  const before = await custom.boundingBox();
  expect(before).not.toBeNull();
  await custom.click();
  await expect(custom).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("form", { name: "Özel tarih aralığı", exact: true })).toBeVisible();
  const initial = new URL(page.url());
  expect(initial.searchParams.get("period")).toBe("custom");
  expect(initial.searchParams.get("dimension")).toBe("Task");
  const after = await custom.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(1);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);
  if ((page.viewportSize()?.width ?? 1280) >= 768) {
    const week = await nav.getByRole("link", { name: "Bu hafta", exact: true }).boundingBox();
    expect(Math.abs(after!.y - week!.y)).toBeLessThan(1);
  }
  await page.getByLabel("Başlangıç", { exact: true }).fill("2026-01-14");
  await page.getByLabel("Bitiş", { exact: true }).fill("2026-01-15");
  await page.getByRole("button", { name: "Aralığı göster", exact: true }).click();
  await expect(page).toHaveURL(/fromDate=2026-01-14&toDate=2026-01-15/);
  await expect(page.getByText(/^Bu aralıkta/)).toBeVisible();
  const selected = page.url();
  await custom.click();
  await expect(page).toHaveURL(selected);
  await expect(custom).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Bu hafta", exact: true })).not.toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Başlangıç", { exact: true })).toHaveValue("2026-01-14");
  await expect(page.getByLabel("Bitiş", { exact: true })).toHaveValue("2026-01-15");
  // İki adres de özel aralıksa geçmiş geçişi raporla birlikte düzenleyiciyi de güncellemeli.
  await page.goBack();
  await expect(page).toHaveURL(initial.href);
  await expect(page.getByLabel("Başlangıç", { exact: true })).toHaveValue(initial.searchParams.get("fromDate")!);
  await expect(page.getByLabel("Bitiş", { exact: true })).toHaveValue(initial.searchParams.get("toDate")!);
  await page.goForward();
  await expect(page).toHaveURL(selected);
  await expect(page.getByLabel("Başlangıç", { exact: true })).toHaveValue("2026-01-14");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await auditAnalytics(page, "custom-period");
  await page.screenshot({ path: `${EVIDENCE}/analytics-custom-period-${info.project.name}.png` });
});

test("empty week opens on a calm summary; every section has a text alternative and nothing overflows", async ({
  page,
}, info) => {
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1, name: "Analiz", exact: true })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Dönem", exact: true }).getByRole("link", { name: "Bu hafta" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Bu hafta kayıtlı çalışma yok. Bu, yaptığın bütün emeği ölçmez.")).toBeVisible();
  await expect(page.getByRole("img", { name: /için çalışma süresi\. Kayıtlı çalışma yok\./ })).toBeVisible();
  await expect(page.getByText("Çalışma kaydedildikçe dağılım burada görünür.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Bu dönemde kabul edilmiş plan yok/)).toBeVisible();
  await expect(page.getByText(/Henüz yeterli örnek yok/)).toBeVisible();
  // Tam tablolar kullanıcı açana kadar kapalı.
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(await total(page)).toHaveText("0 sn");
  await expect((await details(page)).getByLabel("Çalışma ve odak toplamları")).toContainText("— (örnek yok)");
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll("#main *")]
        .filter(
          el => el.getBoundingClientRect().right > innerWidth + 1 && !el.parentElement?.closest('[role="region"]'),
        )
        .map(el => el.tagName),
    ),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await auditAnalytics(page, "empty-light");
  await page.screenshot({ path: `${EVIDENCE}/analytics-empty-${info.project.name}.png`, fullPage: true });
});

test("headline compares with the same span before; parent and child work stay distinct; links keep history", async ({
  page,
}, info) => {
  const parent = await fx.task();
  const c = await fx.api.post(`/api/tasks/${parent.id}/children`, {
    data: { title: "Analiz çocuk", parentVersion: parent.version, parentWorkDisposition: "PreserveDirect" },
  });
  expect(c.status()).toBe(201);
  const child = await c.json();
  await manual(parent.id, "2026-01-15T06:00:00Z", "2026-01-15T06:10:00Z");
  await manual(child.id, "2026-01-15T06:10:00Z", "2026-01-15T06:30:00Z");
  await manual(child.id, "2026-01-13T06:00:00Z", "2026-01-13T06:10:00Z");
  expect(Number((await read("/api/analytics/actual?fromDate=2026-01-14&toDate=2026-01-15")).totals.workSeconds)).toBe(
    1800,
  );
  await page.goto(base);
  await expect(page.getByText("Bu aralıkta 30 dk çalıştın; önceki eşit süreye göre 20 dk fazla.")).toBeVisible();
  await expect(page.getByText("Önceki eşit süre: 10 dk", { exact: true })).toBeVisible();
  await expect(list(page)).toContainText(parent.title);
  await expect(list(page)).toContainText("Analiz çocuk");
  await expect(await total(page, "Manuel kayıt")).toHaveText("30 dk");
  await page.getByRole("navigation", { name: "Kırılım", exact: true }).getByRole("link", { name: "Proje" }).click();
  await expect(page).not.toHaveURL(/dimension=/);
  await expect(list(page, "Proje dağılımı")).toBeVisible();
  await page.reload();
  await expect(list(page, "Proje dağılımı")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/dimension=Task/);
  await expect(list(page)).toContainText(parent.title);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await auditAnalytics(page, "actual-dark");
  await page.screenshot({ path: `${EVIDENCE}/analytics-actual-${info.project.name}.png`, fullPage: true });
});

test("effective correction crossing midnight retains source days after current zone changes and audit adds no work", async ({
  page,
}) => {
  const t = await fx.task();
  const work = await manual(t.id, "2026-01-14T20:30:00Z", "2026-01-14T21:30:00Z"),
    segments = await read(`/api/work-sessions/${work.id}/segments`),
    segment = segments.items[0];
  const correction = await fx.api.post(`/api/work-sessions/${work.id}/segments/${segment.id}/corrections`, {
    data: {
      version: work.version,
      segmentVersion: segment.version,
      startedAt: segment.startedAt,
      endedAt: "2026-01-14T21:00:00.123456Z",
      isVoided: false,
      reason: "Gece yarısı düzeltmesi",
    },
  });
  expect(correction.status()).toBe(200);
  const prefs = await read("/api/preferences");
  expect(
    (
      await fx.api.put("/api/preferences", {
        data: { version: prefs.version, values: { ...prefs.values, timeZoneId: "UTC" } },
      })
    ).status(),
  ).toBe(200);
  const r = await read("/api/analytics/actual?fromDate=2026-01-14&toDate=2026-01-15");
  expect(Number(r.totals.workSeconds)).toBe(1800.123456);
  expect(r.sourceTimeZones).toContain("Europe/Istanbul");
  expect(Number(r.totals.segmentCount)).toBe(1);
  await page.goto(base);
  await expect(await total(page)).toHaveText("30 dk");
  const table = page.getByRole("region", { name: "Dönem tablosu", exact: true });
  await expect(table.getByRole("row", { name: /2026-01-14/ })).toContainText("30 dk");
  await expect(table.getByRole("row", { name: /2026-01-15/ })).toContainText("1 sn’den az");
  await expect(page.getByRole("img", { name: /En yüksek: 14 Ocak/ })).toBeVisible();
});

test("custom range is inclusive up to 366 days; invalid input and malformed URL never trigger a report request", async ({
  page,
}) => {
  await page.goto(base);
  await expect(page.getByText(/^Bu aralıkta/)).toBeVisible();
  const reads: URL[] = [];
  page.on("request", r => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/analytics/")) reads.push(u);
  });
  await page.getByLabel("Başlangıç", { exact: true }).fill("2024-01-01");
  await page.getByLabel("Bitiş", { exact: true }).fill("2025-01-01");
  await page.getByRole("button", { name: "Aralığı göster", exact: true }).click();
  await expect(page.locator("#main").getByRole("alert")).toContainText("1–366");
  expect(reads.filter(u => u.searchParams.get("fromDate") === "2024-01-01")).toHaveLength(0);
  await expect(page).toHaveURL(/fromDate=2026-01-14/);
  await page.getByLabel("Bitiş", { exact: true }).fill("2024-12-31");
  await page.getByRole("button", { name: "Aralığı göster", exact: true }).click();
  await expect(page).toHaveURL(/toDate=2024-12-31/);
  await expect(page.getByText("Bu aralıkta kayıtlı çalışma yok. Bu, yaptığın bütün emeği ölçmez.")).toBeVisible();
  // 366 gün sunucuda aylık gruplanır. Eşit önceki aralık yalnız karşılaştırma için okunur.
  expect(
    reads.some(u => u.searchParams.get("toDate") === "2024-12-31" && u.searchParams.get("bucket") === "Month"),
  ).toBe(true);
  expect(reads.some(u => u.searchParams.get("toDate") === "2023-12-31")).toBe(true);
  await page.goto("/analytics?fromDate=2026-02-30&toDate=2026-03-01");
  await expect(page.locator("#main").getByRole("alert")).toContainText("1–366");
  expect(reads.filter(u => u.searchParams.get("fromDate") === "2026-02-30")).toHaveLength(0);
  await page.goto("/analytics?period=yesterday");
  await expect(page.locator("#main").getByRole("alert")).toContainText("Geçerli bir dönem seç.");
  await page.getByRole("link", { name: "Bu haftaya dön", exact: true }).click();
  await expect(page.getByText(/^Bu hafta (kayıtlı|\d)/)).toBeVisible();
});

test("density conflict and malformed metrics are explicit, recoverable, section-local read failures", async ({
  page,
}) => {
  await page.route("**/api/analytics/actual?**", route =>
    route.fulfill({
      status: 409,
      contentType: "application/problem+json",
      body: JSON.stringify({ title: "Dar aralık seçin", status: 409, code: "analytics_range_too_dense" }),
    }),
  );
  await page.goto(base);
  await expect(page.locator("#main").getByRole("alert").first()).toContainText("50.000 kaynak");
  await expect(page.getByText(/^Bu aralıkta/)).toHaveCount(0);
  // Diğer bölümler kendi durumunu çizmeye devam eder.
  await expect(page.getByRole("heading", { name: "Planına uyum", exact: true })).toBeVisible();
  const retry = page.locator("#main").getByRole("alert").first().getByRole("button", { name: "Yeniden dene" });
  await expect(retry).toBeVisible();
  await page.unroute("**/api/analytics/actual?**");
  // Canlı eşitleme raporu yenilediyse uyarı zaten kalkmıştır, tekrar düğmesine gerek yoktur.
  await retry.click({ timeout: 3000 }).catch(() => {});
  await expect(page.getByText(/^Bu aralıkta kayıtlı çalışma yok/)).toBeVisible();
  await page.route("**/api/analytics/actual?**", async route => {
    const response = await route.fetch(),
      body = await response.json();
    body.totals.focus.averageActiveSeconds = "bilinmiyor";
    await route.fulfill({ response, json: body });
  });
  await (await details(page)).getByRole("button", { name: "Raporu yenile", exact: true }).click();
  await expect(page.locator("#main").getByRole("alert").first()).toContainText("Analiz yanıtı eksik");
  await expect(page.locator("#main").getByRole("alert").first()).toContainText("Önceki okumanın");
});

test("distribution previews five, pages the rest, keeps the whole-range total and isolates another account", async ({
  page,
}) => {
  for (let i = 0; i < 26; i++) {
    const t = await fx.task();
    const start = new Date(Date.UTC(2026, 0, 15, 6, i));
    await manual(t.id, start.toISOString(), new Date(start.getTime() + 60000).toISOString());
  }
  await page.goto(base);
  await expect(list(page).getByRole("listitem")).toHaveCount(5);
  await expect(page.getByText("En çok zaman alanlar önce. Aralığın toplamı 26 dk.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tümünü gör (26)", exact: true }).click();
  await expect(list(page).getByRole("listitem")).toHaveCount(25);
  const pages = page.getByRole("navigation", { name: "Dağılım sayfaları", exact: true });
  await pages.getByRole("button", { name: "Sonraki", exact: true }).click();
  await expect(list(page).getByRole("listitem")).toHaveCount(1);
  await expect(pages).toContainText("26 / 26");
  await expect(await total(page)).toHaveText("26 dk");
  await page.getByRole("navigation", { name: "Kırılım", exact: true }).getByRole("link", { name: "Kategori" }).click();
  await expect(page).toHaveURL(/dimension=Category/);
  await expect(list(page, "Kategori dağılımı")).toBeVisible();
  const foreign = await FocusFixture.create();
  try {
    const response = await foreign.api.get("/api/analytics/actual?fromDate=2026-01-14&toDate=2026-01-15");
    expect(Number((await response.json()).totals.workSeconds)).toBe(0);
  } finally {
    await foreign.api.dispose();
  }
});

test("general focus is a subset of actual and pause/break do not create extra work", async ({ page }) => {
  let f = await fx.start();
  f = await fx.change(f, "pause");
  f = await fx.change(f, "resume");
  await fx.change(f, "finish");
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const r = await read(`/api/analytics/actual?fromDate=${day}&toDate=${day}`);
  expect(Number(r.totals.workSeconds)).toBeGreaterThan(0);
  expect(Number(r.totals.focus.activeSeconds)).toBe(Number(r.totals.workSeconds));
  expect(Number(r.totals.generalWorkSeconds)).toBe(Number(r.totals.workSeconds));
  expect(Number(r.totals.sessionCount)).toBe(1);
  expect(Number(r.totals.focus.activeCycleCount)).toBe(1);
  await page.goto(`/analytics?period=custom&fromDate=${day}&toDate=${day}&dimension=Task`);
  await expect(await total(page)).toHaveText(await (await total(page, "Bağımsız çalışma")).innerText());
  await expect(page.getByText("1 odak döngüsü", { exact: true })).toBeVisible();
  await expect(list(page)).toContainText("Bağımsız odak");
});

test("legacy missing snapshot is visible and current task name never repairs history", async ({ page }) => {
  const t = await fx.task(),
    work = await manual(t.id, "2026-01-15T06:00:00Z", "2026-01-15T06:10:00Z"),
    me = await read("/api/auth/me");
  seedAnalytics(me.id, work.id, "legacy");
  await page.goto(base.replace("dimension=Task", "dimension=Category"));
  await expect(await total(page, "Geçmiş görev bağlamı bilinmeyen süre")).toHaveText("10 dk");
  await expect(list(page, "Kategori dağılımı")).toContainText("geçmiş bağlam bilinmiyor");
  await expect(list(page, "Kategori dağılımı")).not.toContainText(t.title);
});

test("real 50001-source report returns density conflict and a narrower range recovers", async ({ page }) => {
  test.setTimeout(60_000); // 50001 gerçek PostgreSQL satırı oluşturulup sorgulanıyor.
  const t = await fx.task(),
    work = await manual(t.id, "2026-01-15T06:00:00Z", "2026-01-15T06:01:00Z"),
    me = await read("/api/auth/me");
  seedAnalytics(me.id, work.id, "dense");
  const response = await fx.api.get("/api/analytics/actual?fromDate=2026-01-14&toDate=2026-01-15");
  expect(response.status()).toBe(409);
  expect((await response.json()).code).toBe("analytics_range_too_dense");
  await page.goto(base);
  await expect(page.locator("#main").getByRole("alert").first()).toContainText("50.000 kaynak");
  await expect(page.getByText(/^Bu aralıkta/)).toHaveCount(0);
  await page.getByLabel("Başlangıç", { exact: true }).fill("2026-01-20");
  await page.getByLabel("Bitiş", { exact: true }).fill("2026-01-20");
  await page.getByRole("button", { name: "Aralığı göster", exact: true }).click();
  await expect(page.getByText(/^Bu aralıkta kayıtlı çalışma yok/)).toBeVisible();
});

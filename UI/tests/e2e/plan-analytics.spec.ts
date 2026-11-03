import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Temporal } from "temporal-polyfill";
import { FocusFixture } from "./helpers/focus-fixture";
import { auditAnalytics } from "./helpers/analytics-audit";
import { trackFaults } from "./helpers/faults";
import { EVIDENCE } from "./helpers/evidence";
let fx: FocusFixture, today: string, yesterday: string;
const faults = new WeakMap<Page, string[]>();
const url = (extra = "") => `/analytics?period=custom&fromDate=${yesterday}&toDate=${today}${extra}`;
/** Tam ilk/güncel karşılaştırma tablosu kapalı ayrıntıda durur. */
async function comparison(p: Page) {
  const box = p.locator("#main details").filter({ has: p.locator("summary", { hasText: /^Ayrıntılar$/ }) });
  if (!(await box.evaluate(el => (el as HTMLDetailsElement).open))) await box.locator("summary").click();
  return box.getByRole("region", { name: "Plan karşılaştırması", exact: true });
}
const values = async (p: Page, name: string) =>
  (await comparison(p)).getByRole("rowheader", { name, exact: true }).locator("..").getByRole("cell");
const plan = (p: Page) => p.locator("#plan");
const fact = (p: Page, term: string) => plan(p).getByText(term, { exact: true }).locator("+ dd");
const wall = (d: string, t: string) =>
  Temporal.PlainDateTime.from(`${d}T${t}`).toZonedDateTime("Europe/Istanbul").toInstant().toString();
async function read(path: string) {
  const r = await fx.api.get(path);
  expect(r.status()).toBe(200);
  return r.json();
}
async function task(seconds = 600) {
  const t = await fx.task();
  const r = await fx.api.put(`/api/tasks/${t.id}/work-definition`, {
    data: { version: t.version, hasDirectWork: true, directEstimatedSeconds: seconds, targetBudgetSeconds: null },
  });
  expect(r.status()).toBe(200);
  return r.json();
}
async function manual(id: string, start: string, end: string) {
  const r = await fx.api.post("/api/work-sessions/manual", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      taskId: id,
      startedAt: wall(yesterday, start),
      endedAt: wall(yesterday, end),
      reason: "UI29 geçmiş çalışma",
    },
  });
  expect(r.status()).toBe(201);
}
async function schedule(id: string, start: string, end: string, reason: string) {
  const day = await read(`/api/daily-plans/${yesterday}`);
  const r = await fx.api.post("/api/schedules", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      localDate: yesterday,
      taskId: id,
      kind: "Work",
      startsAt: wall(yesterday, start),
      endsAt: wall(yesterday, end),
      expectedPlanningVersion: day.planningVersion,
      reason,
    },
  });
  expect(r.status()).toBe(201);
  return r.json();
}
async function complete(id: string, action = "Complete", reason?: string) {
  const t = await read(`/api/tasks/${id}`);
  expect((await fx.api.post(`/api/tasks/${id}/state`, { data: { version: t.version, action, reason } })).status()).toBe(
    200,
  );
}
test.beforeEach(async ({ page }) => {
  fx = await FocusFixture.create();
  await fx.login(page);
  const messages: string[] = [];
  faults.set(page, messages);
  trackFaults(page, messages);
  const now = (await read("/api/analytics/actual?fromDate=2026-01-01&toDate=2026-01-01")).serverNow;
  const local = Temporal.Instant.from(now).toZonedDateTimeISO("Europe/Istanbul").toPlainDate();
  today = local.toString();
  yesterday = local.subtract({ days: 1 }).toString();
  const p = await read("/api/preferences");
  expect(
    (
      await fx.api.put("/api/preferences", {
        data: {
          version: p.version,
          values: {
            ...p.values,
            timeZoneId: "Europe/Istanbul",
            transitionSeconds: 0,
            weekly: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startMinute: 0, endMinute: 1440 })),
            exceptions: [],
          },
        },
      })
    ).status(),
  ).toBe(200);
});
test.afterEach(async ({ page }) => {
  expect(faults.get(page)).toEqual([]);
  await fx?.api.dispose();
});

test("empty plans keep null denominators in details and the old plan address lands on the plan section", async ({
  page,
}, info) => {
  await page.goto(`/analytics/plan?fromDate=${yesterday}&toDate=${today}&startToleranceSeconds=0`);
  await expect(page).toHaveURL(
    url => url.pathname === "/analytics" && url.search === `?period=custom&fromDate=${yesterday}&toDate=${today}`,
  );
  await expect(page.getByRole("heading", { name: "Planına uyum", exact: true })).toBeVisible();
  await expect(plan(page)).toContainText("Bu dönemde kabul edilmiş plan yok.");
  await expect((await values(page, "İş sayısına göre tamamlanma")).first()).toHaveText("— (payda veya kapsam yok)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await auditAnalytics(page, "plan-empty-light");
  await page.screenshot({ path: `${EVIDENCE}/plan-empty-${info.project.name}.png`, fullPage: true });
});

test("initial denominator freezes while B180 and C35 enter current plan; reasons are listed per day", async ({
  page,
}, info) => {
  const a = await task(600),
    b = await task(10800),
    c = await task(2100);
  await schedule(a.id, "09:00", "09:10", "İlk A");
  await schedule(b.id, "09:10", "12:10", "B eklendi");
  await schedule(c.id, "12:10", "12:45", "Acil C eklendi");
  await manual(a.id, "09:00", "09:10");
  await manual(c.id, "12:10", "12:45");
  await complete(a.id);
  await complete(c.id);
  const expected = await read(`/api/analytics/plans?fromDate=${yesterday}&toDate=${today}`);
  expect(Number(expected.baseline.knownEstimatedSeconds)).toBe(600);
  expect(Number(expected.current.knownEstimatedSeconds)).toBe(13500);
  expect(Number(expected.current.completedComponentCount)).toBe(2);
  expect(Number(expected.current.componentCount)).toBe(3);
  await page.goto(url());
  await expect(fact(page, "Tamamlanan iş")).toHaveText("2 / 3");
  await expect(fact(page, "Planlanan")).toHaveText("3 sa 45 dk");
  await expect(plan(page).getByRole("img", { name: /Günlük planlanan ve yapılan süre/ })).toBeVisible();
  await plan(page)
    .getByText(/^Erteleme ve düzenleme nedenleri/)
    .click();
  await expect(plan(page).getByText(/Düzenleme · .* · Acil C eklendi · 1 kez/)).toBeVisible();
  await expect((await values(page, "Tamamlanan / bağımsız iş sayısı")).first()).toHaveText("1 / 1");
  await expect((await values(page, "Tamamlanan / bağımsız iş sayısı")).nth(1)).toHaveText("2 / 3");
  await expect((await values(page, "Tamamlanan bilinen tahmin / bilinen tahmin")).nth(1)).toHaveText(
    "45 dk / 3 sa 45 dk",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await auditAnalytics(page, "plan-comparison-dark");
  await page.screenshot({ path: `${EVIDENCE}/plan-comparison-${info.project.name}.png`, fullPage: true });
});

test("12-hour task with one recorded hour has full daily quota but zero completion, unknown estimate remains visible", async ({
  page,
}) => {
  const t = await task(43200);
  await schedule(t.id, "09:00", "10:00", "Bugünlük bir saat");
  await manual(t.id, "09:00", "10:00");
  const u = await fx.task();
  expect(
    (
      await fx.api.put(`/api/tasks/${u.id}/work-definition`, {
        data: { version: u.version, hasDirectWork: true, directEstimatedSeconds: null, targetBudgetSeconds: null },
      })
    ).status(),
  ).toBe(200);
  await schedule(u.id, "10:00", "10:15", "Tahmin henüz yok");
  await page.goto(url());
  // İki blok da kota ayırır, yalnız kayıtlı çalışma saati onu karşılar.
  await expect(fact(page, "Karşılanan")).toHaveText("1 sa / 1 sa 15 dk");
  await expect(fact(page, "Tamamlanan iş")).toHaveText("0 / 2");
  await expect(plan(page)).toContainText("Karşılanan süre görevin tamamlandığı anlamına gelmez.");
  await expect((await values(page, "Günlük kota karşılama oranı")).first()).toHaveText("%100");
  await expect((await values(page, "İş sayısına göre tamamlanma")).first()).toHaveText("%0");
  await expect((await values(page, "Tahmini bilinmeyen iş sayısı")).nth(1)).toHaveText("1");
  await expect((await values(page, "Tahmin kapsamı")).nth(1)).toHaveText("%50");
});

test("defer reasons are recorded honestly and the range survives reload/back", async ({ page }) => {
  const a = await task(),
    b = await task();
  await complete(a.id, "Defer", "Toplantı uzadı");
  await complete(b.id, "Defer");
  await page.goto(url());
  await expect(plan(page)).toContainText("2 erteleme kaydı");
  await plan(page)
    .getByText(/^Erteleme ve düzenleme nedenleri/)
    .click();
  await expect(plan(page).getByText("Erteleme · Toplantı uzadı · 1 kez", { exact: true })).toBeVisible();
  await expect(plan(page).getByText("Erteleme · neden bilinmiyor · 1 kez", { exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Dönem", exact: true }).getByRole("link", { name: "Bu ay" }).click();
  await expect(page).toHaveURL(/period=month/);
  await page.reload();
  await expect(page.getByRole("link", { name: "Bu ay" })).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`fromDate=${yesterday}`));
  await expect(plan(page)).toContainText("2 erteleme kaydı");
});

test("URL validation, density failure and recovery never invent a plan", async ({ page }) => {
  await page.goto(url(`&fromDate=${yesterday}`));
  await expect(page.locator("#main").getByRole("alert")).toContainText("birden fazla");
  await page.route("**/api/analytics/plans?**", route =>
    route.fulfill({
      status: 409,
      contentType: "application/problem+json",
      body: JSON.stringify({ status: 409, code: "analytics_range_too_dense" }),
    }),
  );
  await page.goto(url());
  await expect(page.locator("#plan").getByRole("alert")).toContainText("50.000");
  await expect(page.getByText(/^Bu aralıkta/)).toBeVisible();
  await expect(await comparison(page)).toHaveCount(0);
  await page.unroute("**/api/analytics/plans?**");
  await page.locator("#plan").getByRole("button", { name: "Yeniden dene", exact: true }).click();
  await expect(await comparison(page)).toBeVisible();
});

test("legacy suggestion links show estimate accuracy without loading the removed picker", async ({ page }) => {
  const paths: string[] = [];
  page.on("request", request => paths.push(new URL(request.url()).pathname));
  await page.goto(url("&suggestionTask=00000000-0000-0000-0000-000000000001"));
  const accuracy = page.getByRole("region", { name: "Tahmin isabeti", exact: true });
  await expect(accuracy).toContainText("Henüz yeterli örnek yok");
  await expect(page.getByText("Bir görev için tahmin önerisi al", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Tahmin önerisi sonucu", exact: true })).toHaveCount(0);
  expect(paths).not.toContain("/api/analytics/estimate-suggestion");
});

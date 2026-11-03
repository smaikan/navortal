import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { Temporal } from "temporal-polyfill";
import { expect, test, type Page } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { auditAnalytics } from "./helpers/analytics-audit";
import { trackFaults } from "./helpers/faults";
import { EVIDENCE } from "./helpers/evidence";

let fx: FocusFixture;
const faults = new WeakMap<Page, string[]>();
const today = () => Temporal.Now.zonedDateTimeISO("Europe/Istanbul").toPlainDate();

async function routine(title: string, days: number, startedDaysAgo: number) {
  const start = today().subtract({ days: startedDaysAgo }).toString();
  const created = await fx.api.post("/api/recurrence-templates", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      rule: {
        startDate: start,
        timeZoneId: "Europe/Istanbul",
        frequency: "Daily",
        interval: 1,
        weekDays: [],
        monthDay: null,
        monthEnd: null,
        untilDate: null,
        dueTime: null,
        startTime: null,
        autoAddToPlan: false,
        gap: "Reject",
        overlap: "Reject",
      },
      task: {
        title,
        description: null,
        estimatedSeconds: 600,
        priority: "Normal",
        canSplit: true,
        poolId: null,
        energyDemand: null,
      },
    },
  });
  expect(created.status()).toBe(201);
  const template = (await created.json()).template;
  const made = await fx.api.post(`/api/recurrence-templates/${template.id}/materialize`, {
    headers: { "Idempotency-Key": randomUUID() },
    data: { version: template.version, fromDate: start, toDate: today().toString() },
  });
  expect(made.status()).toBe(200);
  const occurrences = (await made.json()).occurrences as { localDate: string; taskId: string }[];
  for (const o of occurrences.slice(0, days)) {
    const task = await (await fx.api.get(`/api/tasks/${o.taskId}`)).json();
    const done = await fx.api.post(`/api/tasks/${o.taskId}/state`, {
      data: { version: task.version, action: "Complete" },
    });
    expect(done.status()).toBe(200);
  }
  return template.id as string;
}
const section = (p: Page) => p.locator("#routines");
const row = (p: Page, name: RegExp) => section(p).getByRole("button", { name });

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

test("routine section reports the selected period and opens one routine in place", async ({ page }, info) => {
  const id = await routine("Kitap oku", 4, 5);
  await page.goto(
    `/analytics?period=custom&fromDate=${today().subtract({ days: 5 }).toString()}&toDate=${today().toString()}`,
  );
  const s = section(page);
  await expect(s.getByRole("heading", { name: "Rutinler", exact: true })).toBeVisible();
  // Geçmiş beş günün dördü yapıldı, biri açık kaldı; bugünkü görev oran dışında.
  await expect(s).toContainText("1 rutinde 5 görevden 4 tanesi yapıldı.");
  await expect(s.getByText("%80", { exact: true }).first()).toBeVisible();
  const open = row(page, /Kitap oku/);
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await open.click();
  await expect(open).toHaveAttribute("aria-expanded", "true");
  expect(new URL(page.url()).searchParams.get("routine")).toBe(id);
  await expect(s.getByRole("heading", { name: "Aylara göre", exact: true })).toBeVisible();
  await expect(s).toContainText("Son 4 hafta 4/5 · önceki 4 hafta 0/0");
  await expect(s).toContainText("En uzun seri");
  const dots = s.locator("i[title]");
  await expect(dots).toHaveCount(5);
  await expect(s.locator('i[title][data-kind="missed"]')).toHaveCount(1);
  await auditAnalytics(page, "routines-open");
  await page.screenshot({ path: `${EVIDENCE}/routines-open-${info.project.name}.png`, fullPage: true });
  await open.click();
  await expect(s.getByRole("heading", { name: "Aylara göre", exact: true })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("routine")).toBeNull();
});

test("small samples show counts instead of a percentage and details keep every class", async ({ page }) => {
  await routine("Spor", 2, 1);
  await page.goto("/analytics?period=week");
  await expect(section(page)).toContainText("Spor");
  await expect(row(page, /Spor/)).not.toContainText("%");
  await page.locator("#main details summary", { hasText: /^Ayrıntılar$/ }).click();
  const table = page.getByRole("region", { name: "Rutin tablosu", exact: true });
  for (const head of [
    "Tutarlılık",
    "Zamanında",
    "Sonradan",
    "Yapılmadı",
    "Bugün bekliyor",
    "Atlandı",
    "Görev oluşmadı",
  ])
    await expect(table.getByRole("columnheader", { name: head, exact: true })).toBeVisible();
  await expect(table.getByRole("rowheader", { name: "Spor", exact: true })).toBeVisible();
});

test("empty state links to routines and the row layout holds at every width", async ({ page }, info) => {
  await page.goto("/analytics?period=week");
  await expect(section(page)).toContainText("Henüz rutinin yok.");
  await expect(section(page).getByRole("link", { name: "Rutinlere git", exact: true })).toHaveAttribute(
    "href",
    "/recurrences",
  );
  await routine("Hafta sonu yürüyüşü ve iki satıra taşabilecek kadar uzun bir rutin adı", 3, 5);
  await page.goto("/analytics?period=month");
  await row(page, /Hafta sonu/).click();
  await expect(section(page).getByRole("heading", { name: "Aylara göre", exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => {
      const root = document.querySelector("#routines")!;
      const r = root.getBoundingClientRect();
      const out = [...root.querySelectorAll("*")].filter(
        e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > r.right + 1,
      );
      return {
        out: out.length,
        scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    expect(overflow, `width ${width}`).toEqual({ out: 0, scroll: false });
    await page.screenshot({ path: `${EVIDENCE}/routines-${width}-${info.project.name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
});

test("dark theme, keyboard and the accessibility tree work for an open routine", async ({ page }, info) => {
  await routine("Kitap oku", 4, 5);
  await page.goto("/analytics?period=month");
  const s = section(page),
    open = row(page, /Kitap oku/);
  await open.focus();
  await page.keyboard.press("Enter");
  await expect(open).toHaveAttribute("aria-expanded", "true");
  await expect(open).toBeFocused();
  await page.keyboard.press("Space");
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(s.getByRole("img", { name: /^Kas: \d+ görevden \d+ tanesi yapıldı$/ })).toBeVisible();
  await expect(open).toHaveAccessibleName(/^Kitap oku, Her gün, tutarlılık (%\d+|\d+\/\d+)/);
  writeFileSync(`${EVIDENCE}/routines-aria-${info.project.name}.yml`, await s.ariaSnapshot());
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await auditAnalytics(page, "routines-dark");
  await page.screenshot({ path: `${EVIDENCE}/routines-dark-${info.project.name}.png`, fullPage: true });
});

test("routine page link opens the same routine in analytics and scrolls to it", async ({ page }) => {
  const id = await routine("Spor", 3, 4);
  await page.goto(`/recurrences?templateId=${id}`);
  await page.getByRole("link", { name: "Analizde gör", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/analytics\\?period=month&routine=${id}#routines$`));
  await expect(row(page, /Spor/)).toHaveAttribute("aria-expanded", "true");
  await expect(section(page).getByRole("heading", { name: "Rutinler", exact: true })).toBeInViewport();
  await page.reload();
  await expect(row(page, /Spor/)).toHaveAttribute("aria-expanded", "true");
});

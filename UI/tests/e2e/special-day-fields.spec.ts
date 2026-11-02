import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Temporal } from "temporal-polyfill";
import { FocusFixture } from "./helpers/focus-fixture";
import { trackFaults } from "./helpers/faults";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";
import type { SpecialDay } from "../../src/features/special-days/model";

let fx: FocusFixture;
const faults = new WeakMap<Page, string[]>();
const form = (page: Page, edit = false) =>
  page.getByRole("dialog", { name: edit ? "Özel günü düzenle" : "Özel gün ekle", exact: true });
async function days() {
  return (await (await fx.api.get("/api/special-days?limit=100")).json()).items as SpecialDay[];
}
async function open(page: Page) {
  await page.goto("/reminders/special-days");
  await page.getByRole("button", { name: "Özel gün ekle", exact: true }).click();
  return form(page);
}
test.beforeEach(async ({ page }) => {
  fx = await FocusFixture.create();
  await fx.login(page);
  const errors: string[] = [];
  faults.set(page, errors);
  trackFaults(page, errors);
});
test.afterEach(async ({ page }) => {
  await fx.api.dispose();
  expect(faults.get(page)).toEqual([]);
});

test("special day menus escape cards and monthly lists and stay inside the viewport", async ({ page }, info) => {
  const today = Temporal.Now.plainDateISO("Europe/Istanbul");
  const entries = [
    { title: "Yakın özel gün", date: today.add({ days: 3 }), selector: ".special-card" },
    { title: "Sonraki özel gün", date: today.add({ days: 60 }), selector: ".special-row" },
  ];
  for (const entry of entries) {
    const response = await fx.api.post("/api/special-days", {
      headers: { "Idempotency-Key": randomUUID() },
      data: {
        title: entry.title,
        kind: "Birthday",
        month: entry.date.month,
        day: entry.date.day,
        year: entry.date.year,
        recurrence: "Once",
        nonWorking: false,
        reminder: "None",
      },
    });
    expect(response.status()).toBe(201);
  }
  await page.goto("/reminders/special-days");
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(t => (document.documentElement.dataset.theme = t), theme);
    for (const entry of entries) {
      const trigger = page
        .locator(entry.selector)
        .filter({ hasText: entry.title })
        .getByRole("button", { name: `${entry.title} işlemleri`, exact: true });
      await trigger.click();
      const menu = page.getByRole("menu", { name: `${entry.title} işlemleri`, exact: true });
      await expect(menu.getByRole("menuitem", { name: "Düzenle", exact: true })).toBeFocused();
      expect(await menu.evaluate(el => el.matches(":popover-open"))).toBe(true);
      await page.keyboard.press("End");
      await expect(menu.getByRole("menuitem", { name: "Sil", exact: true })).toBeFocused();
      await menu.evaluate(async el => {
        await Promise.all(el.getAnimations().map(a => a.finished.catch(() => {})));
      });
      const box = (await menu.boundingBox())!,
        view = page.viewportSize()!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(view.width);
      expect(box.y + box.height).toBeLessThanOrEqual(view.height);
      for (const item of await menu.getByRole("menuitem").all()) {
        expect(
          await item.evaluate(el => {
            const rect = el.getBoundingClientRect();
            return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
          }),
        ).toBe(true);
      }
      expect(await menu.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
      await page.screenshot({
        path: `${EVIDENCE}/special-menu-${entry.selector.slice(1)}-${theme}-${info.project.name}.png`,
      });
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await menu.getByRole("menuitem", { name: "Düzenle", exact: true }).click();
      await expect(form(page, true)).toBeVisible();
      await form(page, true).getByRole("button", { name: "Özel günü düzenle panelini kapat", exact: true }).click();
      await expect(form(page, true)).toBeHidden();
    }
    await auditTask(page, `menus-${theme}`, "special-day-menus", theme);
  }
  if (info.project.name === "chromium") {
    await page.setViewportSize({ width: 320, height: 700 });
    for (const entry of entries) {
      await page.locator(entry.selector).filter({ hasText: entry.title }).getByRole("button").click();
      const box = (await page.getByRole("menu", { name: `${entry.title} işlemleri`, exact: true }).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      await page.keyboard.press("Escape");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("special day fields: named month/day and the annual record use the real API", async ({ page }) => {
  await page.goto("/reminders/special-days");
  await page.getByRole("button", { name: "Özel gün ekle", exact: true }).click();
  const f = form(page),
    title = `Şubat günü ${randomUUID().slice(-8)}`;
  await f.getByLabel("Ad", { exact: true }).fill(title);
  await f.getByLabel("Gün", { exact: true }).selectOption("6");
  await f.getByLabel("Ay", { exact: true }).selectOption("2");
  await expect(f.getByLabel("Gün", { exact: true }).locator("option:checked")).toHaveText("06");
  await expect(f.getByLabel("Ay", { exact: true }).locator("option:checked")).toHaveText("Şubat");
  // Telefon formu alttan açar. Konumu hareket bitince karşılaştırıyoruz.
  await f.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished)));
  expect((await f.getByLabel("Gün", { exact: true }).boundingBox())!.y).toBe(
    (await f.getByLabel("Ay", { exact: true }).boundingBox())!.y,
  );
  await expect(f.locator('input[type="date"]')).toHaveCount(0);
  await expect(f.getByRole("checkbox", { name: "Seçili yıldan başlasın" })).toHaveCount(0);
  await f.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(f).toBeHidden();
  expect((await days()).find(d => d.title === title)).toMatchObject({
    day: 6,
    month: 2,
    year: null,
    recurrence: "Yearly",
  });
});

test("special day fields: named month/day layout is aligned in both themes", async ({ page }, info) => {
  const f = await open(page);
  await f.getByLabel("Ad", { exact: true }).fill("Özel gün görünümü");
  await f.getByLabel("Gün", { exact: true }).selectOption("6");
  await f.getByLabel("Ay", { exact: true }).selectOption("2");
  // Telefon formu alttan açar. Konumu hareket bitince karşılaştırıyoruz.
  await f.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished)));
  expect((await f.getByLabel("Gün", { exact: true }).boundingBox())!.y).toBe(
    (await f.getByLabel("Ay", { exact: true }).boundingBox())!.y,
  );
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(t => (document.documentElement.dataset.theme = t), theme);
    await auditTask(page, `special-${theme}`, "special-day-fields", theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${EVIDENCE}/special-day-${theme}-${info.project.name}.png`, fullPage: true });
  }
});

test("special day fields: this-year records use the account year without a year input", async ({ page }) => {
  const title = `Bu yıl ${randomUUID().slice(-8)}`;
  const once = await open(page);
  await once.getByLabel("Ad", { exact: true }).fill(`${title} bir kez`);
  await once.getByLabel("Gün", { exact: true }).selectOption("6");
  await once.getByLabel("Ay", { exact: true }).selectOption("2");
  await once.getByRole("radio", { name: "Yalnız bu yıl", exact: true }).check();
  await once.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(once).toBeHidden();
  expect((await days()).find(d => d.title === `${title} bir kez`)).toMatchObject({
    year: Temporal.Now.zonedDateTimeISO("Europe/Istanbul").year,
    recurrence: "Once",
  });
});

test("special day fields: impossible dates stay in the form; annual leap day saves without a year", async ({
  page,
}) => {
  const f = await open(page),
    title = `Artık gün ${randomUUID().slice(-8)}`;
  await f.getByLabel("Ad", { exact: true }).fill(title);
  await f.getByLabel("Gün", { exact: true }).selectOption("31");
  await f.getByLabel("Ay", { exact: true }).selectOption("4");
  await f.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(f.getByRole("alert")).toContainText("Geçerli bir gün ve ay seç");
  expect(await days()).toHaveLength(0);
  await f.getByLabel("Gün", { exact: true }).selectOption("29");
  await f.getByLabel("Ay", { exact: true }).selectOption("2");
  await f.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(f).toBeHidden();
  expect((await days())[0]).toMatchObject({ month: 2, day: 29, year: null });
});

test("special day fields: name edits preserve existing one-off years and annual start boundaries", async ({ page }) => {
  for (const recurrence of ["Once", "Yearly"] as const) {
    const title = `${recurrence} eski ${randomUUID().slice(-8)}`;
    const result = await fx.api.post("/api/special-days", {
      headers: { "Idempotency-Key": randomUUID() },
      data: { title, kind: "Birthday", month: 2, day: 6, year: 2024, recurrence, nonWorking: false, reminder: "None" },
    });
    expect(result.status()).toBe(201);
    await page.goto("/reminders/special-days");
    await page.getByRole("listitem").filter({ hasText: title }).getByRole("button").click();
    await page.getByRole("menuitem", { name: "Düzenle", exact: true }).click();
    const f = form(page, true);
    await f.getByLabel("Ad", { exact: true }).fill(`${title} güncel`);
    await f.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(f).toBeHidden();
    expect((await days()).find(d => d.title === `${title} güncel`)).toMatchObject({ year: 2024, recurrence });
  }
});

test("special day fields: a confirmed save closes before a held follow-up list read", async ({ page }) => {
  const f = await open(page),
    title = `Onaylanan gün ${randomUUID().slice(-8)}`;
  await f.getByLabel("Ad", { exact: true }).fill(title);
  await f.getByLabel("Gün", { exact: true }).selectOption("6");
  await f.getByLabel("Ay", { exact: true }).selectOption("2");
  let release!: () => void;
  const held = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route("**/api/special-days*", async route => {
    if (route.request().method() === "GET" && new URL(route.request().url()).pathname === "/api/special-days")
      await held;
    await route.continue();
  });
  try {
    await f.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(f).toBeHidden();
    expect((await days()).find(d => d.title === title)).toBeTruthy();
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
  await expect(page.locator(".special-days")).toContainText(title);
});

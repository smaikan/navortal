import { expect, test, type Page } from "@playwright/test";
import { Temporal } from "temporal-polyfill";
import { FocusFixture } from "./helpers/focus-fixture";
import { auditTask } from "./helpers/task-audit";
import { trackFaults } from "./helpers/faults";
import { EVIDENCE } from "./helpers/evidence";

let fx: FocusFixture;
const faults = new WeakMap<Page, string[]>();
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

test("temporal fields: labelled task day range saves on close, clears and fits in both themes", async ({
  page,
}, info) => {
  const task = await fx.task();
  const date = Temporal.Now.zonedDateTimeISO("Europe/Istanbul").toPlainDate().add({ days: 1 });
  const from = date.toString(),
    to = date.add({ days: 2 }).toString();
  const saved = async () => await (await fx.api.get(`/api/tasks/${task.id}`)).json();
  await page.goto(`/tasks?taskId=${task.id}`);
  await expect(page.getByLabel("Son teslim", { exact: true })).toHaveCount(0);
  await page.getByLabel("başlangıç tarihi", { exact: true }).fill(from);
  await page.getByLabel("bitiş tarihi", { exact: true }).fill(to);
  expect((await saved()).plannedTo).toBeNull();
  await page.getByRole("button", { name: "Görev ayrıntısı panelini kapat", exact: true }).click();
  await expect(page.getByLabel("başlangıç tarihi", { exact: true })).toHaveCount(0);
  await expect.poll(async () => (await saved()).plannedTo).toBe(to);
  await page.goto(`/tasks?taskId=${task.id}`);
  await expect(page.getByLabel("başlangıç tarihi", { exact: true })).toHaveValue(from);
  await expect(page.getByLabel("bitiş tarihi", { exact: true })).toHaveValue(to);
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(value => (document.documentElement.dataset.theme = value), theme);
    await page.getByLabel("başlangıç tarihi", { exact: true }).scrollIntoViewIfNeeded();
    await auditTask(page, `task-${theme}`, "temporal-fields", theme);
    const controls = await page.locator(".temporal-control:not(.temporal-navigation) input").evaluateAll(inputs =>
      inputs.map(input => {
        const rect = input.getBoundingClientRect();
        return { width: rect.width, height: rect.height, font: parseFloat(getComputedStyle(input).fontSize) };
      }),
    );
    expect(controls.length).toBeGreaterThanOrEqual(2);
    for (const control of controls) {
      expect(control.width).toBeGreaterThanOrEqual(200);
      expect(control.height).toBeGreaterThanOrEqual(44);
      expect(control.font).toBeGreaterThanOrEqual(16);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${EVIDENCE}/temporal-task-${theme}-${info.project.name}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "tarih aralığını temizle", exact: true }).click();
  await page.getByRole("button", { name: "Görev ayrıntısı panelini kapat", exact: true }).click();
  await expect.poll(async () => (await saved()).plannedFrom).toBeNull();
});

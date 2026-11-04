import { randomUUID } from "node:crypto";
import { Temporal } from "temporal-polyfill";
import { test, expect, type Page } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { trackFaults } from "./helpers/faults";
import { EVIDENCE } from "./helpers/evidence";
import type { Template, Rule } from "../../src/features/recurrence/model";

let fx: FocusFixture;
const faults = new WeakMap<Page, string[]>();
const day = (n = 0) => Temporal.Now.zonedDateTimeISO("Europe/Istanbul").toPlainDate().add({ days: n }).toString();
const modal = (p: Page, name: string) => p.getByRole("dialog", { name, exact: true });
const detail = (p: Page) => p.getByRole("region", { name: "Seçili seri", exact: true });
async function seed(r: Partial<Rule> = {}, title = `Rutin ${randomUUID().slice(-8)}`): Promise<Template> {
  const response = await fx.api.post("/api/recurrence-templates", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      rule: {
        startDate: day(),
        timeZoneId: "Europe/Istanbul",
        frequency: "Daily",
        interval: 1,
        weekDays: [],
        monthDay: null,
        monthEnd: null,
        untilDate: null,
        dueTime: null,
        startTime: null,
        autoAddToPlan: true,
        gap: "Reject",
        overlap: "Reject",
        ...r,
      },
      task: {
        title,
        description: null,
        estimatedSeconds: null,
        priority: "Normal",
        canSplit: true,
        poolId: null,
        energyDemand: null,
      },
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).template;
}
const read = async (id: string): Promise<Template> => (await fx.api.get(`/api/recurrence-templates/${id}`)).json();
const dayItems = async (date: string) =>
  (await (await fx.api.get(`/api/daily-plans/${date}/items`)).json()).items.length;
const projected = async (from: string, to = from) =>
  (await (await fx.api.get(`/api/recurrence-templates/projection?FromDate=${from}&ToDate=${to}`)).json()).items;

// Rutin önizlemesi hesap geneli olduğundan her test kendi kullanıcısıyla başlar.
test.beforeEach(async ({ page }) => {
  fx = await FocusFixture.create();
  const list: string[] = [];
  faults.set(page, list);
  trackFaults(page, list);
  await fx.login(page);
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
  await fx.clean();
  await fx.api.dispose();
  expect(faults.get(page)).toEqual([]);
});

test("end date is optional when creating and can be changed or removed when editing", async ({ page }, info) => {
  const title = `Bitişli ${randomUUID().slice(-8)}`;
  await page.goto("/recurrences");
  await page.getByRole("button", { name: "Rutin oluştur", exact: true }).click();
  const f = modal(page, "Rutin oluştur");
  await f.getByLabel("Rutin adı", { exact: true }).fill(title);
  await expect(f.getByText("Boş bırakırsan rutin sen durdurana kadar sürer.")).toBeVisible();
  await f.getByLabel("Bitiş tarihi (isteğe bağlı)", { exact: true }).fill(day(20));
  await f.getByRole("checkbox", { name: "Gün planlarına otomatik ekle", exact: true }).check();
  await page.screenshot({ path: `${EVIDENCE}/routine-end-form-${info.project.name}.png` });
  await f.getByRole("button", { name: "Rutin oluştur", exact: true }).click();
  await expect(f).toBeHidden();
  await expect(detail(page)).toContainText("bitiş");
  const list = (await (await fx.api.get("/api/recurrence-templates?limit=5")).json()).items as Template[];
  const created = list.find(t => t.task.title === title)!;
  expect(created.rule.untilDate).toBe(day(20));
  await detail(page).getByRole("button", { name: "Düzenle", exact: true }).click();
  const edit = modal(page, "Rutini düzenle");
  await edit.getByRole("button", { name: "Bitiş tarihini kaldır", exact: true }).click();
  await edit.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(edit).toBeHidden();
  await expect.poll(async () => (await read(created.id)).rule.untilDate).toBeNull();
});

test("far days show a labelled preview that can be skipped or made real", async ({ page }, info) => {
  const title = `Uzak ${randomUUID().slice(-8)}`;
  await seed({ startDate: day(40), untilDate: day(41) }, title);
  await page.goto(`/calendar?date=${day(40)}`);
  const cells = page.getByRole("button", { name: /1 rutin önizlemesi/ });
  await expect(cells).toHaveCount(2);
  await expect(page.locator(".routine-projected-dot")).toHaveCount(2);
  await page.screenshot({ path: `${EVIDENCE}/routine-preview-month-${info.project.name}.png` });
  await cells.first().click();
  const preview = page.getByRole("region", { name: "Rutin önizlemesi", exact: true });
  await expect(preview).toContainText(title);
  await page.screenshot({ path: `${EVIDENCE}/routine-preview-day-${info.project.name}.png` });
  await preview.getByRole("button", { name: `Bu günü atla: ${title}`, exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect.poll(async () => (await projected(day(40), day(41))).length).toBe(1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /1 rutin önizlemesi/ }).click();
  await page.getByRole("button", { name: `Plana ekle: ${title}`, exact: true }).click();
  await expect.poll(() => dayItems(day(41))).toBe(1);
  await expect.poll(() => dayItems(day(40))).toBe(0);
  expect(await projected(day(40), day(41))).toEqual([]);
});

test("pausing removes only future untouched plan items", async ({ page }) => {
  const t = await seed();
  const made = await fx.api.post(`/api/recurrence-templates/${t.id}/materialize`, {
    headers: { "Idempotency-Key": randomUUID() },
    data: { version: t.version, fromDate: day(), toDate: day(2) },
  });
  expect(made.status()).toBe(200);
  await page.goto(`/recurrences?templateId=${t.id}`);
  await detail(page).getByRole("button", { name: "Rutin için diğer işlemler", exact: true }).click();
  await page.getByRole("menuitem", { name: "Seriyi pasif yap", exact: true }).click();
  const f = modal(page, "Serinin etkinliğini değiştir");
  await expect(f).toContainText("dokunmadığın plan öğeleri kaldırılır");
  await f.getByRole("button", { name: "Değişikliği onayla", exact: true }).click();
  await expect(f.getByText(/^Plandan kaldırılan öğe: \d+$/)).toBeVisible();
  expect(await dayItems(day())).toBe(1);
  expect(await dayItems(day(2))).toBe(0);
});

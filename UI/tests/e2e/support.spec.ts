import { Temporal } from "temporal-polyfill";
import { test, expect, type Page } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { trackFaults } from "./helpers/faults";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";

test.describe.configure({ mode: "default" });
let fx: FocusFixture, foreign: FocusFixture;
const faults = new WeakMap<Page, string[]>();
const today = () => Temporal.Now.zonedDateTimeISO("Europe/Istanbul").toPlainDate().toString();
async function prefs(mode = "Preview", enabled = true) {
  const p = await (await fx.api.get("/api/preferences")).json();
  const r = await fx.api.put("/api/preferences", {
    data: {
      version: p.version,
      values: {
        ...p.values,
        timeZoneId: "Europe/Istanbul",
        supportEnabled: enabled,
        planningMode: mode,
        transitionSeconds: 0,
        minimumSplitSeconds: 60,
        weekly: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startMinute: 0, endMinute: 1440 })),
        exceptions: [],
      },
    },
  });
  expect(r.status()).toBe(200);
}
const support = async (date: string) => (await fx.api.get(`/api/support/days/${date}`)).json();

test.beforeAll(async () => {
  fx = await FocusFixture.create();
  foreign = await FocusFixture.create();
});
test.afterAll(async () => {
  await fx?.api.dispose();
  await foreign?.api.dispose();
});
test.beforeEach(async ({ page }) => {
  await fx.clean();
  await prefs();
  const list: string[] = [];
  faults.set(page, list);
  trackFaults(page, list);
  await fx.login(page);
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
  await fx.clean();
  expect(faults.get(page)).toEqual([]);
});

test("task energy is an inline choice that saves at once on the current version and enforces owner isolation", async ({
  page,
}, info) => {
  const t = await fx.task(),
    other = await foreign.task();
  await page.goto(`/tasks?taskId=${t.id}`);
  const group = page.getByRole("group", { name: "Efor ihtiyacı", exact: true });
  await expect(group).toBeVisible();
  await expect(page.getByRole("button", { name: "İşin efor ihtiyacını seç" })).toHaveCount(0);
  await expect(group.getByRole("radio", { name: "Belirtilmedi" })).toBeChecked();
  // Diğer cihaz görevi önce değiştirir. Seçim yine son sürüme uygulanır.
  expect(
    (await fx.api.put(`/api/tasks/${t.id}/energy`, { data: { version: t.version, energyDemand: "Low" } })).status(),
  ).toBe(200);
  await group.getByRole("radio", { name: "Yüksek", exact: true }).check();
  await expect.poll(async () => (await (await fx.api.get(`/api/tasks/${t.id}`)).json()).energyDemand).toBe("High");
  await expect(group.getByRole("radio", { name: "Yüksek", exact: true })).toBeChecked();
  await auditTask(page, "task-energy", "support");
  await page.screenshot({ path: `${EVIDENCE}/support-energy-${info.project.name}.png` });
  await group.getByRole("radio", { name: "Belirtilmedi", exact: true }).check();
  await expect.poll(async () => (await (await fx.api.get(`/api/tasks/${t.id}`)).json()).energyDemand).toBeNull();
  expect(
    (
      await fx.api.put(`/api/tasks/${other.id}/energy`, { data: { version: other.version, energyDemand: "High" } })
    ).status(),
  ).toBe(404);
  const d = await support(today());
  expect(
    (
      await fx.api.put(`/api/support/days/${today()}`, {
        data: { version: d.version, availableEnergy: null, criticalTaskIds: [other.id] },
      })
    ).status(),
  ).toBe(404);
});

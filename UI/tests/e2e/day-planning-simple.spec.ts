import { randomUUID } from "node:crypto";
import { Temporal } from "temporal-polyfill";
import { test, expect, type Page } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { menuAction } from "./helpers/menu";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";
import { trackFaults } from "./helpers/faults";
let fx: FocusFixture;
const date = (days = 0) => Temporal.Now.zonedDateTimeISO("Europe/Istanbul").toPlainDate().add({ days }).toString();
const modal = (page: Page) => page.getByRole("dialog", { name: "Görev Ertele", exact: true });
test.beforeEach(async ({ page }) => {
  fx = await FocusFixture.create();
  await fx.login(page);
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
  await fx.api.dispose();
});
test("routine tasks cannot be deferred; calm menu text has readable size and weight", async ({ page }, info) => {
  const normal = await fx.task();
  await item(normal.id);
  const created = await fx.api.post("/api/recurrence-templates", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      rule: { startDate: date(), untilDate: date(), timeZoneId: "Europe/Istanbul", frequency: "Daily" },
      task: { title: "Ertelemeden korunan rutin", estimatedSeconds: 600 },
    },
  });
  expect(created.status()).toBe(201);
  const template = (await created.json()).template;
  const generated = await fx.api.post(`/api/recurrence-templates/${template.id}/materialize`, {
    headers: { "Idempotency-Key": randomUUID() },
    data: { version: template.version, fromDate: date(), toDate: date() },
  });
  expect(generated.status()).toBe(200);
  const routine = (await generated.json()).occurrences[0];
  await item(routine.taskId);
  await page.goto("/planning");
  await expect(page.getByRole("region", { name: "Gün planı", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Plan menüsü", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Plan menüsü", exact: true });
  const calm = menu.locator(".calm-toggle");
  const style = await calm.evaluate(el => ({
    size: getComputedStyle(el).fontSize,
    weight: getComputedStyle(el).fontWeight,
    parentSize: getComputedStyle(el.parentElement!).fontSize,
  }));
  expect(style.size).toBe(style.parentSize);
  expect(Number(style.weight)).toBe(400);
  await page.screenshot({ path: `${EVIDENCE}/calm-menu-${info.project.name}.png` });
  await menu.getByRole("menuitem", { name: "Görev Ertele", exact: true }).click();
  const f = modal(page),
    row = f.getByRole("listitem").filter({ hasText: "Ertelemeden korunan rutin" });
  await expect(row.getByRole("checkbox")).toBeDisabled();
  await expect(row.getByText("Rutin görevi · Ertelenemez", { exact: true })).toBeVisible();
  await expect(row.locator('input[type="date"]')).toBeDisabled();
  await f.getByRole("checkbox", { name: normal.title, exact: true }).check();
  await auditTask(page, "routine-protection", "day-simple");
  const applied = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/defer-tasks"));
  await f.getByRole("button", { name: "Ertele", exact: true }).click();
  const response = await applied;
  expect(response.status(), await response.text()).toBe(200);
  await expect(f).toBeHidden();
  const source = await (await fx.api.get(`/api/daily-plans/${date()}/items`)).json();
  expect(source.items.some((x: { taskId: string }) => x.taskId === routine.taskId)).toBe(true);
  const target = await (await fx.api.get(`/api/daily-plans/${date(1)}/items`)).json();
  expect(target.items.map((x: { taskId: string }) => x.taskId)).toEqual([normal.id]);
});
async function item(taskId: string, day = date()) {
  const r = await fx.api.post(`/api/daily-plans/${day}/items`, { data: { taskId } });
  expect(r.status()).toBe(201);
  return r.json();
}
async function open(page: Page, day = date()) {
  await page.goto(`/planning?date=${day}`);
  await expect(page.getByRole("region", { name: "Gün planı", exact: true })).toBeVisible();
  await menuAction(page, "Plan menüsü", "Görev Ertele");
  await expect(modal(page)).toBeVisible();
}
test("simple menu and per-task dates defer directly without preview, confirmation or starting work", async ({
  page,
}, info) => {
  const faults: string[] = [];
  trackFaults(page, faults);
  const a = await fx.task(),
    b = await fx.task(),
    done = await fx.task();
  await item(a.id);
  await item(b.id);
  const completed = await item(done.id);
  expect(
    (await fx.api.post(`/api/day-items/${completed.id}/complete`, { data: { version: completed.version } })).status(),
  ).toBe(200);
  expect(
    (await fx.api.put(`/api/tasks/${a.id}/energy`, { data: { version: a.version, energyDemand: "High" } })).status(),
  ).toBe(200);
  await page.goto("/planning");
  await expect(page.locator(".r2-plan-row").filter({ hasText: a.title })).toContainText("Efor: Yüksek");
  await expect(page.getByRole("button", { name: "Günlük destekler", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Plan menüsü", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Plan menüsü", exact: true });
  // Sakin görünüm, Görev Ertele, gün notu, gün özeti, Acil işe geç ve çalışma saatleri bağlantısı.
  await expect(menu.getByRole("menuitem")).toHaveCount(6);
  await expect(menu.getByRole("menuitem", { name: "Çalışma saatleri", exact: true })).toBeVisible();
  for (const name of [
    "Günü otomatik planla",
    "Günlere dağıt",
    "Bugünü hafiflet",
    "Plan geçmişi",
    "Kalan işi başka güne taşı",
  ])
    await expect(menu.getByRole("menuitem", { name, exact: true })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Görev Ertele", exact: true }).click();
  const f = modal(page);
  await expect(f.getByRole("checkbox")).toHaveCount(2);
  const aDate = f.getByLabel(`${a.title} için tarih`, { exact: true }),
    bDate = f.getByLabel(`${b.title} için tarih`, { exact: true });
  await expect(aDate).toBeDisabled();
  await expect(bDate).toBeDisabled();
  await f.getByRole("checkbox", { name: a.title, exact: true }).check();
  await expect(aDate).toBeEnabled();
  await expect(aDate).toHaveValue(date(1));
  await f.getByRole("checkbox", { name: b.title, exact: true }).check();
  await bDate.fill(date(3));
  await expect(aDate).toHaveValue(date(1));
  await auditTask(page, "defer", "day-simple");
  await page.screenshot({ path: `${EVIDENCE}/defer-${info.project.name}.png` });
  let writes = 0,
    dialogs = 0;
  page.on("dialog", async d => {
    dialogs++;
    await d.dismiss();
  });
  page.on("request", r => {
    if (r.method() !== "GET" && r.url().includes("/api/")) writes++;
  });
  await f.getByRole("button", { name: "Ertele", exact: true }).click();
  await expect(f).toBeHidden();
  await expect(page.locator(".r2-plan-row").filter({ hasText: a.title })).toHaveCount(0);
  expect(writes).toBe(1);
  expect(dialogs).toBe(0);
  for (const [task, target] of [
    [a, date(1)],
    [b, date(3)],
  ] as const) {
    const data = await (await fx.api.get(`/api/daily-plans/${target}/items`)).json();
    expect(data.items.some((x: { taskId: string }) => x.taskId === task.id)).toBe(true);
  }
  expect((await (await fx.api.get("/api/sync")).json()).workSessionId).toBeNull();
  expect(faults).toEqual([]);
});
test("unknown deferral reuses only its original key, and offline writes are never queued", async ({
  page,
  context,
}) => {
  const task = await fx.task();
  await item(task.id);
  await open(page);
  const f = modal(page);
  await f.getByRole("checkbox", { name: task.title, exact: true }).check();
  await context.setOffline(true);
  await f.getByRole("button", { name: "Ertele", exact: true }).click();
  await expect(f.getByRole("alert")).toBeVisible();
  await context.setOffline(false);
  const intents: { body: string | null; key: string | undefined }[] = [];
  await page.route("**/api/calendar/days/*/defer-tasks", async route => {
    intents.push({ body: route.request().postData(), key: route.request().headers()["idempotency-key"] });
    const response = await route.fetch();
    if (intents.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await f.getByRole("button", { name: "Ertele", exact: true }).click();
  await expect(f.getByRole("button", { name: "Sonucu güvenle al", exact: true })).toBeVisible();
  expect(intents).toHaveLength(1);
  await expect(f.getByRole("checkbox", { name: task.title, exact: true })).toBeDisabled();
  await f.getByRole("button", { name: "Sonucu güvenle al", exact: true }).click();
  await expect(f).toBeHidden();
  expect(intents).toHaveLength(2);
  expect(intents[1]).toEqual(intents[0]);
  expect(intents[0].key).toBeTruthy();
  const target = await (await fx.api.get(`/api/daily-plans/${date(1)}/items`)).json();
  expect(target.items.filter((x: { taskId: string }) => x.taskId === task.id)).toHaveLength(1);
});
test("day review shows only the chosen day's actual and completions, stays read-only and calm view lives in the menu", async ({
  page,
}, info) => {
  const task = await fx.task();
  await item(task.id, date(-2));
  expect(
    (
      await fx.api.post("/api/work-sessions/manual", {
        headers: { "Idempotency-Key": randomUUID() },
        data: {
          taskId: task.id,
          startedAt: `${date(-2)}T09:00:00+03:00`,
          endedAt: `${date(-2)}T09:30:00+03:00`,
          reason: "Owned selected-day review",
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto(`/planning?date=${date(-2)}`);
  await expect(page.getByRole("region", { name: "Gün planı", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sakin görünüm", exact: true })).toHaveCount(0);
  await menuAction(page, "Plan menüsü", "Sakin görünüm: kapalı, aç");
  await page.getByRole("button", { name: "Plan menüsü", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Sakin görünüm: açık, kapat", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const writes: string[] = [];
  page.on("request", r => {
    if (r.method() !== "GET" && r.url().includes("/api/")) writes.push(r.url());
  });
  await menuAction(page, "Plan menüsü", "Gün sonunu gözden geçir");
  const f = page.getByRole("dialog", { name: "Gün sonu özeti", exact: true });
  await expect(f.locator(`time[datetime="${date(-2)}"]`)).toBeVisible();
  await expect(f.getByRole("heading", { name: /Çalışma kayıtları/ })).toContainText("1");
  await expect(f.getByRole("heading", { name: /Tamamlanan görevler/ })).toContainText("0");
  await expect(f.getByText(task.title, { exact: true })).toBeVisible();
  await expect(f.locator(".day-review-metrics")).toContainText("30 dk");
  await expect(f.getByRole("checkbox")).toHaveCount(0);
  await expect(f.getByRole("textbox")).toHaveCount(0);
  await f.getByRole("button", { name: "Yenile", exact: true }).click();
  await auditTask(page, "review", "day-simple");
  await page.screenshot({ path: `${EVIDENCE}/review-${info.project.name}.png` });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await auditTask(page, "review-dark", "day-simple", "dark");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(writes).toEqual([]);
});

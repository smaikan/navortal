import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";
import { blockAction, menuAction } from "./helpers/menu";
import { switchAccount } from "./helpers/session";
const future = (offset = 0) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 15 + offset)).toISOString().slice(0, 10);
};
async function fixture(page: Page) {
  const fx = await FocusFixture.create(),
    task = await fx.task();
  const prefs = await (await fx.api.get("/api/preferences")).json();
  expect(
    (
      await fx.api.put("/api/preferences", {
        data: { version: prefs.version, values: { ...prefs.values, timeZoneId: "Europe/Istanbul" } },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await fx.api.put(`/api/tasks/${task.id}/work-definition`, {
        data: { version: task.version, hasDirectWork: true, directEstimatedSeconds: 43200, targetBudgetSeconds: null },
      })
    ).status(),
  ).toBe(200);
  const result = await fx.api.post("/api/pools", { data: { name: `Gelecek ay havuzu ${randomUUID().slice(-6)}` } });
  expect(result.status()).toBe(201);
  const pool = await result.json();
  const classification = await (await fx.api.get(`/api/tasks/${task.id}/classification`)).json();
  expect(
    (
      await fx.api.put(`/api/tasks/${task.id}/classification`, {
        data: { version: classification.version, ...classification.values, poolId: pool.id, applyToSubtree: false },
      })
    ).status(),
  ).toBe(200);
  const past = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const actual = await fx.api.post("/api/work-sessions/manual", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      taskId: task.id,
      startedAt: `${past}T06:00:00Z`,
      endedAt: `${past}T07:00:00Z`,
      reason: "UI33 owned previous work",
    },
  });
  expect(actual.status()).toBe(201);
  const work = await actual.json();
  await fx.login(page);
  await page.goto(`/pool?id=${pool.id}`);
  await expect(page.getByRole("button", { name: `${task.title} ayrıntısını aç`, exact: true })).toBeVisible();
  return { fx, task, pool, work };
}
async function open(page: Page, title: string, date: string) {
  await menuAction(page, `${title} havuz görevi menüsü`, "Güne planla");
  const dialog = page.getByRole("dialog", { name: "Güne planla", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Plan günü", { exact: true })).toBeEnabled();
  await dialog.getByLabel("Plan günü", { exact: true }).fill(date);
  return dialog;
}
test("H/E: pool task reaches a future day by keyboard, receives 90 minutes and moves with the same identity and estimate", async ({
  page,
}, info) => {
  test.setTimeout(60_000); // Tek akışta havuz, iki gün, saatli taşıma ve değişmez gerçek çalışma geçmişi var.
  const { fx, task, pool, work } = await fixture(page);
  const date = future(),
    target = future(1);
  try {
    const tasksBefore = Number((await (await fx.api.get("/api/tasks?offset=0&limit=1")).json()).total);
    let copies = 0;
    page.on("request", request => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/api/tasks") copies++;
    });
    const trigger = page.getByRole("button", { name: `${task.title} havuz görevi menüsü`, exact: true });
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Güne planla", exact: true });
    await dialog.getByLabel("Plan günü", { exact: true }).fill(date);
    await auditTask(page, "pool-to-day", "integration");
    await dialog.getByRole("button", { name: "Güne ekle", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("status")).toHaveText("Görev günün planında.");
    const items = await (await fx.api.get(`/api/daily-plans/${date}/items?Offset=0&Limit=100`)).json();
    expect(items.items).toHaveLength(1);
    expect(items.items[0].taskId).toBe(task.id);
    await dialog.getByRole("link", { name: "Günün planını aç", exact: true }).click();
    const row = page.locator(".r2-plan-row").filter({ hasText: task.title });
    await expect(row).toHaveCount(1);
    await row.getByRole("button", { name: /Saati düzenle/ }).click();
    await row.getByLabel("Başlangıç saati").fill("09:00");
    await row.getByLabel("Bitiş saati").fill("10:30");
    await row.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(row.locator("form")).toHaveCount(0);
    await blockAction(page, task.title, "Başka güne taşı");
    const move = page.getByRole("dialog", { name: "Bloğu başka güne taşı", exact: true });
    let moved = false,
      heldReads = 0;
    let releaseReads!: () => void;
    const gate = new Promise<void>(resolve => {
      releaseReads = resolve;
    });
    await page.route("**/api/daily-plans/**", async route => {
      if (!moved || route.request().method() !== "GET") return route.continue();
      const response = await route.fetch();
      heldReads++;
      await gate;
      await route.fulfill({ response }).catch(() => {});
    });
    await page.route("**/api/schedules/*/move", async route => {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      moved = true;
      await route.fulfill({ response });
    });
    try {
      await move.getByLabel("Hedef tarih", { exact: true }).fill(target);
      await move.getByRole("button", { name: "Hedef günü oku", exact: true }).click();
      await move.getByRole("button", { name: "İki günü birlikte kaydet", exact: true }).click();
      await expect.poll(() => heldReads).toBeGreaterThan(0);
      await expect(move.getByRole("status").filter({ hasText: "İki gün birlikte kaydedildi" })).toBeVisible();
      await expect(move.getByRole("button", { name: "Kapat", exact: true })).toBeEnabled();
      await move.getByRole("button", { name: "Kapat", exact: true }).click();
      await expect(move).toBeHidden();
    } finally {
      releaseReads();
      await page.unrouteAll({ behavior: "wait" });
    }
    const current = await (await fx.api.get(`/api/tasks/${task.id}`)).json();
    expect(current.directEstimatedSeconds).toBe(43200);
    expect(current.state).not.toBe("Completed");
    expect((await (await fx.api.get(`/api/tasks/${task.id}/classification`)).json()).values.poolId).toBe(pool.id);
    expect(Number((await (await fx.api.get("/api/tasks?offset=0&limit=1")).json()).total)).toBe(tasksBefore);
    expect(copies).toBe(0);
    const schedules = await (
      await fx.api.get(`/api/schedules?From=${target}T00:00:00Z&To=${target}T23:59:59Z&Limit=100`)
    ).json();
    const block = schedules.items.find((item: { taskId: string }) => item.taskId === task.id);
    expect(block).toBeTruthy();
    expect(Date.parse(block.endsAt) - Date.parse(block.startsAt)).toBe(90 * 60_000);
    await page.goto(`/pool?id=${pool.id}`);
    await page.getByRole("button", { name: `${task.title} ayrıntısını aç`, exact: true }).click({ button: "right" });
    await expect(page.getByRole("menu", { name: `${task.title} havuz görevi menüsü`, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    const second = await open(page, task.title, date);
    await second.getByRole("button", { name: "Güne ekle", exact: true }).click();
    await expect(second.getByRole("status")).toHaveText("Görev günün planında.");
    await second.getByRole("link", { name: "Günün planını aç", exact: true }).click();
    const again = page.locator(".r2-plan-row").filter({ hasText: task.title });
    await again.getByRole("button", { name: /Saati düzenle/ }).click();
    await again.getByLabel("Başlangıç saati").fill("09:00");
    await again.getByLabel("Bitiş saati").fill("10:00");
    await again.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(again.locator("form")).toHaveCount(0);
    const firstDay = await (
      await fx.api.get(`/api/schedules?From=${date}T00:00:00Z&To=${date}T23:59:59Z&Limit=100`)
    ).json();
    expect(firstDay.items.filter((item: { taskId: string }) => item.taskId === task.id)).toHaveLength(1);
    const time = await (await fx.api.get(`/api/tasks/${task.id}/time`)).json();
    expect(Number(time.directActualSeconds)).toBe(3600);
    expect(Number(time.remainingSeconds)).toBe(39600);
    expect((await (await fx.api.get(`/api/work-sessions/${work.id}`)).json()).taskAtStart).toEqual(work.taskAtStart);
    expect((await (await fx.api.get(`/api/tasks/${task.id}`)).json()).state).not.toBe("Completed");
    await page.screenshot({ path: `${EVIDENCE}/pool-day-move-${info.project.name}.png`, fullPage: true });
  } finally {
    await fx.clean();
    await fx.api.dispose();
  }
});
test("a committed lost keyless pool-to-day write is read-reconciled without replay", async ({ page }) => {
  const { fx, task } = await fixture(page);
  const date = future();
  let posts = 0;
  try {
    await page.route(`**/api/daily-plans/${date}/items`, async route => {
      if (route.request().method() !== "POST") return route.continue();
      posts++;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort("failed");
    });
    const dialog = await open(page, task.title, date);
    await dialog.getByRole("button", { name: "Güne ekle", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("kaydedilmiş olabilir");
    await expect(dialog.getByRole("button", { name: "Güne ekle", exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: "Güncel planı oku", exact: true }).click();
    await expect(dialog.getByRole("status")).toHaveText("Görev günün planında.");
    expect(posts).toBe(1);
    expect((await (await fx.api.get(`/api/daily-plans/${date}/items?Limit=100`)).json()).items).toHaveLength(1);
  } finally {
    await fx.clean();
    await fx.api.dispose();
  }
});
test("offline sends nothing; an intervening duplicate returns409 and only a read establishes existing success", async ({
  page,
  context,
}) => {
  const { fx, task } = await fixture(page);
  const date = future();
  let posts = 0;
  try {
    const dialog = await open(page, task.title, date);
    page.on("request", r => {
      if (r.method() === "POST" && r.url().endsWith(`/api/daily-plans/${date}/items`)) posts++;
    });
    await dialog.getByLabel("Plan günü", { exact: true }).fill("");
    await expect(dialog.getByRole("button", { name: "Güne ekle", exact: true })).toBeDisabled();
    await dialog.getByLabel("Plan günü", { exact: true }).fill(date);
    await context.setOffline(true);
    await dialog.getByRole("button", { name: "Güne ekle", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Değişiklik gönderilmedi");
    expect(posts).toBe(0);
    await context.setOffline(false);
    expect((await fx.api.post(`/api/daily-plans/${date}/items`, { data: { taskId: task.id } })).status()).toBe(201);
    await dialog.getByRole("button", { name: "Güne ekle", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("zaten var");
    await expect(dialog.getByRole("status")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Güncel planı oku", exact: true }).click();
    await expect(dialog.getByRole("status")).toHaveText("Görev günün planında.");
    expect(posts).toBe(1);
  } finally {
    await context.setOffline(false);
    await fx.clean();
    await fx.api.dispose();
  }
});
test("a pending pool write blocks local close/logout; a different account never receives the old receipt or plan", async ({
  page,
}) => {
  const { fx, task } = await fixture(page),
    other = await FocusFixture.create();
  const date = future();
  let committed = false,
    posts = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  try {
    await page.route(`**/api/daily-plans/${date}/items`, async route => {
      if (route.request().method() !== "POST") return route.continue();
      posts++;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      committed = true;
      await gate;
      await route.fulfill({ response }).catch(() => {});
    });
    const dialog = await open(page, task.title, date);
    await dialog.getByRole("button", { name: "Güne ekle", exact: true }).click();
    await expect.poll(() => committed).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    expect(
      await page.evaluate(() => window.dispatchEvent(new Event("adhd:before-local-logout", { cancelable: true }))),
    ).toBe(false);
    const bootstrap = page.waitForResponse(r => new URL(r.url()).pathname === "/api/auth/me" && r.status() === 200);
    await switchAccount(page, other.token);
    await bootstrap;
    release();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Görev günün planında.", { exact: true })).toHaveCount(0);
    await expect(page.getByText(task.title, { exact: true })).toHaveCount(0);
    expect((await other.api.get(`/api/tasks/${task.id}`)).status()).toBe(404);
    expect((await (await other.api.get(`/api/daily-plans/${date}/items?Limit=100`)).json()).items).toHaveLength(0);
    expect((await (await fx.api.get(`/api/daily-plans/${date}/items?Limit=100`)).json()).items).toHaveLength(1);
    expect(posts).toBe(1);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
    await fx.clean();
    await other.clean();
    await fx.api.dispose();
    await other.api.dispose();
  }
});

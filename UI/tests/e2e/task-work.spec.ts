import { randomUUID } from "node:crypto";
import { expect, test, request, type APIRequestContext, type Page } from "@playwright/test";
import { auditTask as audit } from "./helpers/task-audit";
import { signIn } from "./helpers/session";
import type { Task } from "../../src/features/tasks/model";
import { EVIDENCE } from "./helpers/evidence";
import { trackFaults } from "./helpers/faults";
import { registerFixture } from "./helpers/fixture-account";
test.describe.configure({ mode: "default" });
let api: APIRequestContext;
let token: string;
const examples: { id: string; minutes: number }[] = [];
const errors = new WeakMap<Page, string[]>();
async function get(id: string): Promise<Task> {
  const r = await api.get(`/api/tasks/${id}`);
  expect(r.status()).toBe(200);
  return r.json();
}
async function create(title = "Süre örneği"): Promise<Task> {
  const r = await api.post("/api/tasks", { data: { title } });
  expect(r.status()).toBe(201);
  return r.json();
}
async function define(id: string, direct: number | null, hasDirectWork = true, budget: number | null = null) {
  const r = await api.put(`/api/tasks/${id}/work-definition`, {
    data: {
      version: (await get(id)).version,
      hasDirectWork,
      directEstimatedSeconds: direct,
      targetBudgetSeconds: budget,
    },
  });
  expect(r.status()).toBe(200);
  return r.json() as Promise<Task>;
}
async function child(id: string): Promise<Task> {
  const parent = await get(id);
  const r = await api.post(`/api/tasks/${id}/children`, {
    data: {
      title: "Küçük iş",
      parentVersion: parent.version,
      parentWorkDisposition: parent.hasDirectWork ? "PreserveDirect" : null,
    },
  });
  expect(r.status()).toBe(201);
  return r.json();
}
async function graph(shape: (number | number[])[], minutes: number, budget: number | null = null) {
  const root = await create();
  await define(root.id, null, false, budget);
  for (const value of shape) {
    const node = await child(root.id);
    if (typeof value === "number") await define(node.id, value * 60);
    else {
      await define(node.id, null, false);
      for (const amount of value) await define((await child(node.id)).id, amount * 60);
    }
  }
  examples.push({ id: root.id, minutes });
}
test.beforeAll(async () => {
  const register = await request.newContext({ baseURL: "http://127.0.0.1:5182" });
  const r = await registerFixture(register, "/api/auth/register", {
    data: { email: `work-ui-${randomUUID()}@example.test`, password: randomUUID() },
  });
  expect(r.status()).toBe(201);
  token = (await r.json()).accessToken;
  api = await request.newContext({
    baseURL: "http://127.0.0.1:5182",
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  await register.dispose();
  expect((await api.get(`${process.env.UI_E2E_BASE_URL ?? "http://127.0.0.1:3400"}/api/auth/me`)).status()).toBe(200);
  await graph([20, 40, 30], 90);
  await graph([[15, 20], 25], 60);
  await graph([30, [15, 20, 25], 25], 115);
  await graph([60, 120], 180, 14400);
});
test.afterAll(async () => {
  await api?.dispose();
});
test.beforeEach(async ({ page }) => {
  const faults: string[] = [];
  errors.set(page, faults);
  trackFaults(page, faults);
  await signIn(page, token);
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
const fact = (page: Page, label: string) =>
  page
    .locator(".r2-facts > div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("dd");
const minutes = (page: Page) => page.getByLabel("Tahmini süre (dakika)", { exact: true });
const slider = (page: Page) => page.getByRole("slider", { name: "Tahmini süre, dakika", exact: true });
async function show(page: Page, id: string) {
  await page.goto(`/tasks?taskId=${id}`);
  await expect(page.getByLabel("Görev başlığı", { exact: true })).toBeVisible();
  await expect(fact(page, "Tahmini görev süresi")).not.toHaveText("…");
}

// Dakika tahmini sayı/kaydırıcıyla, dört bilgi sunucudan. Yalnız seçili görev değişir.
test("90/60/115/180 subtree totals come from the server in minutes, never summed in the browser", async ({
  page,
}, info) => {
  const expected = ["1 sa 30 dk", "1 sa", "1 sa 55 dk", "3 sa"];
  for (const [index, example] of examples.entries()) {
    await show(page, example.id);
    await expect(fact(page, "Tahmini görev süresi")).toHaveText(expected[index]);
    await expect(page.getByText("Değerler alt görevler dahildir.", { exact: false })).toBeVisible();
  }
  await expect(fact(page, "Kalan tahmini süre")).toHaveText("3 sa");
  await expect(fact(page, "Tahmin aşımı")).toHaveText("Yok");
  await expect(page.getByText("Hedef toplam bütçe")).toHaveCount(0);
  await expect(page.getByLabel(/saniye/)).toHaveCount(0);
  await audit(page, "totals");
  await page.screenshot({ path: `${EVIDENCE}/work-totals-${info.project.name}.png` });
});

test("unknown stays unknown; number and slider stay in step; clearing sends null and only this task changes", async ({
  page,
}) => {
  const root = await create();
  await define(root.id, null, false);
  const known = await child(root.id);
  await define(known.id, 5400);
  const leaf = await child(root.id);
  await show(page, root.id);
  await expect(fact(page, "Tahmini görev süresi")).toHaveText("En az 1 sa 30 dk");
  await expect(fact(page, "Kalan tahmini süre")).toHaveText("Bilinmiyor");
  await show(page, leaf.id);
  await expect(page.getByText("Tahmin girilmedi. Bilinmeyen süre sıfır sayılmaz.")).toBeVisible();
  await expect(minutes(page)).toHaveValue("");
  const puts: Record<string, unknown>[] = [];
  page.on("request", r => {
    if (r.method() === "PUT" && r.url().endsWith(`/api/tasks/${leaf.id}/work-definition`)) puts.push(r.postDataJSON());
  });
  await minutes(page).fill("25");
  await minutes(page).press("Tab");
  await expect(page.getByRole("status").filter({ hasText: "Kaydedildi" }).first()).toBeVisible();
  await expect(slider(page)).toHaveValue("25");
  expect((await get(leaf.id)).directEstimatedSeconds).toBe(1500);
  await slider(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect(minutes(page)).toHaveValue("30");
  await expect.poll(async () => (await get(leaf.id)).directEstimatedSeconds).toBe(1800);
  await page.getByRole("button", { name: "Temizle", exact: true }).first().click();
  await expect.poll(async () => (await get(leaf.id)).directEstimatedSeconds).toBeNull();
  expect(puts.every(body => body.targetBudgetSeconds === null)).toBe(true);
  expect((await get(known.id)).directEstimatedSeconds).toBe(5400);
  expect((await get(root.id)).hasDirectWork).toBe(false);
  await show(page, root.id);
  await expect(fact(page, "Tahmini görev süresi")).toHaveText("En az 1 sa 30 dk");
  await minutes(page).fill("10");
  await minutes(page).press("Tab");
  await expect.poll(async () => (await get(root.id)).directEstimatedSeconds).toBe(600);
  expect((await get(known.id)).directEstimatedSeconds).toBe(5400);
  await audit(page, "estimate");
});

test("actual work and overrun are shown apart from completion", async ({ page }, info) => {
  const task = await create();
  await define(task.id, 600);
  const manual = await api.post("/api/work-sessions/manual", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      taskId: task.id,
      startedAt: "2026-10-15T08:00:00Z",
      endedAt: "2026-10-15T08:20:00Z",
      reason: "UI-R2 süre kabul fixture",
    },
  });
  expect(manual.status()).toBe(201);
  await show(page, task.id);
  await expect(fact(page, "Tamamlanan süre")).toHaveText("20 dk");
  await expect(fact(page, "Tahmin aşımı")).toHaveText("10 dk");
  await expect(fact(page, "Kalan tahmini süre")).toHaveText("0 dk");
  expect((await get(task.id)).state).not.toBe("Completed");
  if (info.project.name === "chromium") await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await audit(page, "overrun");
  await page.screenshot({ path: `${EVIDENCE}/work-overrun-${info.project.name}.png` });
});

test("an uncertain estimate save is never replayed, a definitive refusal keeps the text and offline never queues", async ({
  page,
  context,
}) => {
  const task = await create();
  await show(page, task.id);
  let writes = 0;
  await page.route(`**/api/tasks/${task.id}/work-definition`, async route => {
    writes++;
    expect((await route.fetch()).status()).toBe(200);
    await route.abort("failed");
  });
  await minutes(page).fill("35");
  await minutes(page).press("Tab");
  await expect(page.getByRole("alert").filter({ hasText: "Kaydedilmiş olabilir" })).toBeVisible();
  expect(writes).toBe(1);
  expect((await get(task.id)).directEstimatedSeconds).toBe(2100);
  await page.unroute(`**/api/tasks/${task.id}/work-definition`);
  await minutes(page).fill("100001");
  await minutes(page).press("Tab");
  await expect(page.getByRole("alert").filter({ hasText: "0–100.000" })).toBeVisible();
  await context.setOffline(true);
  await minutes(page).fill("40");
  await minutes(page).press("Tab");
  await expect(page.getByRole("alert").filter({ hasText: "Değişiklik gönderilmedi" })).toBeVisible();
  await context.setOffline(false);
  await expect(minutes(page)).toHaveValue("40");
  expect((await get(task.id)).directEstimatedSeconds).toBe(2100);
  expect(writes).toBe(1);
});

test("Back still asks before dropping an unsaved title edit", async ({ page }) => {
  const task = await create(`Geri koruma ${randomUUID()}`);
  await page.goto(`/tasks?search=${encodeURIComponent(task.title)}`);
  await page.getByRole("button", { name: `${task.title} ayrıntısını aç`, exact: true }).click();
  await page.getByLabel("Görev başlığı", { exact: true }).fill("Başlık taslağı duruyor");
  const prompted = page.waitForEvent("dialog");
  await page.evaluate(() => history.back());
  const prompt = await prompted;
  expect(prompt.message()).toContain("görev değişikliklerin");
  await prompt.dismiss();
  await expect(page.getByLabel("Görev başlığı", { exact: true })).toHaveValue("Başlık taslağı duruyor");
  expect((await get(task.id)).title).toBe(task.title);
});

import { randomUUID } from "node:crypto";
import { expect, test, request, type APIRequestContext, type Page } from "@playwright/test";
import { signIn } from "./helpers/session";
import type { Task } from "../../src/features/tasks/model";
import { auditTask } from "./helpers/task-audit";
import { trackFaults } from "./helpers/faults";
import { registerFixture } from "./helpers/fixture-account";
test.describe.configure({ mode: "default" });
let api: APIRequestContext;
let token: string;
const faults = new WeakMap<Page, string[]>();
const deferredAudits = new WeakMap<Page, { name: string; prefix: string }>();
async function get(id: string): Promise<Task> {
  const r = await api.get(`/api/tasks/${id}`);
  expect(r.status()).toBe(200);
  return r.json();
}
async function root(): Promise<Task> {
  const r = await api.post("/api/tasks", { data: { title: `Tamamlama ${randomUUID()}` } });
  expect(r.status()).toBe(201);
  return r.json();
}
async function child(parentId: string): Promise<Task> {
  const parent = await get(parentId);
  const r = await api.post(`/api/tasks/${parentId}/children`, {
    data: {
      title: `Alt iş ${randomUUID()}`,
      parentVersion: parent.version,
      parentWorkDisposition: parent.hasDirectWork && parent.directEstimatedSeconds !== null ? "PreserveDirect" : null,
    },
  });
  expect(r.status()).toBe(201);
  return r.json();
}
async function define(id: string, seconds: number) {
  const r = await api.put(`/api/tasks/${id}/work-definition`, {
    data: {
      version: (await get(id)).version,
      hasDirectWork: true,
      directEstimatedSeconds: seconds,
      targetBudgetSeconds: null,
    },
  });
  expect(r.status()).toBe(200);
}
async function state(id: string, action: string) {
  const r = await api.post(`/api/tasks/${id}/state`, { data: { version: (await get(id)).version, action } });
  expect(r.status()).toBe(200);
  return r.json() as Promise<Task>;
}
async function start(id: string) {
  const r = await api.post("/api/work-sessions/start", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { taskId: id },
  });
  expect(r.status()).toBe(201);
  return r.json();
}
test.beforeAll(async () => {
  const setup = await request.newContext({ baseURL: "http://127.0.0.1:5182" });
  const r = await registerFixture(setup, "/api/auth/register", {
    data: { email: `life-ui-${randomUUID()}@example.test`, password: randomUUID() },
  });
  expect(r.status()).toBe(201);
  token = (await r.json()).accessToken;
  await setup.dispose();
  api = await request.newContext({
    baseURL: "http://127.0.0.1:5182",
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  expect((await api.get(`${process.env.UI_E2E_BASE_URL ?? "http://127.0.0.1:3400"}/api/auth/me`)).status()).toBe(200);
});
test.afterAll(async () => {
  await api?.dispose();
});
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  faults.set(page, messages);
  trackFaults(page, messages);
  await signIn(page, token);
});
test.afterEach(async ({ page }, info) => {
  const audit = deferredAudits.get(page);
  if (audit && info.status === info.expectedStatus) await auditTask(page, audit.name, audit.prefix);
  const messages = faults.get(page);
  if (messages) expect(messages).toEqual([]);
  else expect(info.status).not.toBe("passed");
});
async function show(page: Page, id: string) {
  await page.goto(`/tasks?taskId=${id}`);
  await page.getByLabel("Görev başlığı", { exact: true }).waitFor({ state: "visible" });
  await expect(page.getByLabel("Görev başlığı", { exact: true })).toBeVisible();
}
const finish = (page: Page) => page.getByRole("button", { name: "Görevi bitir", exact: true });
const reopen = (page: Page) => page.getByRole("button", { name: "Yeniden aç", exact: true });
const sessions = async () =>
  ((await (await api.get("/api/work-sessions?limit=25")).json()).items ?? []) as {
    taskId: string | null;
    state: string;
  }[];

// Bitirme panelde tek düğme veya ağaç menüsünde tek öğe, soru yok. Ertele/atla/iptal artık sunulmuyor.
test(
  "Görevi bitir completes the subtree without a dialog, closes running work and Yeniden aç reopens only the task",
  { tag: "@smoke" },
  async ({ page }) => {
    const parent = await root();
    const a = await child(parent.id);
    const b = await child(parent.id);
    await define(a.id, 600);
    await start(a.id);
    let prompts = 0;
    page.on("dialog", d => {
      prompts++;
      void d.dismiss();
    });
    await show(page, parent.id);
    await expect(page.getByRole("checkbox", { name: "Görev tamamlandı" })).toHaveCount(0);
    await finish(page).click();
    await expect(reopen(page)).toBeVisible();
    expect(prompts).toBe(0);
    expect((await get(parent.id)).state).toBe("Completed");
    expect((await get(a.id)).state).toBe("Completed");
    expect((await get(b.id)).state).toBe("Completed");
    expect((await sessions()).filter(s => s.taskId === a.id).every(s => s.state === "Finished")).toBe(true);
    await expect(page.getByLabel("Görev başlığı", { exact: true })).toHaveClass(/\bdone\b/);
    deferredAudits.set(page, { name: "finished", prefix: "lifecycle" });
    await reopen(page).click();
    await expect(finish(page)).toBeVisible();
    expect((await get(parent.id)).state).toBe("Pending");
    expect((await get(a.id)).state).toBe("Completed");
    await expect(page.getByRole("button", { name: /Ertele|Atla|İptal/ })).toHaveCount(0);
  },
);

test("finishing a subtask leaves its siblings and parent untouched", async ({ page }) => {
  const parent = await root();
  const a = await child(parent.id);
  const b = await child(parent.id);
  await show(page, a.id);
  await finish(page).click();
  await expect(reopen(page)).toBeVisible();
  expect((await get(a.id)).state).toBe("Completed");
  expect((await get(b.id)).state).toBe("Pending");
  expect((await get(parent.id)).state).toBe("Pending");
});

test("the auto-complete switch decides whether the last finished subtask completes the parent", async ({ page }) => {
  const parent = await root();
  const a = await child(parent.id);
  const b = await child(parent.id);
  await show(page, parent.id);
  const toggle = page.getByLabel("Alt görevler bitince bu görevi otomatik tamamla", { exact: true });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect.poll(async () => (await get(parent.id)).autoCompleteFromChildren).toBe(false);
  await state(a.id, "Complete");
  await state(b.id, "Complete");
  expect((await get(parent.id)).state).toBe("Pending");
  await page.reload();
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect.poll(async () => (await get(parent.id)).state).toBe("Completed");
  await expect(reopen(page)).toBeVisible();
  deferredAudits.set(page, { name: "auto-complete", prefix: "lifecycle" });
});

test("an uncertain finish is reconciled by reading and never replayed; offline never queues", async ({
  page,
  context,
}) => {
  const task = await root();
  await show(page, task.id);
  let writes = 0;
  await page.route(`**/api/tasks/${task.id}/state`, async route => {
    writes++;
    expect((await route.fetch()).status()).toBe(200);
    await route.abort("failed");
  });
  await finish(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "Kaydedilmiş olabilir" })).toBeVisible();
  expect(writes).toBe(1);
  await expect(reopen(page)).toBeVisible();
  expect(writes).toBe(1);
  await page.unroute(`**/api/tasks/${task.id}/state`);
  const other = await root();
  await show(page, other.id);
  let posts = 0;
  page.on("request", r => {
    if (r.method() === "POST" && r.url().endsWith(`/api/tasks/${other.id}/state`)) posts++;
  });
  await context.setOffline(true);
  await finish(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "Değişiklik gönderilmedi" })).toBeVisible();
  await context.setOffline(false);
  expect(posts).toBe(0);
  expect((await get(other.id)).state).toBe("Pending");
});

import { randomUUID } from "node:crypto";
import { Temporal } from "temporal-polyfill";
import { test, expect, type Page } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { EVIDENCE } from "./helpers/evidence";
let fx: FocusFixture;
const today = () => Temporal.Now.plainDateISO("Europe/Istanbul").toString();
type Task = { id: string; title: string; version: number; state: string };
async function root(title: string): Promise<Task> {
  const response = await fx.api.post("/api/tasks", { data: { title } });
  expect(response.status()).toBe(201);
  return response.json();
}
async function child(parent: Task, title: string): Promise<Task> {
  const current = await (await fx.api.get(`/api/tasks/${parent.id}`)).json();
  const response = await fx.api.post(`/api/tasks/${parent.id}/children`, {
    data: { title, parentVersion: current.version },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
async function task(id: string) {
  return (await fx.api.get(`/api/tasks/${id}`)).json();
}
async function choose(page: Page, title: string) {
  const input = page.getByRole("combobox", { name: "Görev ekle", exact: true });
  await input.click();
  await input.fill(title);
  const option = page.getByRole("option").filter({ hasText: title });
  await expect(option).toHaveCount(1);
  await option.click();
}
test.beforeEach(async ({ page }) => {
  fx = await FocusFixture.create();
  await fx.login(page);
});
test.afterEach(async () => {
  await fx.api.dispose();
});

test("single child retains its identity when root is added; tree completes together and parent timer starts", async ({
  page,
}, info) => {
  const parent = await root("Lansmanı hazırla " + randomUUID().slice(-6)),
    a = await child(parent, "Tasarımı hazırla"),
    b = await child(parent, "Yayına al");
  await page.goto("/planning");
  await choose(page, a.title);
  await expect(page.locator(".r2-plan-title").filter({ hasText: a.title })).toHaveCount(1);
  const before = await (await fx.api.get(`/api/daily-plans/${today()}/items`)).json();
  await choose(page, parent.title);
  const group = page
    .locator(".r2-plan-task-group")
    .filter({ has: page.locator(".r2-plan-title").filter({ hasText: parent.title }) })
    .first();
  await expect(group).toBeVisible();
  await expect(page.locator(".r2-plan-title").filter({ hasText: a.title })).toHaveCount(1);
  await expect(page.locator(".r2-plan-row.next")).toHaveCount(0);
  const after = await (await fx.api.get(`/api/daily-plans/${today()}/items`)).json();
  expect(after.items.find((x: { taskId: string }) => x.taskId === a.id).id).toBe(before.items[0].id);
  expect(after.items).toHaveLength(3);
  await group.getByRole("button", { name: `${parent.title} alt görevleri`, exact: true }).click();
  await expect(page.locator(".r2-plan-title").filter({ hasText: a.title })).toBeHidden();
  await group.getByRole("button", { name: `${parent.title} alt görevleri`, exact: true }).click();
  await page.getByRole("button", { name: `Başlat: ${parent.title}`, exact: true }).click();
  await expect
    .poll(async () => (await (await fx.api.get("/api/work-sessions/current")).json()).activeSession?.taskId)
    .toBe(parent.id);
  await page.getByRole("checkbox", { name: `${parent.title} plan öğesi bitti`, exact: true }).check();
  await expect.poll(async () => (await task(a.id)).state).toBe("Completed");
  expect((await task(b.id)).state).toBe("Completed");
  await page.reload();
  await expect(page.getByRole("checkbox", { name: `${parent.title} plan öğesi bitti`, exact: true })).toBeChecked();
  await page.screenshot({ path: `${EVIDENCE}/plan-hierarchy-${info.project.name}.png` });
});

test("projects retain split layout and completed titles have a clear strike and muted text", async ({ page }, info) => {
  const parent = await root("Proje ana görevi"),
    a = await child(parent, "Açık alt görev"),
    b = await child(parent, "Bitmiş alt görev");
  const project = await (await fx.api.post("/api/projects", { data: { name: "Tasarım projesi" } })).json();
  for (const t of [parent, a, b]) {
    const c = await (await fx.api.get(`/api/tasks/${t.id}/classification`)).json();
    expect(
      (
        await fx.api.put(`/api/tasks/${t.id}/classification`, {
          data: { version: c.version, projectId: project.id, tagIds: [], applyToSubtree: false },
        })
      ).status(),
    ).toBe(200);
  }
  const current = await task(b.id);
  expect(
    (
      await fx.api.post(`/api/tasks/${b.id}/state`, {
        data: { version: current.version, action: "Complete", parentCompletionChoice: "CompleteSubtree" },
      })
    ).status(),
  ).toBe(200);
  await page.goto(`/projects?id=${project.id}`);
  await expect(page.getByRole("button", { name: `${a.title} ayrıntısını aç`, exact: true })).toBeVisible();
  const done = page.locator(".task-row.completed .task-row-title");
  await expect(done).toHaveText(b.title);
  const appearance = await done.evaluate(e => ({
    line: getComputedStyle(e).textDecorationLine,
    thickness: parseFloat(getComputedStyle(e).textDecorationThickness),
    color: getComputedStyle(e).color,
  }));
  expect(appearance.line).toContain("line-through");
  expect(appearance.thickness).toBeGreaterThanOrEqual(2);
  if (info.project.name === "chromium") {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.locator(".resource-list")).toBeVisible();
    await expect(page.locator(".resource-detail")).toBeVisible();
    expect((await page.locator(".resource-list").boundingBox())!.x).toBeLessThan(
      (await page.locator(".resource-detail").boundingBox())!.x,
    );
  }
  await page.screenshot({ path: `${EVIDENCE}/project-tree-${info.project.name}.png` });
});

test("desktop sidebar remains clickable with task editor at 1024 and 1440 px", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "Desktop navigation scenario");
  const t = await root("Panel görevi");
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/tasks?taskId=${t.id}`);
    await expect(page.locator("aside.docked-surface")).toBeVisible();
    await page
      .getByRole("navigation", { name: "Çalışma alanı", exact: true })
      .getByRole("link", { name: "Notlar", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Notlar", exact: true })).toBeVisible();
  }
});

test("outside tap closes only the top confirmation and the second tap can close settings", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-chromium", "Touch scenario");
  await page.goto("/planning?settings=account");
  const settings = page.getByRole("dialog", { name: "Ayarlar", exact: true });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "Tüm cihazlardan çık", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Tüm cihazlardan çıkılsın mı?", exact: true });
  await expect(confirmation).toBeVisible();
  // The settings header can be scrolled above the viewport on mobile.
  // Tap the still-visible button that opened this confirmation: click-through would reopen it.
  const behind = await settings.getByRole("button", { name: "Tüm cihazlardan çık", exact: true }).first().boundingBox();
  expect(behind!.y).toBeGreaterThanOrEqual(0);
  expect(behind!.y + behind!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.touchscreen.tap(behind!.x + behind!.width / 2, behind!.y + behind!.height / 2);
  await expect(confirmation).toBeHidden();
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "Ayarlar panelini kapat", exact: true }).click();
  await expect(settings).toBeHidden();
  expect((await fx.api.get("/api/auth/me")).status()).toBe(200);
});

test("uncategorized note hides its badge and the existing detail window leaves room for text", async ({
  page,
}, info) => {
  const text = "Uzun not içeriği. ".repeat(240);
  expect(
    (
      await fx.api.post("/api/notes", { data: { kind: "General", display: "Detailed", title: "İnceleme notu", text } })
    ).status(),
  ).toBe(201);
  await page.goto("/notes");
  const article = page.getByRole("article", { name: "İnceleme notu", exact: true });
  await expect(article).toBeVisible();
  await expect(article.locator(".note-badge")).toHaveCount(0);
  if (info.project.name === "chromium")
    await expect(page.getByRole("button", { name: "Kartlar", exact: true })).toHaveAttribute("aria-pressed", "true");
  await article.getByRole("button", { name: "İnceleme notu", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "İnceleme notu", exact: true });
  await expect(modal).toBeVisible();
  const bounds = await modal.evaluate(d => ({
    window: d.getBoundingClientRect().toJSON(),
    text: d.querySelector(".note-detail-scroll")!.getBoundingClientRect().toJSON(),
  }));
  expect(bounds.text.height).toBeGreaterThan(200);
  expect(bounds.text.bottom).toBeLessThanOrEqual(bounds.window.bottom);
  await expect(modal.locator(".note-badge")).toHaveCount(0);
  await page.screenshot({ path: `${EVIDENCE}/note-content-${info.project.name}.png` });
});

test("empty routine uses the full existing board and account reads real sign-in methods", async ({ page }, info) => {
  await page.goto("/recurrences");
  await expect(page.locator(".recurrence-board.is-empty")).toBeVisible();
  const width = await page.locator(".recurrence-board.is-empty").evaluate(e => ({
    board: e.getBoundingClientRect().width,
    section: e.querySelector("section")!.getBoundingClientRect().width,
  }));
  expect(width.section).toBeCloseTo(width.board, 0);
  await page.goto("/planning?settings=account");
  const account = page.getByRole("dialog", { name: "Ayarlar", exact: true });
  await expect(account.getByRole("heading", { name: "Giriş yöntemleri", exact: true })).toBeVisible();
  await expect(account.getByText("E-posta ve parola", { exact: true })).toBeVisible();
  await expect(account.getByRole("form", { name: "Parolayı değiştir", exact: true })).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}/account-methods-${info.project.name}.png` });
});

test("a saved task group loads children across the day plan page boundary", async ({ page }) => {
  test.setTimeout(120_000);
  const parent = await root("Sayfalı ana görev " + randomUUID().slice(-6));
  for (let index = 0; index < 102; index++) await child(parent, `Adım ${String(index).padStart(3, "0")}`);
  await page.goto("/planning");
  await choose(page, parent.title);
  await expect(page.locator(".r2-plan-title")).toHaveCount(103, { timeout: 20_000 });
  await expect(page.locator(".r2-plan-title").filter({ hasText: "Adım 101" })).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".r2-plan-title")).toHaveCount(103, { timeout: 20_000 });
  await expect(page.locator(".r2-plan-row.next")).toHaveCount(0);
});

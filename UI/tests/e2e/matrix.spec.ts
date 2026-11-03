import { test, expect, type Page, type Locator, type CDPSession } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { trackFaults } from "./helpers/faults";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";
import type { Board, Quadrant } from "../../src/features/matrix/model";
let fx: FocusFixture;
test.beforeEach(async ({ page }) => {
  fx = await FocusFixture.create();
  await fx.login(page);
});
test.afterEach(async () => {
  await fx.api.dispose();
});
async function task(title: string) {
  const r = await fx.api.post("/api/tasks", { data: { title } });
  expect(r.status()).toBe(201);
  return (await r.json()) as { id: string; title: string; version: number };
}
async function board(): Promise<Board> {
  const r = await fx.api.get("/api/matrix");
  expect(r.status()).toBe(200);
  return r.json();
}
async function add(id: string, quadrant: Quadrant) {
  const r = await fx.api.post(`/api/matrix/items/${id}`, { data: { version: (await board()).version, quadrant } });
  expect(r.status()).toBe(200);
}
const lane = (page: Page, area: Quadrant) => page.locator(`[data-matrix-area="${area}"]`);
const card = (page: Page, id: string) => page.locator(`[data-matrix-task="${id}"]`);
const ids = async (area: Quadrant) => (await board()).columns.find(c => c.quadrant === area)!.items.map(x => x.task.id);
async function menuMove(page: Page, id: string, label: string) {
  await card(page, id)
    .getByRole("button", { name: / matris seçenekleri$/ })
    .click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}
async function drag(page: Page, cdp: CDPSession | null, from: Locator, to: Locator, release = true) {
  await expect(from).toBeEnabled();
  await from.scrollIntoViewIfNeeded();
  const b = (await from.boundingBox())!;
  const x = b.x + b.width / 2,
    y = b.y + b.height / 2;
  if (cdp) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await page.waitForTimeout(350);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 4, y }] });
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 10, y, { steps: 3 });
  }
  await to.evaluate(el => el.scrollIntoView({ block: "center" }));
  const end = (await to.boundingBox())!;
  const target = { x: end.x + end.width / 2, y: end.y + Math.min(30, end.height / 2) };
  for (let i = 1; i <= 8; i++) {
    const point = { x: x + ((target.x - x) * i) / 8, y: y + ((target.y - y) * i) / 8 };
    if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
    else await page.mouse.move(point.x, point.y);
  }
  if (release) {
    if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    else await page.mouse.up();
  }
}
test("matrix picks existing tasks and children, persists, opens details and fits both themes", async ({
  page,
}, info) => {
  const faults: string[] = [];
  trackFaults(page, faults);
  const first = await task("Matrise seçilecek iş");
  const parent = await task("Matris ana bağlamı");
  const childResponse = await fx.api.post(`/api/tasks/${parent.id}/children`, {
    data: {
      title: "İncelenecek matris alt işi",
      parentVersion: parent.version,
      parentWorkDisposition: "ConvertToContainer",
    },
  });
  expect(childResponse.status()).toBe(201);
  const child = await childResponse.json();
  await page.goto("/planning");
  if (info.project.name === "mobile-chromium")
    await page
      .getByRole("navigation", { name: "Mobil gezinme", exact: true })
      .getByRole("button", { name: "Daha fazla", exact: true })
      .click();
  await page.getByRole("link", { name: "Eisenhower Matrisi", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Eisenhower Matrisi", exact: true })).toBeVisible();
  await expect(page).toHaveTitle(/^Eisenhower Matrisi/);
  await page.getByRole("button", { name: "Görev seç", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Matrise görev seç", exact: true });
  await picker.getByRole("searchbox", { name: "Görevlerde ara" }).fill("Matrise");
  await picker.getByRole("checkbox", { name: first.title, exact: true }).check();
  await picker.getByRole("button", { name: "Seçilenleri ekle", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(card(page, first.id)).toBeVisible();
  await page.getByRole("button", { name: "Şimdi yap alanına görev seç", exact: true }).click();
  await picker.getByRole("searchbox", { name: "Görevlerde ara" }).fill("İncelenecek");
  await picker.getByRole("checkbox", { name: /Matris ana bağlamı.*İncelenecek matris alt işi/ }).check();
  await picker.getByRole("button", { name: "Seçilenleri ekle", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(lane(page, "Do").locator(`[data-matrix-task="${child.id}"]`)).toBeVisible();
  await expect(card(page, child.id)).toContainText("Matris ana bağlamı");
  await page.reload();
  await expect(card(page, child.id)).toBeVisible();
  await expect(lane(page, "Inbox").locator(`[data-matrix-task="${first.id}"]`)).toBeVisible();
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(t => (document.documentElement.dataset.theme = t), theme);
    await auditTask(page, theme, "matrix", theme);
    await page.screenshot({ path: `${EVIDENCE}/matrix-${theme}-${info.project.name}.png`, fullPage: true });
  }
  if (info.project.name === "chromium") {
    const viewport = page.viewportSize()!;
    for (const width of [320, 768]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `${EVIDENCE}/matrix-${width}.png`, fullPage: true });
    }
    await page.setViewportSize(viewport);
  }
  await card(page, child.id).getByText("İncelenecek matris alt işi", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Görev ayrıntısı", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Görev ayrıntısı", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Görev başlığı", exact: true })).toHaveValue(
    "İncelenecek matris alt işi",
  );
  expect(faults).toEqual([]);
});
test("matrix checkbox selection survives paging and search and adds multiple tasks together", async ({
  page,
}, info) => {
  await Promise.all(Array.from({ length: 27 }, (_, i) => task(`Çoklu seçim ${String(i).padStart(2, "0")}`)));
  await page.goto("/matrix");
  await page.getByRole("button", { name: "Şimdi yap alanına görev seç", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Matrise görev seç", exact: true });
  const submit = picker.getByRole("button", { name: "Seçilenleri ekle", exact: true });
  await expect(submit).toBeDisabled();
  const first = picker.getByRole("checkbox").first();
  const firstId = await first.inputValue();
  const firstTitle = await first.evaluate(el => el.closest("label")!.innerText.trim());
  await first.check();
  await picker.getByRole("button", { name: "Sonraki", exact: true }).click();
  await expect(first).not.toHaveValue(firstId);
  const secondId = await first.inputValue();
  await first.check();
  await expect(picker.getByRole("status").filter({ hasText: "2 görev seçildi" })).toBeVisible();
  await picker.getByRole("button", { name: "Önceki", exact: true }).click();
  await expect(picker.locator(`input[value="${firstId}"]`)).toBeChecked();
  const search = picker.getByRole("searchbox", { name: "Görevlerde ara" });
  await search.fill(firstTitle);
  await expect(picker.getByRole("checkbox")).toHaveCount(1);
  await expect(picker.getByRole("checkbox")).toBeChecked();
  await picker.getByRole("checkbox").uncheck();
  await expect(picker.getByRole("status").filter({ hasText: "1 görev seçildi" })).toBeVisible();
  await picker.getByRole("checkbox").check();
  await auditTask(page, "selection", "matrix");
  await page.screenshot({ path: `${EVIDENCE}/matrix-multi-selection-${info.project.name}.png` });
  await submit.click();
  await expect(picker).toBeHidden();
  expect((await ids("Do")).sort()).toEqual([firstId, secondId].sort());
  await page.reload();
  await expect(card(page, firstId)).toBeVisible();
  await expect(card(page, secondId)).toBeVisible();
});

test("matrix multi selection stops after a lost response and requires an explicit new selection", async ({ page }) => {
  const a = await task("Seçim A"),
    b = await task("Seçim B"),
    c = await task("Seçim C");
  await page.goto("/matrix");
  await page.getByRole("button", { name: "Şimdi yap alanına görev seç", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Matrise görev seç", exact: true });
  for (const item of [a, b, c]) await picker.getByRole("checkbox", { name: item.title, exact: true }).check();
  const writes: string[] = [];
  await page.route("**/api/matrix/items/*", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    writes.push(id);
    if (id !== b.id) return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort("failed");
  });
  await picker.getByRole("button", { name: "Seçilenleri ekle", exact: true }).click();
  await expect(picker.getByRole("alert")).toContainText("İşlemin sonucu alınamadı");
  await expect(picker.getByRole("button", { name: "Seçilenleri ekle", exact: true })).toBeDisabled();
  expect(writes).toEqual([a.id, b.id]);
  expect(await ids("Do")).toEqual([a.id, b.id]);
  await page.unroute("**/api/matrix/items/*");
  await picker.getByRole("button", { name: "Listeyi kontrol et", exact: true }).click();
  await expect(picker.getByRole("status").filter({ hasText: "0 görev seçildi" })).toBeVisible();
  await expect(picker.getByRole("checkbox")).toHaveCount(1);
  expect(writes).toEqual([a.id, b.id]);
  await picker.getByRole("checkbox", { name: c.title, exact: true }).check();
  await picker.getByRole("button", { name: "Seçilenleri ekle", exact: true }).click();
  await expect(picker).toBeHidden();
  expect(await ids("Do")).toEqual([a.id, b.id, c.id]);
});

test("matrix mouse or touch drag reorders and moves, Escape cancels, keyboard and removal preserve the task", async ({
  page,
  context,
}, info) => {
  const a = await task("Matris A"),
    b = await task("Matris B"),
    c = await task("Matris C"),
    x = await task("Matris X");
  await add(a.id, "Do");
  await add(b.id, "Do");
  await add(c.id, "Do");
  await add(x.id, "Schedule");
  await page.goto("/matrix");
  await expect(card(page, c.id)).toBeVisible();
  const cdp = info.project.name === "mobile-chromium" ? await context.newCDPSession(page) : null;
  await drag(page, cdp, card(page, c.id).locator("[data-matrix-grip]"), card(page, a.id));
  await expect.poll(() => ids("Do")).toEqual([c.id, a.id, b.id]);
  await drag(page, cdp, card(page, a.id).locator("[data-matrix-grip]"), card(page, x.id));
  await expect.poll(() => ids("Schedule")).toEqual([a.id, x.id]);
  await page.reload();
  await expect(lane(page, "Schedule").locator(`[data-matrix-task="${a.id}"]`)).toBeVisible();
  const version = (await board()).version;
  await drag(page, cdp, card(page, b.id).locator("[data-matrix-grip]"), card(page, x.id), false);
  await page.keyboard.press("Escape");
  if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  else await page.mouse.up();
  expect((await board()).version).toBe(version);
  await card(page, b.id).locator("[data-matrix-grip]").press("Alt+ArrowUp");
  await expect.poll(() => ids("Do")).toEqual([b.id, c.id]);
  await menuMove(page, b.id, "Ele / azalt alanına taşı");
  await expect.poll(() => ids("Eliminate")).toEqual([b.id]);
  await drag(
    page,
    cdp,
    card(page, c.id).locator("[data-matrix-grip]"),
    lane(page, "Delegate").locator(".matrix-lane-empty"),
  );
  await expect.poll(() => ids("Delegate")).toEqual([c.id]);
  await menuMove(page, c.id, "Matristen çıkar");
  await expect(card(page, c.id)).toHaveCount(0);
  const unchanged = await (await fx.api.get(`/api/tasks/${c.id}`)).json();
  expect(unchanged.version).toBe(c.version);
  expect(unchanged.state).toBe("Pending");
  await page.screenshot({ path: `${EVIDENCE}/matrix-drag-${info.project.name}.png`, fullPage: true });
});
test("matrix unknown writes and offline moves never replay; stale versions require a new choice", async ({
  page,
  context,
}) => {
  const a = await task("Belirsiz matris işi");
  await add(a.id, "Do");
  await page.goto("/matrix");
  await expect(card(page, a.id)).toBeVisible();
  let writes = 0;
  page.on("request", r => {
    if (r.method() === "PUT" && new URL(r.url()).pathname.startsWith("/api/matrix/items/")) writes++;
  });
  await page.route("**/api/matrix/items/*", async route => {
    if (route.request().method() !== "PUT") return route.continue();
    const result = await route.fetch();
    expect(result.status()).toBe(200);
    await route.abort("failed");
  });
  await menuMove(page, a.id, "Planla alanına taşı");
  await expect(page.getByRole("alert").filter({ hasText: "İşlemin sonucu alınamadı" })).toBeVisible();
  expect(writes).toBe(1);
  expect(await ids("Schedule")).toEqual([a.id]);
  await page.unroute("**/api/matrix/items/*");
  await page.getByRole("button", { name: "Listeyi kontrol et", exact: true }).click();
  await expect(lane(page, "Schedule").locator(`[data-matrix-task="${a.id}"]`)).toBeVisible();
  expect(writes).toBe(1);
  await context.setOffline(true);
  await menuMove(page, a.id, "Şimdi yap alanına taşı");
  await expect(page.getByRole("alert").filter({ hasText: /Bağlantı/ })).toBeVisible();
  await context.setOffline(false);
  expect(writes).toBe(1);
  expect(await ids("Schedule")).toEqual([a.id]);
  await page.getByRole("button", { name: "Listeyi kontrol et", exact: true }).click();
  const old = await board();
  await page.route("**/api/matrix?*", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(old) }),
  );
  const remote = await fx.api.put(`/api/matrix/items/${a.id}`, {
    data: { version: old.version, quadrant: "Delegate" },
  });
  expect(remote.status()).toBe(200);
  await menuMove(page, a.id, "Şimdi yap alanına taşı");
  await expect(page.getByRole("alert").filter({ hasText: /Matris başka bir işlemde değişti/ })).toBeVisible();
  expect(writes).toBe(2);
  expect(await ids("Delegate")).toEqual([a.id]);
  await page.unroute("**/api/matrix?*");
  await page.getByRole("button", { name: "Listeyi kontrol et", exact: true }).click();
  await expect(lane(page, "Delegate").locator(`[data-matrix-task="${a.id}"]`)).toBeVisible();
  expect(writes).toBe(2);
});

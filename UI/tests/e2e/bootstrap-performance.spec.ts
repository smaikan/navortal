import { readdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { switchAccount } from "./helpers/session";

test.describe.configure({ mode: "default" });
let owners: FocusFixture[];
test.beforeEach(() => {
  owners = [];
});
test.afterEach(async () => {
  for (const owner of owners) {
    await owner.clean();
    await owner.api.dispose();
  }
});
async function fixture() {
  const owner = await FocusFixture.create();
  owners.push(owner);
  return owner;
}

async function holdSdk(page: Page) {
  const folder = ".local/next-e2e/static/chunks";
  const files = new Set(
    readdirSync(folder).filter(
      name => name.endsWith(".js") && readFileSync(`${folder}/${name}`, "utf8").includes("HubConnection"),
    ),
  );
  expect(files.size).toBeGreaterThan(0);
  let release!: () => void,
    held = false;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route("**/_next/static/chunks/*.js", async route => {
    if (files.has(new URL(route.request().url()).pathname.split("/").at(-1)!)) {
      held = true;
      await gate;
    }
    await route.continue();
  });
  return { release, held: () => held };
}

test("Today shares one initial workspace read and performs no separate preferences or sync reads", async ({
  page,
}, testInfo) => {
  const owner = await fixture();
  await owner.login(page);
  const sdk = await holdSdk(page);
  let snapshots = 0,
    preferences = 0,
    sync = 0;
  const reads: string[] = [],
    inbox: string[] = [];
  page.on("request", request => {
    if (request.method() !== "GET") return;
    const url = new URL(request.url()),
      path = url.pathname;
    if (path.startsWith("/api/")) reads.push(path);
    if (path === "/api/notifications") inbox.push(url.search);
    if (path === "/api/workspace/snapshot") snapshots++;
    if (path === "/api/preferences") preferences++;
    if (path === "/api/sync") sync++;
  });
  try {
    await page.goto("/planning", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("combobox", { name: "Görev ekle", exact: true })).toBeVisible();
    await expect.poll(sdk.held).toBe(true);
    expect(snapshots).toBe(1);
    expect(preferences).toBe(0);
    expect(sync).toBe(0);
    const catchup = page.waitForResponse(
      r => new URL(r.url()).pathname === "/api/workspace/snapshot" && r.status() === 200,
    );
    sdk.release();
    await (await catchup).finished();
    await expect(page.locator("[data-sync-state]")).toHaveAttribute("data-sync-state", "connected");
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    // Bağlanırken ikinci bir telafi sinyali ilk okuma sürerken gelirse tasarım gereği tek takip okuması yapılır.
    expect(snapshots).toBeGreaterThanOrEqual(2);
    expect(snapshots).toBeLessThanOrEqual(3);
    expect(preferences).toBe(0);
    expect(sync).toBe(0);
    // Sabit gözlem süresine abonelik sonrası telafi ve isteğe bağlı destekler dahildir.
    await page.waitForTimeout(10_000);
    const counts = Object.fromEntries(
      [...new Set(reads)].sort().map(path => [path, reads.filter(p => p === path).length]),
    );
    await testInfo.attach("today-api-read-counts", {
      body: JSON.stringify({ count: reads.length, counts }, null, 2),
      contentType: "application/json",
    });
    // 8 Kasım kullanıcı kararıyla bütçe 13: notlar, rutin önizlemesi ve sinyaller eklendi;
    // bu üçü sürüm taşımadığı için canlı bağlantıdan sonra bir kez daha okunuyor.
    expect(reads.length, JSON.stringify(counts)).toBeLessThanOrEqual(13);
    expect(reads.filter(path => path.endsWith("/overview"))).toHaveLength(1);
    // Zil ilk ekran boşta kalınca yalnız küçük sayı bilgisini bir kere okur, tam listeyi değil.
    expect(inbox).toEqual(["?offset=0&limit=10"]);
    expect(
      reads.some(path =>
        ["/api/notifications/preferences", "/api/work-sessions", "/api/focus-sessions/current"].includes(path),
      ),
    ).toBe(false);
  } finally {
    sdk.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("initial work is verified before commands, independently of a held realtime SDK", async ({ page }) => {
  const owner = await fixture(),
    task = await owner.task();
  await owner.login(page);
  const sdk = await holdSdk(page);
  let release!: () => void,
    entered = false,
    writes = 0;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/work-sessions/start") writes++;
  });
  await page.route("**/api/workspace/snapshot", async route => {
    entered = true;
    await gate;
    await route.continue();
  });
  try {
    await page.goto(`/tasks?taskId=${task.id}`, { waitUntil: "domcontentloaded" });
    const start = page.getByRole("button", { name: "Çalışmayı başlat", exact: true });
    await expect(start).toHaveCount(0);
    await expect.poll(() => entered).toBe(true);
    await expect.poll(sdk.held).toBe(true);
    expect(writes).toBe(0);
    release();
    await expect(start).toBeEnabled();
    await start.click();
    await expect(page.locator(".work-player-title")).toHaveText(task.title);
    expect(writes).toBe(1);
  } finally {
    release();
    sdk.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("an initial HTTP failure is visible and recoverable while the realtime SDK is still held", async ({ page }) => {
  const owner = await fixture(),
    task = await owner.task();
  await owner.login(page);
  const sdk = await holdSdk(page);
  let refuse = true;
  await page.route("**/api/workspace/snapshot", async route => {
    if (refuse)
      await route.fulfill({
        status: 503,
        contentType: "application/problem+json",
        body: JSON.stringify({ status: 503, title: "Owned fixture temporarily unavailable" }),
      });
    else await route.continue();
  });
  try {
    await page.goto(`/tasks?taskId=${task.id}`, { waitUntil: "domcontentloaded" });
    const start = page.getByRole("button", { name: "Çalışmayı başlat", exact: true });
    await expect(start).toHaveCount(0);
    const retry = page.getByRole("button", { name: "Çalışma durumunu yeniden oku", exact: true });
    await expect(retry).toBeVisible();
    await expect(page.locator(".work-player")).toHaveCount(0);
    await expect.poll(sdk.held).toBe(true);
    // Mobil görev ayrıntısı yerel modalda. Çalışma alanı kurtarma kontrolünden önce kapatıp
    // sonra gerçek görev listesinden yeniden açıyoruz.
    await page.getByRole("button", { name: "Görev ayrıntısı panelini kapat", exact: true }).click();
    refuse = false;
    await retry.click();
    await expect(retry).toHaveCount(0);
    await page.getByRole("button", { name: `${task.title} ayrıntısını aç`, exact: true }).click();
    await expect(start).toBeEnabled();
  } finally {
    sdk.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("a delayed old owner's bootstrap cannot replace the new owner's running work", async ({ page }) => {
  const first = await fixture(),
    second = await fixture();
  const a = await first.task(),
    b = await second.task();
  await first.start(undefined, a.id);
  await second.start(undefined, b.id);
  await first.login(page);
  const sdk = await holdSdk(page);
  let release!: () => void,
    entered = false;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route("**/api/workspace/snapshot", async route => {
    if (entered) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    entered = true;
    await gate;
    try {
      await route.fulfill({ response });
    } catch (error) {
      if (!route.request().failure()) throw error;
    }
  });
  try {
    await page.goto("/planning", { waitUntil: "domcontentloaded" });
    await expect.poll(() => entered).toBe(true);
    await switchAccount(page, second.token);
    await expect(page.locator(".work-player-title")).toHaveText(b.title);
    release();
    await expect(page.locator(".work-player-title")).toHaveText(b.title);
    await expect(page.locator(".work-player-title").filter({ hasText: a.title })).toHaveCount(0);
    expect((await first.current())!.state).toBe("Working");
    expect((await second.current())!.state).toBe("Working");
  } finally {
    release();
    sdk.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("running focus work waits for the focus read and does not fetch a hyperfocus task detail", async ({ page }) => {
  const owner = await fixture(),
    task = await owner.task();
  const focus = await owner.start(undefined, task.id);
  await owner.login(page);
  const sdk = await holdSdk(page);
  let release!: () => void,
    entered = false,
    taskReads = 0;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  page.on("request", request => {
    if (request.method() === "GET" && new URL(request.url()).pathname === `/api/tasks/${task.id}`) taskReads++;
  });
  await page.route("**/api/daily-plans/*/signals?observeFocus=true", async route => {
    entered = true;
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/planning", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".work-player-title")).toHaveText(task.title);
    await expect.poll(() => entered).toBe(true);
    expect(taskReads).toBe(0);
    const response = page.waitForResponse(
      r =>
        new URL(r.url()).pathname.endsWith("/signals") &&
        new URL(r.url()).searchParams.get("observeFocus") === "true" &&
        r.status() === 200,
    );
    release();
    expect((await (await response).json()).focus.id).toBe(focus.id);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(taskReads).toBe(0);
    await expect(page.locator(".nudge")).toHaveCount(0);
    expect((await owner.current())!.state).toBe("Working");
  } finally {
    release();
    sdk.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("focus arriving before initial work does not enqueue a redundant reconciliation", async ({ page }) => {
  const owner = await fixture(),
    task = await owner.task();
  await owner.start(undefined, task.id);
  await owner.login(page);
  const sdk = await holdSdk(page);
  let release!: () => void,
    syncReads = 0;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route("**/api/workspace/snapshot", async route => {
    syncReads++;
    if (syncReads === 1) await gate;
    await route.continue();
  });
  try {
    const focusRead = page.waitForResponse(
      r => new URL(r.url()).pathname === "/api/focus-sessions/current" && r.status() === 200,
    );
    await page.goto("/focus", { waitUntil: "domcontentloaded" });
    await focusRead;
    await expect.poll(sdk.held).toBe(true);
    const pause = page.getByRole("button", { name: "Odağı duraklat", exact: true });
    await expect(pause).toHaveCount(0);
    expect(syncReads).toBe(1);
    release();
    await expect(pause).toBeEnabled();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(syncReads).toBe(1);
    expect((await owner.current())!.state).toBe("Working");
  } finally {
    release();
    sdk.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

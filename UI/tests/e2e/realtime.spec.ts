import { randomUUID } from "node:crypto";
import { Temporal } from "temporal-polyfill";
import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import { FocusFixture, steady } from "./helpers/focus-fixture";
import { SESSION_MARKER_KEY } from "../../src/features/auth/session";
import { switchAccount } from "./helpers/session";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";
let fx: FocusFixture, foreign: FocusFixture;
const errors = new WeakMap<Page, { page: number; secretConsole: boolean }>();
const date = () => Temporal.Now.zonedDateTimeISO("Europe/Istanbul").toPlainDate().add({ days: 3 }).toString();
const connected = (p: Page) => expect(p.locator('[data-sync-state="connected"]')).toBeVisible();
const rows = (p: Page) => p.getByRole("region", { name: "Görev ağacı", exact: true });
async function rename(id: string, title: string, owner = fx) {
  const t = await (await owner.api.get(`/api/tasks/${id}`)).json();
  const r = await owner.api.put(`/api/tasks/${id}`, {
    data: {
      version: t.version,
      title,
      description: t.description,
      priority: t.priority,
      deadlineAt: t.deadlineAt,
      canSplit: t.canSplit,
    },
  });
  expect(r.status()).toBe(200);
  return r.json();
}
function watchErrors(page: Page) {
  const state = { page: 0, secretConsole: false };
  errors.set(page, state);
  page.on("pageerror", () => state.page++);
  page.on("console", m => {
    const text = m.text();
    if (text.includes(fx.token) || text.includes(foreign.token)) state.secretConsole = true;
  });
  return state;
}
async function tunnel(page: Page) {
  let peer: WebSocketRoute | undefined,
    upstream: WebSocketRoute | undefined,
    opens = 0,
    closes = 0;
  const events: { eventId: string; kind: string; sourceId: string }[] = [];
  await page.routeWebSocket("**/api/hubs/planner?**", ws => {
    peer = ws;
    opens++;
    const server = ws.connectToServer();
    upstream = server;
    server.onMessage(m => {
      if (typeof m === "string")
        for (const record of m.split("\x1e").filter(Boolean)) {
          try {
            const v = JSON.parse(record);
            if (v.target === "changed") events.push(v.arguments[0]);
          } catch {
            /* Yalnız olayın üst bilgisi toplanır. */
          }
        }
      ws.send(m);
    });
    ws.onMessage(m => server.send(m));
    ws.onClose((code, reason) => {
      closes++;
      server.close({ code: code ?? 1000, reason: reason ?? "" });
    });
    server.onClose((code, reason) => ws.close({ code: code ?? 1000, reason: reason ?? "" }));
  });
  return {
    events,
    opens: () => opens,
    closes: () => closes,
    inject: (values: object[]) =>
      peer!.send(values.map(v => JSON.stringify({ type: 1, target: "changed", arguments: [v] }) + "\x1e").join("")),
    disconnect: () => {
      upstream!.close({ code: 1012, reason: "test reconnect" });
      peer!.close({ code: 1012, reason: "test reconnect" });
    },
  };
}
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
  await foreign.clean();
  watchErrors(page);
  await fx.login(page);
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
  await fx.clean();
  const e = errors.get(page)!;
  expect(e.page).toBe(0);
  expect(e.secretConsole).toBe(false);
});

test("me verification gates the hub; same JWT uses Bearer negotiation and private WS through the safe proxy; task events refetch real HTTP", async ({
  page,
}, info) => {
  const t = await fx.task();
  const tap = await tunnel(page);
  let release!: () => void,
    arrived = false;
  const gate = new Promise<void>(r => {
    release = r;
  });
  let hubCalls = 0,
    negotiate = false,
    privateWs = false;
  page.on("request", r => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/hubs/planner")) return;
    hubCalls++;
    if (u.pathname.endsWith("negotiate"))
      // HttpOnly cookie doğrular. Authorization veya URL tokenı yok, POST'ta CSRF başlığı var.
      negotiate =
        !r.headers().authorization && !u.searchParams.has("access_token") && r.headers()["x-adhd-csrf"] === "1";
  });
  page.on("websocket", ws => {
    const u = new URL(ws.url());
    if (u.pathname === "/api/hubs/planner") privateWs = !u.searchParams.has("access_token");
  });
  await page.route("**/api/auth/me", async r => {
    arrived = true;
    await gate;
    await r.continue();
  });
  const nav = page.goto("/tasks");
  try {
    await expect.poll(() => arrived).toBe(true);
    expect(hubCalls).toBe(0);
    release();
    await nav;
    await connected(page);
  } finally {
    release();
  }
  expect(negotiate).toBe(true);
  expect(privateWs).toBe(true);
  expect(tap.opens()).toBe(1);
  const title = `Canlı güncelleme ${randomUUID()}`;
  await rename(t.id, title);
  await expect(rows(page)).toContainText(title);
  await expect.poll(() => tap.events.some(e => e.kind === "TaskChanged" && e.sourceId === t.id)).toBe(true);
  await auditTask(page, "connected", "realtime");
  await page.screenshot({ path: `${EVIDENCE}/realtime-connected-${info.project.name}.png` });
});

test("two same-owner tabs converge and a separate user never receives the other group's event or title", async ({
  page,
  context,
  browser,
}) => {
  const otherContext = await browser.newContext();
  try {
    const a = await fx.task(),
      b = await foreign.task();
    const second = await context.newPage(),
      other = await otherContext.newPage();
    const otherErrors = watchErrors(other),
      secondErrors = watchErrors(second);
    await foreign.login(other);
    const aTap = await tunnel(page),
      bTap = await tunnel(other);
    await Promise.all([page.goto("/tasks"), second.goto("/tasks"), other.goto("/tasks")]);
    await Promise.all([connected(page), connected(second), connected(other)]);
    const ownTitle = `Yalnız A ${randomUUID()}`,
      foreignTitle = `Yalnız B ${randomUUID()}`;
    await rename(a.id, ownTitle);
    await expect(rows(page)).toContainText(ownTitle);
    await expect(rows(second)).toContainText(ownTitle);
    await rename(b.id, foreignTitle, foreign);
    await expect(rows(other)).toContainText(foreignTitle);
    expect(bTap.events.some(e => e.sourceId === a.id)).toBe(false);
    expect(aTap.events.some(e => e.sourceId === b.id)).toBe(false);
    await expect(rows(other)).not.toContainText(ownTitle);
    await expect(rows(page)).not.toContainText(foreignTitle);
    expect(otherErrors).toEqual({ page: 0, secretConsole: false });
    expect(secondErrors).toEqual({ page: 0, secretConsole: false });
  } finally {
    await otherContext.close();
  }
});

test("duplicate/out-of-order event storm coalesces reads and never overwrites authoritative task text or versions", async ({
  page,
}) => {
  const t = await fx.task();
  const tap = await tunnel(page);
  await page.goto(`/tasks?taskId=${t.id}`);
  await connected(page);
  await expect(page.getByLabel("Görev başlığı", { exact: true })).toHaveValue(t.title);
  const title = `HTTP otoritesi ${randomUUID()}`;
  await rename(t.id, title);
  await expect(page.getByLabel("Görev başlığı", { exact: true })).toHaveValue(title);
  let taskReads = 0,
    listReads = 0;
  page.on("request", r => {
    if (r.method() !== "GET") return;
    const path = new URL(r.url()).pathname;
    // Görev paneli tam görünümü tek okumayla alır.
    if (path === `/api/tasks/${t.id}` || path === `/api/tasks/${t.id}/detail-view`) taskReads++;
    if (path === "/api/tasks") listReads++;
  });
  const values = Array.from({ length: 1000 }, (_, i) => ({
    eventId: randomUUID(),
    kind: "TaskChanged",
    sourceId: t.id,
    sourceVersion: i % 2 ? 1 : 9000,
  }));
  const repeated = [...values, ...values];
  tap.inject(repeated);
  await expect.poll(() => taskReads).toBeGreaterThan(0);
  await expect(page.getByLabel("Görev başlığı", { exact: true })).toHaveValue(title);
  expect(taskReads).toBeLessThanOrEqual(3);
  expect(listReads).toBeLessThanOrEqual(3);
  expect((await (await fx.api.get(`/api/tasks/${t.id}`)).json()).title).toBe(title);
});

test("PlanChanged source is resolved as a revision, then the selected day is reread", async ({ page }) => {
  const tap = await tunnel(page);
  await page.goto("/planning");
  await connected(page);
  const d = date();
  await page.getByLabel("Plan günü", { exact: true }).fill(d);
  await expect(page.getByRole("region", { name: "Gün planı", exact: true })).toBeVisible();
  const before = await (await fx.api.get(`/api/daily-plans/${d}`)).json();
  const reads: string[] = [];
  page.on("request", r => {
    const u = new URL(r.url());
    if (r.method() === "GET" && u.pathname.startsWith("/api/plan-revisions/")) reads.push(u.pathname);
  });
  const r = await fx.api.post("/api/schedules", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      localDate: d,
      kind: "Break",
      startsAt: `${d}T09:00:00+03:00`,
      endsAt: `${d}T09:10:00+03:00`,
      isFixed: true,
      expectedPlanningVersion: before.planningVersion,
    },
  });
  expect(r.status()).toBe(201);
  const result = await r.json();
  await expect
    .poll(() => tap.events.some(e => e.kind === "PlanChanged" && result.revisionIds.includes(e.sourceId)))
    .toBe(true);
  await expect.poll(() => reads.includes(`/api/plan-revisions/${result.revisionIds[0]}`)).toBe(true);
  await expect(page.getByRole("list", { name: "Saatli plan öğeleri", exact: true }).locator(":scope > li")).toHaveCount(
    1,
  );
});

test("Work/Focus events update the player; reconnect reconciles HTTP without finishing or duplicating a real session", async ({
  page,
}) => {
  const t = await fx.task();
  const tap = await tunnel(page);
  await page.goto("/tasks");
  await connected(page);
  const focus = await fx.start(steady, t.id);
  // Gerçek outbox teslimiyle ekran tepkisini ayırıyoruz. Eski testin odak olayı kabul edilmez.
  await expect.poll(() => tap.events.some(e => e.kind === "FocusChanged" && e.sourceId === focus.id)).toBe(true);
  await expect(page.getByRole("region", { name: "Çalışma denetimleri", exact: true })).toContainText(t.title);
  let domainWrites = 0,
    sync = 0;
  page.on("request", r => {
    const p = new URL(r.url()).pathname;
    if (p === "/api/workspace/snapshot") sync++;
    if (r.method() !== "GET" && p.startsWith("/api/") && !p.startsWith("/api/hubs/")) domainWrites++;
  });
  const count = tap.opens();
  tap.disconnect();
  await expect.poll(() => tap.opens()).toBeGreaterThan(count);
  await connected(page);
  await expect.poll(() => sync).toBeGreaterThan(0);
  expect((await fx.current())!.id).toBe(focus.id);
  expect((await fx.work(focus.workSessionId)).state).toBe("Running");
  expect(domainWrites).toBe(0);
  const paused = await fx.change(await fx.detail(focus.id), "pause");
  await expect(page.getByRole("region", { name: "Çalışma denetimleri", exact: true })).toContainText("Duraklatıldı");
  expect(paused.workSessionId).toBe(focus.workSessionId);
});

test("an environment without WebSocket uses real SSE via the same proxy and JWT; event data remains a refetch signal", async ({
  page,
}, info) => {
  await page.addInitScript(() => Object.defineProperty(window, "WebSocket", { value: undefined, configurable: true }));
  const t = await fx.task();
  let sse = false,
    negotiation = false;
  page.on("request", r => {
    const u = new URL(r.url());
    if (u.pathname === "/api/hubs/planner" && r.headers().accept?.includes("text/event-stream"))
      sse = !u.searchParams.has("access_token") && !r.headers().authorization;
    if (u.pathname.endsWith("/planner/negotiate"))
      negotiation =
        !r.headers().authorization && !u.searchParams.has("access_token") && r.headers()["x-adhd-csrf"] === "1";
  });
  await page.goto("/tasks");
  await connected(page);
  expect(sse).toBe(true);
  expect(negotiation).toBe(true);
  const title = `SSE güncellemesi ${randomUUID()}`;
  await rename(t.id, title);
  await expect(rows(page)).toContainText(title);
  await auditTask(page, "sse", "realtime");
  await page.screenshot({ path: `${EVIDENCE}/realtime-sse-${info.project.name}.png` });
});

test("hub failure keeps one 15/30 s fallback; hidden/offline stop it and returning reconciles the visible list", async ({
  page,
  context,
}, info) => {
  await page.route("**/api/hubs/planner/negotiate?**", r =>
    r.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await page.clock.install();
  const t = await fx.task();
  await page.goto("/tasks");
  await expect(page.locator('[data-sync-state="fallback"]')).toBeVisible();
  await page.clock.runFor(43000);
  await expect(page.locator('[data-sync-state="fallback"]')).toBeVisible();
  await expect(rows(page)).toContainText(t.title);
  let sync = 0;
  page.on("request", r => {
    if (new URL(r.url()).pathname === "/api/workspace/snapshot") sync++;
  });
  await page.clock.runFor(15000);
  await expect.poll(() => sync).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  sync = 0;
  await page.clock.runFor(60000);
  expect(sync).toBe(0);
  const title = `Dönüşte güncel ${randomUUID()}`;
  await rename(t.id, title);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(rows(page)).toContainText(title);
  await context.setOffline(true);
  await expect(page.locator('[data-sync-state="offline"]')).toBeVisible();
  sync = 0;
  await page.clock.runFor(45000);
  expect(sync).toBe(0);
  await context.setOffline(false);
  await expect.poll(() => sync).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Canlı bağlantıyı yeniden dene", exact: true })).toBeVisible();
  await auditTask(page, "fallback", "realtime");
  await page.screenshot({ path: `${EVIDENCE}/realtime-fallback-${info.project.name}.png` });
});

test("route changes reuse one hub; account change immediately detaches old events and gates the new connection behind me", async ({
  page,
}) => {
  const t = await fx.task(),
    other = await foreign.task();
  const tap = await tunnel(page);
  await page.goto("/tasks");
  await connected(page);
  for (let i = 0; i < 3; i++) {
    await page.getByRole("link", { name: "Gün Planlama", exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByRole("heading", { name: "Gün Planlama", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Görevler", exact: true }).filter({ visible: true }).first().click();
    await expect(rows(page)).toContainText(t.title);
  }
  expect(tap.opens()).toBe(1);
  let release!: () => void,
    held = false;
  const gate = new Promise<void>(r => {
    release = r;
  });
  await page.route("**/api/auth/me", async r => {
    held = true;
    await gate;
    await r.continue();
  });
  try {
    await switchAccount(page, foreign.token);
    await expect.poll(() => held).toBe(true);
    await expect.poll(() => tap.closes()).toBeGreaterThan(0);
    expect(tap.opens()).toBe(1);
    await expect(rows(page)).toHaveCount(0);
    release();
    await connected(page);
    await expect(rows(page)).toContainText(other.title);
    const title = `Eski hesap olayı ${randomUUID()}`;
    await rename(t.id, title);
    await expect(rows(page)).not.toContainText(title);
    expect(tap.opens()).toBe(2);
  } finally {
    release();
  }
});

test("hub 401 clears local identity/cache and stops retries without ending server work", async ({ page }) => {
  const t = await fx.task();
  const f = await fx.start(steady, t.id);
  let negotiations = 0;
  await page.route("**/api/hubs/planner/negotiate?**", r => {
    negotiations++;
    return r.fulfill({
      status: 401,
      contentType: "application/problem+json",
      body: '{"status":401,"code":"unauthorized"}',
    });
  });
  await page.goto("/tasks");
  await expect(page).toHaveURL(/\/login\?/);
  expect(await page.evaluate(key => localStorage.getItem(key), SESSION_MARKER_KEY)).toBeNull();
  expect(negotiations).toBe(1);
  expect((await fx.work(f.workSessionId)).state).toBe("Running");
  await expect(rows(page)).toHaveCount(0);
});

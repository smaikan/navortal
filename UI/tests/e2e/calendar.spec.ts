import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { test, expect, request, type APIRequestContext, type Page, type Locator } from "@playwright/test";
import { signIn } from "./helpers/session";
import type { Task } from "../../src/features/tasks/model";
import type { Day, Result } from "../../src/features/planning/model";
import { registerFixture } from "./helpers/fixture-account";
import { trackFaults } from "./helpers/faults";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";
let api: APIRequestContext,
  other: APIRequestContext,
  token: string,
  owner: string,
  actualIndex = 0;
const faults = new WeakMap<Page, string[]>();
const date = (n: number) => new Date(Date.now() + n * 86400000 + 10800000).toISOString().slice(0, 10);
const utc = (d: string, t: string) => new Date(`${d}T${t}+03:00`).toISOString();
const key = () => ({ "Idempotency-Key": randomUUID() });
const modal = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });
const daily = async (d: string): Promise<Day> => (await api.get(`/api/daily-plans/${d}`)).json();
async function register() {
  const c = await request.newContext({ baseURL: "http://127.0.0.1:5182" });
  const r = await registerFixture(c, "/api/auth/register", {
    data: { email: `calendar-${randomUUID()}@example.test`, password: randomUUID() },
  });
  expect(r.status()).toBe(201);
  const token = (await r.json()).accessToken as string;
  await c.dispose();
  return token;
}
const client = (t: string) =>
  request.newContext({ baseURL: "http://127.0.0.1:5182", extraHTTPHeaders: { Authorization: `Bearer ${t}` } });
async function configure(mode = "Preview", zone = "Europe/Istanbul") {
  const p = await (await api.get("/api/preferences")).json();
  expect(
    (
      await api.put("/api/preferences", {
        data: {
          version: p.version,
          values: {
            ...p.values,
            timeZoneId: zone,
            planningMode: mode,
            transitionSeconds: 0,
            minimumSplitSeconds: 900,
            weekly: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startMinute: 540, endMinute: 600 })),
            exceptions: [],
          },
        },
      })
    ).status(),
  ).toBe(200);
}
async function task(title: string, seconds: number | null = 7200, c = api): Promise<Task> {
  const r = await c.post("/api/tasks", { data: { title: `${title} ${randomUUID().slice(0, 6)}` } });
  expect(r.status()).toBe(201);
  const t = await r.json();
  const u = await c.put(`/api/tasks/${t.id}/work-definition`, {
    data: { version: t.version, hasDirectWork: true, directEstimatedSeconds: seconds, targetBudgetSeconds: null },
  });
  expect(u.status()).toBe(200);
  return u.json();
}
async function create(
  d: string,
  t: Task | null = null,
  fixed = false,
  start = "09:00",
  end = "10:00",
): Promise<Result> {
  const r = await api.post("/api/schedules", {
    headers: key(),
    data: {
      localDate: d,
      taskId: t?.id ?? null,
      kind: t ? "Work" : "Break",
      startsAt: utc(d, start),
      endsAt: utc(d, end),
      isFixed: fixed,
      expectedPlanningVersion: (await daily(d)).planningVersion,
    },
  });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
async function manual(t: Task, d = date(-70 - actualIndex++), start = "10:00", end = "11:00") {
  const r = await api.post("/api/work-sessions/manual", {
    headers: key(),
    data: { taskId: t.id, startedAt: utc(d, start), endedAt: utc(d, end), reason: "Takvim owned fixture" },
  });
  expect(r.status(), await r.text()).toBe(201);
  return r.json();
}
async function rename(t: Task, title: string) {
  const now = await (await api.get(`/api/tasks/${t.id}`)).json();
  expect(
    (
      await api.put(`/api/tasks/${t.id}`, {
        data: {
          version: now.version,
          title,
          description: now.description,
          priority: now.priority,
          deadlineAt: now.deadlineAt,
          canSplit: now.canSplit,
        },
      })
    ).status(),
  ).toBe(200);
}
async function pool(name = "Sonra", c = api) {
  const r = await c.post("/api/pools", { data: { name: `${name} ${randomUUID().slice(0, 6)}` } });
  expect(r.status()).toBe(201);
  return r.json();
}
function sql(text: string) {
  expect(process.env.PGDATABASE).toMatch(/^adhd_ui_test_[a-f0-9]{32}$/);
  expect(owner).toMatch(/^[a-f0-9-]{36}$/);
  return execFileSync(
    process.env.ADHD_UI_TEST_PSQL!,
    ["--no-psqlrc", "--dbname", process.env.PGDATABASE!, "--set=ON_ERROR_STOP=1", "--command", text],
    { encoding: "utf8", windowsHide: true },
  );
}
// Taşıma ve havuzda beklet Bugün'e taşındı. Takvim salt okunur.
async function home(page: Page, d: string) {
  await page.goto(`/planning?date=${d}`);
  await expect(page.locator(".r2-dayplan")).toHaveAttribute("data-plan-date", d);
  await expect(page.getByRole("status").filter({ hasText: "Gün planı okunuyor" })).toHaveCount(0);
}
async function submitPool(page: Page, f: Locator, status = 200) {
  const response = page.waitForResponse(
    r => r.request().method() === "POST" && /\/calendar\/days\/[^/]+\/tasks\/[^/]+\/pool$/.test(r.url()),
  );
  await f.getByRole("button", { name: "Seçili havuzda beklet", exact: true }).click();
  const r = await response;
  expect(r.status(), await r.text()).toBe(status);
  return r.json();
}
test.beforeAll(async () => {
  token = await register();
  api = await client(token);
  other = await client(await register());
  owner = (await (await api.get("/api/auth/me")).json()).id;
});
test.afterAll(async () => {
  await api?.dispose();
  await other?.dispose();
});
test.beforeEach(async ({ page }) => {
  await configure();
  const list: string[] = [];
  faults.set(page, list);
  trackFaults(page, list);
  await signIn(page, token);
});
test.afterEach(async ({ page }) => {
  expect(faults.get(page)).toEqual([]);
});

test("pool requires separate protected intent and preserves task identity, actual and immutable history while removing future reservations", async ({
  page,
}, info) => {
  const d = date(35),
    next = date(36),
    t = await task("Havuzda bekleyen"),
    p = await pool();
  await manual(t);
  const made = await create(d, t, true);
  await create(next, t);
  const original = await (await api.get(`/api/plan-revisions/${made.revisionIds[0]}/items?Limit=25`)).json(),
    before = await (await api.get(`/api/tasks/${t.id}/time`)).json();
  await home(page, d);
  const f = await openPool(page, p.name);
  await submitPool(page, f, 409);
  await f.getByRole("checkbox", { name: /Sabit veya kilitli gelecek/ }).check();
  await submitPool(page, f);
  await expect(f.getByRole("region", { name: "Havuzda bekletme onayı" })).toContainText("2 gün planı güncellendi");
  const current = await (await api.get(`/api/tasks/${t.id}`)).json();
  expect(current.id).toBe(t.id);
  expect(current.poolId).toBe(p.id);
  expect(current.state).toBe("Pending");
  expect((await (await api.get(`/api/tasks/${t.id}/time`)).json()).directActualSeconds).toBe(
    before.directActualSeconds,
  );
  expect(await (await api.get(`/api/plan-revisions/${made.revisionIds[0]}/items?Limit=25`)).json()).toEqual(original);
  await auditTask(page, "pool", "calendar");
  await page.screenshot({ path: `${EVIDENCE}/calendar-pool-${info.project.name}.png` });
});

test("pool stale rebase is explicit; an uncertain pool command is locked and replayed with its original key even if later reads fail", async ({
  page,
}) => {
  const d = date(39),
    t = await task("Havuz sürümü"),
    p = await pool("Sürüm havuzu");
  await create(d, t);
  await home(page, d);
  const f = await openPool(page, p.name);
  await rename(t, t.title + " yeni");
  await submitPool(page, f, 409);
  await f.getByRole("button", { name: "Güncel görev ve planı oku" }).click();
  await expect(f.getByRole("button", { name: "Seçili havuzda beklet" })).toBeDisabled();
  await f.getByRole("button", { name: "Bu sürümlerle yeniden hazırla" }).click();
  let lose = true,
    fail = false;
  const keys: string[] = [];
  await page.route("**/api/calendar/days/*/tasks/*/pool", async route => {
    keys.push(route.request().headers()["idempotency-key"]);
    if (lose) {
      lose = false;
      await route.fetch();
      await route.abort("failed");
    } else {
      fail = true;
      await route.continue();
    }
  });
  // Onaydan sonraki görünüm okumaları hangi uçtan gelirse gelsin düşer.
  await page.route("**/api/**", route =>
    fail && route.request().method() === "GET" && !new URL(route.request().url()).pathname.startsWith("/api/hubs/")
      ? route.fulfill({ status: 503, json: { status: 503, title: "Fixture", code: "fixture_unavailable" } })
      : route.fallback(),
  );
  await f.getByRole("button", { name: "Seçili havuzda beklet" }).click();
  await expect(f.getByRole("region", { name: "Belirsiz havuz sonucu" })).toBeVisible();
  await f.getByRole("button", { name: "Aynı havuz isteğini yeniden dene" }).press("Enter");
  await expect(f.getByRole("region", { name: "Havuzda bekletme onayı" })).toBeVisible();
  await expect(f.getByRole("alert").filter({ hasText: "Onay korunuyor" })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  fail = false;
});

test("offline pool never queues and a running task is not paused by pool; foreign pool/revision remain private", async ({
  page,
  context,
}) => {
  const d = date(42),
    t = await task("Aktif havuz"),
    p = await pool("Aktif hedef"),
    foreign = await pool("Yabancı", other);
  await create(d, t);
  await home(page, d);
  const f = await openPool(page, p.name);
  let posts = 0;
  page.on("request", r => {
    if (r.method() === "POST" && r.url().endsWith("/pool")) posts++;
  });
  await context.setOffline(true);
  await f.getByRole("button", { name: "Seçili havuzda beklet" }).click();
  await expect(f.getByRole("alert")).toContainText("Bağlantı yok");
  await context.setOffline(false);
  expect(posts).toBe(0);
  const active = await api.post("/api/work-sessions/start", { headers: key(), data: { taskId: t.id } });
  expect(active.status()).toBe(201);
  const w = await active.json();
  try {
    await submitPool(page, f, 409);
    await f.getByRole("button", { name: "Güncel görev ve planı oku" }).click();
    await f.getByRole("button", { name: "Bu sürümlerle yeniden hazırla" }).click();
    await submitPool(page, f, 409);
    await expect(f.getByRole("alert")).toContainText("açıkça duraklat");
    expect((await (await api.get(`/api/work-sessions/${w.id}`)).json()).state).toBe("Running");
  } finally {
    const v = await (await api.get(`/api/work-sessions/${w.id}`)).json();
    expect((await api.post(`/api/work-sessions/${w.id}/finish`, { data: { version: v.version } })).status()).toBe(200);
  }
  const current = await (await api.get(`/api/tasks/${t.id}`)).json();
  const denied = await api.post(`/api/calendar/days/${d}/tasks/${t.id}/pool`, {
    headers: key(),
    data: { version: current.version, expectedPlanningVersion: (await daily(d)).planningVersion, poolId: foreign.id },
  });
  expect(denied.status()).toBe(404);
  const foreignTask = await task("Özel görev", 3600, other);
  const fd = await (await other.get(`/api/daily-plans/${d}`)).json();
  const r = await other.post("/api/schedules", {
    headers: key(),
    data: {
      localDate: d,
      taskId: foreignTask.id,
      kind: "Work",
      startsAt: utc(d, "12:00"),
      endsAt: utc(d, "13:00"),
      expectedPlanningVersion: fd.planningVersion,
    },
  });
  expect(r.status()).toBe(201);
  expect((await api.get(`/api/calendar/days/${d}?RevisionId=${(await r.json()).revisionIds[0]}`)).status()).toBe(404);
});

test("second-day pool write failure rolls back task classification, both plan days and actual before a clean retry", async ({
  page,
}) => {
  const d = date(45),
    next = date(46),
    t = await task("Atomik havuz"),
    p = await pool("Atomik hedef");
  await create(d, t);
  await create(next, t);
  await manual(t);
  const before = await daily(d),
    otherBefore = await daily(next),
    time = await (await api.get(`/api/tasks/${t.id}/time`)).json(),
    suffix = randomUUID().replaceAll("-", "");
  await home(page, d);
  const f = await openPool(page, p.name);
  sql(
    `CREATE FUNCTION ui18_fail_${suffix}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."UserId"='${owner}' AND EXISTS(SELECT 1 FROM daily_plans d WHERE d."Id"=NEW."DailyPlanId" AND d."LocalDate"='${next}') THEN RAISE EXCEPTION 'UI18 owned atomic fixture'; END IF; RETURN NEW; END $$; CREATE TRIGGER ui18_fail_${suffix} BEFORE INSERT ON plan_revisions FOR EACH ROW EXECUTE FUNCTION ui18_fail_${suffix}();`,
  );
  try {
    const now = await (await api.get(`/api/tasks/${t.id}`)).json();
    const failed = await api.post(`/api/calendar/days/${d}/tasks/${t.id}/pool`, {
      headers: key(),
      data: { version: now.version, expectedPlanningVersion: before.planningVersion, poolId: p.id },
    });
    expect(failed.status()).toBe(500);
    expect((await (await api.get(`/api/tasks/${t.id}`)).json()).poolId).toBeNull();
    expect((await daily(d)).currentRevisionId).toBe(before.currentRevisionId);
    expect((await daily(next)).currentRevisionId).toBe(otherBefore.currentRevisionId);
    expect((await (await api.get(`/api/tasks/${t.id}/time`)).json()).directActualSeconds).toBe(
      time.directActualSeconds,
    );
  } finally {
    sql(`DROP TRIGGER ui18_fail_${suffix} ON plan_revisions; DROP FUNCTION ui18_fail_${suffix}();`);
  }
  await submitPool(page, f);
  await expect(f.getByRole("region", { name: "Havuzda bekletme onayı" })).toContainText("2 gün planı güncellendi");
});

// Takvim varsayılan ay, hafta ve Bugün bağlantılı salt okunur gün penceresi sunar.
const cal = (page: Page) => page.getByRole("grid");
const cell = (page: Page, label: RegExp) => page.getByRole("button", { name: label });
async function untimed(d: string, t: Task) {
  const r = await api.post(`/api/daily-plans/${d}/items`, { data: { taskId: t.id } });
  expect(r.status()).toBe(201);
  return r.json();
}
async function child(parent: Task, title: string, seconds = 1800): Promise<Task> {
  const p = await (await api.get(`/api/tasks/${parent.id}`)).json();
  const r = await api.post(`/api/tasks/${parent.id}/children`, {
    data: {
      title: `${title} ${randomUUID().slice(0, 6)}`,
      parentVersion: p.version,
      parentWorkDisposition: "ConvertToContainer",
    },
  });
  expect(r.status()).toBe(201);
  const c = await r.json();
  const u = await api.put(`/api/tasks/${c.id}/work-definition`, {
    data: { version: c.version, hasDirectWork: true, directEstimatedSeconds: seconds, targetBudgetSeconds: null },
  });
  expect(u.status()).toBe(200);
  return u.json();
}
const monthNames = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];
const dayName = (d: string) => {
  const x = new Date(`${d}T12:00:00Z`);
  return `${["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"][x.getUTCDay()]}, ${x.getUTCDate()} ${monthNames[x.getUTCMonth()]}`;
};
test("month is the default: one entry per root task per day, +N beyond three, done roots struck through, and the arrows move by month", async ({
  page,
}, info) => {
  const d = date(60),
    root = await task("Tez bölümü"),
    a = await child(root, "Kaynakça"),
    b = await child(root, "Tablolar");
  const extra = await Promise.all([1, 2, 3].map(i => task(`Ek iş ${i}`)));
  await create(d, a, false, "09:00", "09:30");
  await create(d, b, false, "10:00", "10:30");
  for (const t of extra) await untimed(d, t);
  const done = await task("Biten iş");
  const doneItem = await untimed(date(61), done);
  expect(
    (await api.post(`/api/day-items/${doneItem.id}/complete`, { data: { version: doneItem.version } })).status(),
  ).toBe(200);
  await page.goto(`/calendar?date=${d}`);
  await expect(page.getByRole("button", { name: "Ay", exact: true })).toHaveAttribute("aria-pressed", "true");
  const day = cell(page, new RegExp(`^${dayName(d)}, 4 ana görev`));
  await expect(day).toBeVisible();
  await expect(day).toContainText(root.title);
  await expect(day).not.toContainText(a.title);
  await expect(day).toContainText("+1 daha");
  await expect(cell(page, new RegExp(`^${dayName(date(61))}, 1 ana görev`)).locator(".r2-day-item.done")).toContainText(
    done.title,
  );
  await expect(page.getByText(/Agenda|Gün ayrıntısı|baseline|Kesim:/)).toHaveCount(0);
  await auditTask(page, "calendar-month", "calendar");
  await page.screenshot({ path: `${EVIDENCE}/calendar-month-${info.project.name}.png`, fullPage: true });
  const label = page.locator(".r2-cal-label");
  const before = await label.textContent();
  await page.getByRole("button", { name: "Sonraki ay" }).click();
  await expect(label).not.toHaveText(before!);
  await page.getByRole("button", { name: "Önceki ay" }).click();
  await expect(label).toHaveText(before!);
  const current = page.getByRole("button", { name: "Bu ay", exact: true });
  if (page.viewportSize()!.width > 767) {
    await current.click();
    await expect(page).not.toHaveURL(/date=/);
  } else {
    await expect(current).toBeHidden();
  }
  for (const width of info.project.name === "chromium" ? [1440, 768, 390] : [info.project.use.viewport!.width]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
});
test("week view lists each day's root tasks with their subtasks and times; the URL keeps the view", async ({
  page,
}, info) => {
  const d = date(63),
    root = await task("Taşınma"),
    a = await child(root, "Kutu al"),
    b = await child(root, "Nakliye ara"),
    timedSolo = await task("Akşam kitap okuma saati için uzun bir görev başlığı"),
    solo = await task("Yürüyüş");
  await create(d, a, false, "14:00", "14:30");
  await untimed(d, b);
  await create(d, timedSolo, false, "16:00", "16:30");
  await untimed(d, solo);
  await page.goto(`/calendar?date=${d}&view=hafta`);
  await expect(page.getByRole("button", { name: "Hafta", exact: true })).toHaveAttribute("aria-pressed", "true");
  const col = page.getByRole("region", { name: new RegExp(`^${dayName(d)}`) });
  await expect(col).toContainText(root.title);
  await expect(col).toContainText(a.title);
  await expect(col).toContainText("14:00");
  await expect(col).toContainText(b.title);
  // Alt görevi olmayan plan başlığı tek kez yazılır; saatsiz plana yer tutucu konmaz.
  await expect(col.getByText(timedSolo.title, { exact: true })).toHaveCount(1);
  await expect(col.getByText(solo.title, { exact: true })).toHaveCount(1);
  await expect(col).toContainText("16:00");
  await expect(col).not.toContainText("·");
  // Planlar çizelge satırlarıdır: üst üste binmez, sütun dışına taşmaz, ince çizgiyle ayrılır.
  await expect(col.locator(".r2-week-group")).toHaveCount(3);
  const layout = await col.evaluate(section => {
    const box = section.getBoundingClientRect();
    const items = [...section.querySelectorAll<HTMLElement>(".r2-week-group")];
    return {
      inside: items.every(el => {
        const r = el.getBoundingClientRect();
        return r.left >= box.left && r.right <= box.right;
      }),
      stacked: items.every(
        (el, i) => !i || el.getBoundingClientRect().top >= items[i - 1].getBoundingClientRect().bottom,
      ),
      ruled: items.slice(0, -1).every(el => parseFloat(getComputedStyle(el).borderBottomWidth) > 0),
    };
  });
  expect(layout).toEqual({ inside: true, stacked: true, ruled: true });
  await auditTask(page, "calendar-week", "calendar");
  await page.screenshot({ path: `${EVIDENCE}/calendar-week-${info.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Ay", exact: true }).click();
  await expect(page).not.toHaveURL(/view=hafta/);
});
test("week plan rows keep a visible divider on the blue today column in light and dark themes", async ({
  page,
}, info) => {
  const d = date(0),
    a = await task("Bugünkü ilk plan"),
    b = await task("Bugünkü ikinci plan"),
    root = await task("Sunum hazırlığı"),
    sub = await child(root, "Slaytları gözden geçir"),
    finished = await task("Biten plan");
  await create(d, b, false, "09:00", "09:30");
  await create(d, sub, false, "10:00", "10:30");
  await untimed(d, a);
  const doneItem = await untimed(d, finished);
  expect(
    (await api.post(`/api/day-items/${doneItem.id}/complete`, { data: { version: doneItem.version } })).status(),
  ).toBe(200);
  await page.goto("/calendar?view=hafta");
  const col = page.locator(".r2-week-day.today");
  await expect(col.locator(".r2-week-group")).toHaveCount(4);
  // Boş gün yazısı masaüstünde görünmez ama ekran okuyucuda kalır; telefonda satır içinde görünür.
  const hint = page.locator(".r2-week-empty").first();
  if (info.project.name === "chromium") {
    await expect.poll(() => hint.evaluate(el => el.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
    const fit = await page.locator(".r2-week").evaluate(week => {
      const days = [...week.querySelectorAll<HTMLElement>(".r2-week-day")].map(day =>
        [...day.children].reduce((sum, el) => sum + (el.getBoundingClientRect().height || 0), 0),
      );
      return week.getBoundingClientRect().height - Math.max(...days);
    });
    expect(fit).toBeLessThanOrEqual(3);
    await page.setViewportSize({ width: 1024, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `${EVIDENCE}/calendar-week-1024-${info.project.name}.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 800 });
  } else await expect(hint).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => document.documentElement.setAttribute("data-theme", value), theme);
    const colors = await col.evaluate(section => ({
      column: getComputedStyle(section).backgroundColor,
      line: getComputedStyle(section.querySelector(".r2-week-group")!).borderBottomColor,
      head: getComputedStyle(section.querySelector(".r2-week-head")!).borderBottomWidth,
    }));
    expect(colors.line).not.toBe(colors.column);
    // 1024–1299px masaüstü ölçeği (0.9) 2px çizgiyi cihaz pikseline yuvarlar; çizgi görünür kalmalı.
    expect(parseFloat(colors.head)).toBeGreaterThanOrEqual(1);
    await auditTask(page, `calendar-week-today-${theme}`, "calendar");
    await page.screenshot({
      path: `${EVIDENCE}/calendar-week-today-${theme}-${info.project.name}.png`,
      fullPage: true,
    });
  }
});
test("the day dialog lists timed items in time order, then untimed, subtasks under their root; a past day shows real work and links to Bugün", async ({
  page,
}, info) => {
  const d = date(-5),
    root = await task("Rapor"),
    a = await child(root, "Grafikler"),
    b = await child(root, "Özet"),
    solo = await task("Yürüyüş");
  await create(d, b, false, "11:00", "11:30");
  await create(d, a, false, "09:00", "09:45");
  await untimed(d, solo);
  await manual(a, d, "09:00", "09:40");
  await page.goto(`/calendar?date=${d}`);
  const trigger = cell(page, new RegExp(`^${dayName(d)}`));
  await trigger.click();
  const f = modal(page, dayName(d));
  await expect(f).toBeVisible();
  await expect(f).toContainText("3 plan öğesi · 0 bitti");
  await expect(f).toContainText("Gerçek çalışma: 40 dk");
  const text = await f.innerText();
  expect(text.indexOf(a.title)).toBeLessThan(text.indexOf(b.title));
  expect(text.indexOf(b.title)).toBeLessThan(text.indexOf("Saati belirlenmemiş"));
  expect(text.indexOf("Saati belirlenmemiş")).toBeLessThan(text.indexOf(solo.title));
  await expect(f.getByRole("button", { name: /İş veya mola ekle|havuz/ })).toHaveCount(0);
  await auditTask(page, "calendar-day", "calendar");
  await page.screenshot({ path: `${EVIDENCE}/calendar-day-${info.project.name}.png` });
  await page.keyboard.press("Escape");
  await expect(f).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await f.getByRole("link", { name: "Gün planını düzenle" }).click();
  await expect(page).toHaveURL(new RegExp(`/planning\\?date=${d}`));
  await expect(page.locator(".r2-dayplan")).toHaveAttribute("data-plan-date", d);
});
test("day notes are shared by calendar and planning and stay on their own date", async ({ page }, info) => {
  const d = date(12);
  await page.goto("/notes");
  await expect(page.getByRole("link", { name: "Tümü", exact: true })).toBeVisible();
  const dayCategory = page.getByRole("link", { name: "Gün Notları", exact: true });
  await expect(dayCategory).toHaveCount(0);
  await page.goto(`/calendar?date=${d}`);
  const open = () => cell(page, new RegExp(`^${dayName(d)}`)).click();
  await open();
  const dialog = modal(page, dayName(d));
  const notes = page.getByRole("region", { name: "Gün notları", exact: true });
  const save = async (text: string) => {
    await notes.getByRole("textbox", { name: "Gün notu", exact: true }).fill(text);
    await notes.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(notes.getByRole("textbox", { name: "Gün notu", exact: true })).toHaveCount(0);
    await expect(notes.getByText(text, { exact: true })).toBeVisible();
  };
  await notes.getByRole("button", { name: "Not ekle", exact: true }).click();
  await save("Belgeleri önceden hazırla");
  await dialog.getByRole("link", { name: "Gün planını düzenle" }).click();
  await expect(page).toHaveURL(new RegExp(`/planning\\?date=${d}`));
  await expect(dialog).toBeHidden();
  await expect(notes.getByText("Belgeleri önceden hazırla")).toBeVisible();
  await notes.getByRole("button", { name: /Gün notu işlemleri/ }).click();
  await page.getByRole("menuitem", { name: "Düzenle", exact: true }).click();
  await save("Belgeleri sabah hazırla");
  await auditTask(page, "day-note-planning", "calendar");
  await page.screenshot({ path: `${EVIDENCE}/day-note-planning-${info.project.name}.png` });
  await page.getByRole("button", { name: "Sonraki gün", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`date=${date(13)}`));
  await expect(notes).toHaveCount(0);
  await page.getByRole("button", { name: "Plan menüsü", exact: true }).click();
  await page.getByRole("menuitem", { name: "Güne not ekle", exact: true }).click();
  await save("Yarın dosyaları gönder");
  await notes.getByRole("button", { name: "Not ekle", exact: true }).click();
  await expect(notes.getByRole("textbox", { name: "Gün notu", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Gün Planlama", exact: true }).click();
  await expect(page).toHaveURL(/\/planning$/);
  await expect(notes).toHaveCount(0);
  await page.goto(`/calendar?date=${d}`);
  await open();
  await expect(notes.getByText("Belgeleri sabah hazırla")).toBeVisible();
  await expect(notes.getByText("Yarın dosyaları gönder")).toHaveCount(0);
  await auditTask(page, "day-note-calendar", "calendar");
  await page.screenshot({ path: `${EVIDENCE}/day-note-calendar-${info.project.name}.png` });
  const response = await api.get(`/api/notes?kind=Daily&date=${d}`);
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.items).toHaveLength(1);
  expect(data.items[0]).toMatchObject({ localDate: d, text: "Belgeleri sabah hazırla" });
  await page.goto("/notes");
  await expect(dayCategory).toHaveCount(1);
  await dayCategory.click();
  const categorized = page.getByRole("region", { name: "Gün Notları", exact: true });
  await expect(categorized).toContainText("Belgeleri sabah hazırla");
  await expect(categorized).toContainText("Yarın dosyaları gönder");
  await expect(categorized.getByText("Kategorisiz", { exact: true })).toHaveCount(0);
});

test("calendar items stay private and the range is bounded by the server", async ({ page }) => {
  const d = date(66),
    mine = await task("Benim takvimim");
  await untimed(d, mine);
  const theirs = await (await other.get(`/api/calendar/items?fromDate=${d}&toDate=${d}`)).json();
  expect(theirs.items).toHaveLength(0);
  expect((await api.get(`/api/calendar/items?fromDate=${d}&toDate=${date(66 + 42)}`)).status()).toBe(400);
  await page.goto(`/calendar?date=${d}&view=hafta`);
  await expect(page.getByRole("region", { name: new RegExp(`^${dayName(d)}`) })).toContainText(mine.title);
  await page.goto("/calendar?date=2026-13-45");
  await expect(cal(page)).toBeVisible();
});
async function openPool(page: Page, name: string) {
  await page
    .getByRole("button", { name: /plan öğesi menüsü$/ })
    .first()
    .press("Enter");
  await page.getByRole("menuitem", { name: "Bu işi havuzda beklet", exact: true }).press("Enter");
  const f = modal(page, "İşi havuzda beklet");
  await f.getByRole("radio", { name, exact: true }).check();
  return f;
}

import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, request, type APIRequestContext, type Page } from "@playwright/test";
import { signIn } from "./helpers/session";
import { registerFixture } from "./helpers/fixture-account";
import { trackFaults } from "./helpers/faults";
import { EVIDENCE } from "./helpers/evidence";
import { auditTask } from "./helpers/task-audit";
import { assertR3Reflow } from "./helpers/r3-reflow";
import { planMenu } from "./helpers/menu";
import type { DayItem } from "../../src/features/planning/model";
test.describe.configure({ mode: "default" });
// Gerçek yığında gün çubuğu, tek görev, ilk adım, hafifletme/geri al, komut
// paleti, toplu giriş, destekler, enerji, dönüş kartı ve özel günler test ediliyor.
let api: APIRequestContext;
let token: string;
const faults = new WeakMap<Page, string[]>();
const future = (n: number) => new Date(Date.now() + n * 86400000 + 10800000).toISOString().slice(0, 10);
const tag = () => randomUUID().slice(0, 7);

test("the same Ready unread schedule notification replaces a nudge; a preference or a read notification alone does not", async ({
  page,
}) => {
  const t = await task("Geçiş uyarısı");
  const now = new Date(),
    start = new Date(now.getTime() + 9.5 * 60000),
    end = new Date(now.getTime() + 20 * 60000);
  const d = new Date(now.getTime() + 10800000).toISOString().slice(0, 10);
  let p = await (await api.get("/api/notifications/preferences")).json();
  expect(
    (
      await api.put("/api/notifications/preferences", {
        data: {
          version: p.version,
          settings: {
            ...p.settings,
            enabled: true,
            scheduleStart: true,
            scheduleEnd: false,
            leadSeconds: 0,
            quietStart: null,
            quietEnd: null,
          },
        },
      })
    ).status(),
  ).toBe(200);
  const day = await (await api.get(`/api/daily-plans/${d}`)).json();
  const created = await api.post("/api/schedules", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      localDate: d,
      taskId: t.id,
      kind: "Work",
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      expectedPlanningVersion: day.planningVersion,
    },
  });
  expect(created.status()).toBe(201);
  const block = (await created.json()).schedules[0];
  await page.goto("/planning");
  await expect(page.locator(".nudge")).toContainText(t.title);
  await expect(page.locator('[data-sync-state="connected"]')).toHaveCount(1);
  p = await (await api.get("/api/notifications/preferences")).json();
  expect(
    (
      await api.put("/api/notifications/preferences", {
        data: { version: p.version, settings: { ...p.settings, leadSeconds: 600 } },
      })
    ).status(),
  ).toBe(200);
  let notification: { id: string; version: number; state: string } | undefined;
  await expect
    .poll(
      async () => {
        notification = (await (await api.get("/api/notifications?limit=100")).json()).items.find(
          (n: { sourceId: string; kind: string; state: string }) =>
            n.sourceId === block.id && n.kind === "ScheduleStart" && n.state === "Ready",
        );
        return notification?.state;
      },
      { timeout: 15000 },
    )
    .toBe("Ready");
  await expect(page.locator(".nudge")).toHaveCount(0);
  expect(
    (
      await api.post(`/api/notifications/${notification!.id}/read`, { data: { version: notification!.version } })
    ).status(),
  ).toBe(200);
  await page.reload();
  await expect(page.locator(".nudge")).toContainText(t.title);
});

test("special day edit changes capacity without moving work; owned reminder reaches the real inbox", async ({
  page,
}) => {
  const d = future(112),
    name = `Özel izin ${tag()}`;
  const prefs = await (await api.get("/api/preferences")).json();
  expect(
    (
      await api.put("/api/preferences", {
        data: {
          version: prefs.version,
          values: {
            ...prefs.values,
            weekly: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startMinute: 540, endMinute: 1020 })),
            exceptions: [],
          },
        },
      })
    ).status(),
  ).toBe(200);
  const t = await task("Özel günde kalan görev");
  await item(d, t.id);
  const before = await items(d);
  expect(
    Number((await (await api.get(`/api/daily-plans/${d}/glance`)).json()).workingRemainingSeconds),
  ).toBeGreaterThan(0);
  const notificationPrefs = await (await api.get("/api/notifications/preferences")).json();
  expect(
    (
      await api.put("/api/notifications/preferences", {
        data: {
          version: notificationPrefs.version,
          settings: {
            ...notificationPrefs.settings,
            enabled: true,
            specialDay: true,
            quietStart: null,
            quietEnd: null,
          },
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/reminders/special-days");
  await page.getByRole("button", { name: "Özel gün ekle", exact: true }).click();
  let form = page.getByRole("dialog", { name: "Özel gün ekle", exact: true });
  await form.getByLabel("Ad", { exact: true }).fill(name);
  await form.getByLabel("Gün", { exact: true }).selectOption(String(Number(d.slice(8, 10))));
  await form.getByLabel("Ay", { exact: true }).selectOption(String(Number(d.slice(5, 7))));
  await form.getByLabel("Hatırlatma", { exact: true }).selectOption("SameDay");
  await form.getByLabel(/Çalışma dışı gün/).check();
  await form.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(form).toHaveCount(0);
  expect(Number((await (await api.get(`/api/daily-plans/${d}/glance`)).json()).workingRemainingSeconds)).toBe(0);
  expect((await items(d)).map(x => x.id)).toEqual(before.map(x => x.id));
  const row = page.locator(".special-item").filter({ hasText: name });
  await row.getByRole("button").last().click();
  await page.getByRole("menuitem", { name: "Düzenle", exact: true }).click();
  form = page.getByRole("dialog", { name: "Özel günü düzenle", exact: true });
  await form.getByLabel("Ad", { exact: true }).fill(`${name} güncel`);
  await form.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(row).toContainText("güncel");
  const source = (await (await api.get("/api/special-days?limit=100")).json()).items.find(
    (x: { title: string }) => x.title === `${name} güncel`,
  );
  const owner = (await (await api.get("/api/auth/me")).json()).id;
  const run = readFileSync(".local/e2e-run.lock", "utf8").trim();
  expect(run).toMatch(/^[a-f0-9]{32}$/);
  expect(process.env.PGDATABASE).toBe(`adhd_ui_test_${run}`);
  expect(owner).toMatch(/^[a-f0-9-]{36}$/);
  expect(source.id).toMatch(/^[a-f0-9-]{36}$/);
  // Yalnız koşuya ait gelecek kayıt zamanı gelmiş yapılır. Ready ve SignalR'ı normal Quartz worker üretir.
  execFileSync(
    process.env.ADHD_UI_TEST_PSQL!,
    ["--no-psqlrc", "--set=ON_ERROR_STOP=1", `--set=owner=${owner}`, `--set=source=${source.id}`],
    {
      input: `UPDATE notification_intents SET "NotBefore"=NOW()-interval '1 second' WHERE "UserId"=:'owner'::uuid AND "SourceId"=:'source'::uuid AND "State"='Pending';
        UPDATE outbox_messages SET "AvailableAt"=NOW() WHERE "UserId"=:'owner'::uuid AND "Kind"='NotificationReady' AND "State"='Pending' AND "SourceId" IN (SELECT "Id" FROM notification_intents WHERE "UserId"=:'owner'::uuid AND "SourceId"=:'source'::uuid AND "State"='Pending');`,
      stdio: "pipe",
      windowsHide: true,
    },
  );
  await expect
    .poll(
      async () =>
        (await (await api.get("/api/notifications?limit=100")).json()).items.find(
          (n: { sourceId: string; state: string }) => n.sourceId === source.id && n.state === "Ready",
        )?.state,
      { timeout: 15000 },
    )
    .toBe("Ready");
  await page.goto("/planning");
  await page.getByRole("button", { name: /^Bildirimler/ }).click();
  await expect(page.getByRole("dialog", { name: "Bildirimler", exact: true })).toContainText("Özel gün");
});

for (const theme of ["light", "dark"] as const)
  test(`R3 new supports reflow, keyboard and contrast in ${theme} theme`, async ({ page }, info) => {
    const d = future(theme === "dark" ? 121 : 120),
      t = await task("Uzun Türkçe adımlarla sakin plan ".repeat(6));
    await item(d, t.id);
    await openDay(page, d, "&gorunum=tek");
    await page.evaluate(value => document.documentElement.setAttribute("data-theme", value), theme);
    const sizes =
      info.project.name === "chromium"
        ? [
            [320, 900],
            [390, 900],
            [640, 900],
            [768, 900],
            [1920, 900],
            [640, 320],
          ]
        : [
            [390, 900],
            [640, 320],
          ];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await expect(page.locator(".one-thing")).toContainText(t.title);
      await expect(page.locator(".one-thing")).toHaveAccessibleName(t.title.replace(/\s+/g, " ").trim());
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({
        path: `${EVIDENCE}/r3-reflow-${theme}-${info.project.name}-${width}-${height}.png`,
        fullPage: true,
      });
    }
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("combobox")).toBeFocused();
    await assertR3Reflow(page, page.getByRole("combobox"), `palette-${theme}`, info);
    await auditTask(page, `palette-${theme}`, "r3-acceptance", theme);
    await page.keyboard.press("Escape");
    await auditTask(page, `one-thing-${theme}`, "r3-acceptance", theme);
  });

test("panel calibration needs three real comparable samples, stays read-only until explicit apply and writes once", async ({
  page,
}) => {
  const category = await (await api.post("/api/categories", { data: { name: `Kalibrasyon ${tag()}` } })).json();
  async function classify(id: string) {
    const c = await (await api.get(`/api/tasks/${id}/classification`)).json();
    expect(
      (
        await api.put(`/api/tasks/${id}/classification`, {
          data: { version: c.version, expectedPlanningVersion: c.planningVersion, categoryId: category.id, tagIds: [] },
        })
      ).status(),
    ).toBe(200);
  }
  const yesterday = future(-2);
  for (let index = 0; index < 3; index++) {
    const t = await task(`Örnek ${index}`);
    await classify(t.id);
    expect(
      (
        await api.post("/api/work-sessions/manual", {
          headers: { "Idempotency-Key": randomUUID() },
          data: {
            taskId: t.id,
            startedAt: `${yesterday}T0${index + 6}:00:00Z`,
            endedAt: `${yesterday}T0${index + 6}:${(index + 1) * 10}:00Z`,
            reason: "R3 gerçek kalibrasyon örneği",
          },
        })
      ).status(),
    ).toBe(201);
    const fresh = await (await api.get(`/api/tasks/${t.id}`)).json();
    expect(
      (await api.post(`/api/tasks/${t.id}/state`, { data: { version: fresh.version, action: "Complete" } })).status(),
    ).toBe(200);
  }
  const target = await task("Öneri alacak iş");
  await classify(target.id);
  const before = await (await api.get(`/api/tasks/${target.id}`)).json();
  let writes = 0;
  page.on("request", r => {
    if (r.method() === "PUT" && r.url().endsWith(`/api/tasks/${target.id}/work-definition`)) writes++;
  });
  await page.goto(`/tasks?taskId=${target.id}`);
  await expect(page.getByText("Benzer işler genelde 20 dk sürdü.", { exact: false })).toBeVisible();
  expect(writes).toBe(0);
  expect((await (await api.get(`/api/tasks/${target.id}`)).json()).version).toBe(before.version);
  await page.getByRole("button", { name: "Tahmin olarak kullan", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Kaydedildi" }).first()).toBeVisible();
  expect(writes).toBe(1);
  expect((await (await api.get(`/api/tasks/${target.id}`)).json()).directEstimatedSeconds).toBe(1200);
});
async function task(title: string) {
  const r = await api.post("/api/tasks", { data: { title: `${title} ${tag()}` } });
  expect(r.status()).toBe(201);
  const t = await r.json();
  const u = await api.put(`/api/tasks/${t.id}/work-definition`, {
    data: { version: t.version, hasDirectWork: true, directEstimatedSeconds: 1500, targetBudgetSeconds: null },
  });
  expect(u.status()).toBe(200);
  return (await u.json()) as { id: string; title: string; version: number };
}
async function item(d: string, taskId: string): Promise<DayItem> {
  const r = await api.post(`/api/daily-plans/${d}/items`, { data: { taskId } });
  expect(r.status()).toBe(201);
  return r.json();
}
const items = async (d: string): Promise<DayItem[]> =>
  (await (await api.get(`/api/daily-plans/${d}/items`)).json()).items;
const row = (page: Page, title: string) => page.locator(".r2-plan-row").filter({ hasText: title });
async function openDay(page: Page, d: string, query = "") {
  await page.goto(`/planning?date=${d}${query}`);
  await expect(page.getByLabel("Plan günü", { exact: true })).toHaveValue(d);
  await expect(page.getByRole("status").filter({ hasText: "Gün planı okunuyor" })).toHaveCount(0);
}
async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(result.violations).toEqual([]);
}
test.beforeAll(async () => {
  const c = await request.newContext({ baseURL: "http://127.0.0.1:5182" });
  const r = await registerFixture(c, "/api/auth/register", {
    data: { email: `r3-${randomUUID()}@example.test`, password: randomUUID() },
  });
  expect(r.status()).toBe(201);
  token = (await r.json()).accessToken;
  await c.dispose();
  api = await request.newContext({
    baseURL: "http://127.0.0.1:5182",
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
});
test.afterAll(async () => {
  await api?.dispose();
});
test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  faults.set(page, list);
  trackFaults(page, list);
  await signIn(page, token);
});
test.afterEach(async ({ page }) => {
  expect(faults.get(page)).toEqual([]);
});

test("unplanned running work gets the server-based hyperfocus question without stopping or completing it", async ({
  page,
}, info) => {
  const t = await task("Plansız uzun çalışma");
  const started = await api.post("/api/work-sessions/start", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { taskId: t.id },
  });
  expect(started.status()).toBe(201);
  const work = await started.json();
  const owner = (await (await api.get("/api/auth/me")).json()).id;
  const run = readFileSync(".local/e2e-run.lock", "utf8").trim();
  expect(run).toMatch(/^[a-f0-9]{32}$/);
  expect(process.env.PGDATABASE).toBe(`adhd_ui_test_${run}`);
  expect(owner).toMatch(/^[a-f0-9-]{36}$/);
  expect(work.id).toMatch(/^[a-f0-9-]{36}$/);
  execFileSync(
    process.env.ADHD_UI_TEST_PSQL!,
    ["--no-psqlrc", "--set=ON_ERROR_STOP=1", `--set=owner=${owner}`, `--set=work=${work.id}`],
    {
      input: `UPDATE work_sessions SET "StartedAt"=NOW()-interval '40 minutes' WHERE "UserId"=:'owner'::uuid AND "Id"=:'work'::uuid;
      UPDATE work_session_segments SET "StartedAt"=NOW()-interval '40 minutes' WHERE "UserId"=:'owner'::uuid AND "SessionId"=:'work'::uuid AND "EndedAt" IS NULL;`,
      stdio: "pipe",
      windowsHide: true,
    },
  );
  const read = await (await api.get(`/api/work-sessions/${work.id}`)).json();
  expect(Number(read.activeSeconds)).toBeGreaterThanOrEqual(2400);
  await page.goto("/planning");
  const strip = page.locator(".nudge");
  await expect(strip).toContainText("devam mı, kısa mola mı?");
  const theme = info.project.name === "webkit" ? "dark" : "light";
  await page.evaluate(value => document.documentElement.setAttribute("data-theme", value), theme);
  await assertR3Reflow(page, strip.getByRole("button", { name: "Devam", exact: true }), "hyperfocus", info);
  await auditTask(page, "hyperfocus", "r3-closure", theme);
  expect((await (await api.get(`/api/work-sessions/${work.id}`)).json()).state).toBe("Running");
  expect((await (await api.get(`/api/tasks/${t.id}`)).json()).state).not.toBe("Completed");
  await strip.getByRole("button", { name: "Devam", exact: true }).click();
  await expect(page.getByText("Planladığın süre doldu; devam mı, kısa mola mı?", { exact: true })).toHaveCount(0);
  const signalsRead = page.waitForResponse(
    r =>
      new URL(r.url()).pathname.endsWith("/signals") &&
      new URL(r.url()).searchParams.get("observeFocus") === "true" &&
      r.status() === 200,
  );
  await page.reload();
  const signals = await (await signalsRead).json();
  expect(signals.runningTask.taskId).toBe(t.id);
  expect(signals.focusIncluded).toBe(true);
  expect(signals.focus).toBeNull();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByRole("heading", { name: "Gün Planlama", exact: true })).toBeVisible();
  await expect(page.getByText("Planladığın süre doldu; devam mı, kısa mola mı?", { exact: true })).toHaveCount(0);
  const current = await (await api.get(`/api/work-sessions/${work.id}`)).json();
  expect(
    (await api.post(`/api/work-sessions/${work.id}/finish`, { data: { version: current.version } })).status(),
  ).toBe(200);
});

test("Nerede kalmıştım? resumes the displayed paused session when another paused work owns the player", async ({
  page,
}) => {
  const a = await task("Önce başlayan"),
    b = await task("Sonra başlayan");
  const prefs = await (await api.get("/api/notifications/preferences")).json();
  expect(
    (
      await api.put("/api/notifications/preferences", {
        data: { version: prefs.version, settings: { ...prefs.settings, returnToTask: true, returnAfterSeconds: 1 } },
      })
    ).status(),
  ).toBe(200);
  const startedA = await api.post("/api/work-sessions/start", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { taskId: a.id },
  });
  const wa = await startedA.json();
  const pa = await (await api.post(`/api/work-sessions/${wa.id}/pause`, { data: { version: wa.version } })).json();
  const startedB = await api.post("/api/work-sessions/start", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { taskId: b.id },
  });
  const wb = await startedB.json();
  expect((await api.post(`/api/work-sessions/${wb.id}/pause`, { data: { version: wb.version } })).status()).toBe(200);
  // En son duraklayan A, ama kartın sorgusuna göre en son başlayan B.
  const resumedA = await (
    await api.post(`/api/work-sessions/${wa.id}/resume`, { data: { version: pa.version } })
  ).json();
  expect((await api.post(`/api/work-sessions/${wa.id}/pause`, { data: { version: resumedA.version } })).status()).toBe(
    200,
  );
  await new Promise(resolve => setTimeout(resolve, 1200));
  await page.goto("/planning");
  const card = page.getByRole("region", { name: "Nerede kalmıştım?", exact: true });
  await expect(card).toContainText(b.title);
  const resumed = page.waitForRequest(
    r => r.method() === "POST" && r.url().endsWith(`/api/work-sessions/${wb.id}/resume`),
  );
  await card.getByRole("button", { name: "Devam et", exact: true }).click();
  await resumed;
  await expect.poll(async () => (await (await api.get(`/api/work-sessions/${wb.id}`)).json()).state).toBe("Running");
  expect((await (await api.get(`/api/work-sessions/${wa.id}`)).json()).state).toBe("Paused");
  const current = await (await api.get(`/api/work-sessions/${wb.id}`)).json();
  expect((await api.post(`/api/work-sessions/${wb.id}/finish`, { data: { version: current.version } })).status()).toBe(
    200,
  );
});

test("day bar, first step from the row menu and Tek görev with Sonra bak and Küçültelim mi", async ({ page }, info) => {
  const d = future(60);
  const a = await task("Rapor taslağı");
  const b = await task("Fatura öde");
  await item(d, a.id);
  await item(d, b.id);
  await openDay(page, d);
  await expect(page.getByRole("region", { name: "Günün zamanı" })).toContainText("Planın kalanı");
  // İlk adım satır menüsünde yazılır, NextStep notu olur, etiket olarak görünür.
  await row(page, a.title)
    .getByRole("button", { name: `${a.title} plan öğesi menüsü` })
    .click();
  await page.getByRole("menuitem", { name: "İlk adımı yaz", exact: true }).click();
  await page.getByLabel("İlk adım", { exact: true }).fill("Başlığı yaz");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(row(page, a.title).locator(".r2-chip.step")).toContainText("Başlığı yaz");
  await axe(page);
  await page.screenshot({ path: `${EVIDENCE}/r3-today-${info.project.name}.png`, fullPage: true });
  // Tek görev ilk açık öğeyi adımıyla gösterir. Liste bir tık uzaktadır.
  await page.getByRole("radio", { name: "Tek görev", exact: true }).click();
  await expect(page).toHaveURL(/gorunum=tek/);
  const card = page.locator(".one-thing");
  await expect(card.getByRole("heading", { level: 2 })).toHaveText(a.title);
  await expect(card).toContainText("Başlığı yaz");
  await card.getByRole("button", { name: "Sonra bak", exact: true }).click();
  await expect(card.getByRole("heading", { level: 2 })).toHaveText(b.title);
  // Hepsi sonraya atılınca ilk görev geri gelir. İkinci Sonra bak, küçültmeyi nazikçe önerir.
  await card.getByRole("button", { name: "Sonra bak", exact: true }).click();
  await expect(card.getByRole("heading", { level: 2 })).toHaveText(a.title);
  await expect(card).not.toContainText("Bu iş büyük mü geliyor?");
  await card.getByRole("button", { name: "Sonra bak", exact: true }).click();
  await expect(card.getByRole("heading", { level: 2 })).toHaveText(a.title);
  await expect(card).toContainText("Bu iş büyük mü geliyor?");
  await card.getByRole("button", { name: "Küçültelim mi?", exact: true }).click();
  await card.getByLabel("En küçük adım ne?", { exact: true }).fill("Faturayı bul");
  await card.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(card).toContainText("Faturayı bul");
  await axe(page);
  await page.screenshot({ path: `${EVIDENCE}/r3-one-thing-${info.project.name}.png`, fullPage: true });
  await page.getByRole("radio", { name: "Liste", exact: true }).click();
  await expect(page).not.toHaveURL(/gorunum=/);
  await expect(row(page, a.title).locator(".r2-chip.step")).toContainText("Faturayı bul");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("Ctrl+K palette navigates, Kafamı boşalt adds many tasks in one request and the energy filter is a link", async ({
  page,
}) => {
  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "Görevler", exact: true })).toBeVisible();
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Komut paleti" });
  await expect(palette.getByRole("combobox", { name: "Komut veya görev ara" })).toBeFocused();
  await page.keyboard.type("ozel gun");
  await expect(palette.getByRole("option", { name: "Özel günler" })).toBeVisible();
  await axe(page);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/reminders\/special-days$/);
  await expect(page.getByRole("heading", { name: "Özel günler", exact: true })).toBeVisible();
  // Toplu girişte boş satır ve tekrarlar tek istekten önce ayıklanır.
  await page.getByRole("button", { name: "Görev", exact: true }).click();
  await page.getByRole("button", { name: "Kafamı boşalt", exact: true }).click();
  const dump = page.getByRole("dialog", { name: "Kafamı boşalt" });
  const marker = tag();
  let batches = 0;
  page.on("request", r => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/tasks/batch") batches++;
  });
  await dump
    .getByLabel("Aklındakileri alt alta yaz", { exact: true })
    .fill(`Süt al ${marker}\n\n  Kargo ${marker} \nsüt AL ${marker}\nAra ${marker}`);
  await expect(dump).toContainText("3 görev eklenecek · 1 tekrar satırı atlandı");
  await dump.getByRole("button", { name: "Görevleri ekle", exact: true }).click();
  await expect(dump.getByRole("status")).toHaveText("3 görev eklendi.");
  expect(batches).toBe(1);
  const found = await (await api.get(`/api/tasks?search=${marker}&limit=10`)).json();
  expect(found.total).toBe(3);
  await dump.getByRole("button", { name: /panelini kapat/ }).click();
  await page.goto("/tasks");
  await page.getByLabel("Efora göre süz").selectOption("Low");
  await expect(page).toHaveURL(/energyDemand=Low/);
  await expect(page.getByText("Süzülmüş liste.")).toBeVisible();
});

test("special days: add, show on the calendar and Bugün with an accessible name, delete with Geri al", async ({
  page,
}, info) => {
  const today = new Date(Date.now() + 10800000).toISOString().slice(0, 10);
  const name = `Annem ${tag()}`;
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Takvim menüsü", exact: true }).click();
  await page.getByRole("menuitem", { name: "Özel günler", exact: true }).click();
  await expect(page).toHaveURL(/\/reminders\/special-days$/);
  await page.getByRole("button", { name: "Özel gün ekle", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Özel gün ekle" });
  await form.getByLabel("Ad", { exact: true }).fill(name);
  await form.getByLabel("Gün", { exact: true }).selectOption(String(Number(today.slice(8, 10))));
  await form.getByLabel("Ay", { exact: true }).selectOption(String(Number(today.slice(5, 7))));
  await axe(page);
  await form.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(form).toHaveCount(0);
  const list = page.locator(".special-days");
  await expect(list.locator(".special-item").filter({ hasText: name })).toHaveCount(1);
  await page.screenshot({ path: `${EVIDENCE}/r3-special-days-${info.project.name}.png`, fullPage: true });
  await page.goto("/calendar");
  await expect(page.getByRole("button", { name: new RegExp(`doğum günü: ${name}`) })).toBeVisible();
  await page.goto("/planning");
  await expect(page.getByRole("list", { name: "Bugünün özel günleri" })).toContainText(name);
  await page.goto("/reminders/special-days");
  await list.locator(".special-item").filter({ hasText: name }).getByRole("button").last().click();
  await page.getByRole("menuitem", { name: "Sil", exact: true }).click();
  // Son özel gün silinince boş görünüm, geri alda satır tekrar gelir.
  await expect(page.locator(".special-item").filter({ hasText: name })).toHaveCount(0);
  await page.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect(list).toContainText(name);
});

test("Destekler switch off the day bar; calm view hides numbers; Nerede kalmıştım? resumes the last work", async ({
  page,
}) => {
  const d = future(63);
  const t = await task("Dönüş işi");
  await item(d, t.id);
  await page.goto("/settings?section=supports");
  const supports = page.getByRole("region", { name: "Destekler" });
  await expect(supports.getByRole("checkbox", { name: /Gün çubuğu/ })).toBeChecked();
  await supports.getByRole("checkbox", { name: /Gün çubuğu/ }).uncheck();
  await expect(supports.getByRole("checkbox", { name: /Gün çubuğu/ })).not.toBeChecked();
  await expect(supports.getByRole("checkbox", { name: /Gün çubuğu/ })).toBeEnabled();
  await openDay(page, d);
  await expect(page.getByRole("region", { name: "Günün zamanı" })).toHaveCount(0);
  await page.goto("/settings?section=supports");
  await supports.getByRole("checkbox", { name: /Gün çubuğu/ }).check();
  await expect(supports.getByRole("checkbox", { name: /Gün çubuğu/ })).toBeEnabled();
  await openDay(page, d);
  await expect(page.getByRole("region", { name: "Günün zamanı" })).toContainText("Planın kalanı");
  await planMenu(page, "Sakin görünüm: kapalı, aç");
  await expect(page.getByRole("region", { name: "Günün zamanı" })).not.toContainText("Planın kalanı");
  await planMenu(page, "Sakin görünüm: açık, kapat");
  await expect(page.getByRole("region", { name: "Günün zamanı" })).toContainText("Planın kalanı");
  // Dönüş eşiğinden eski bitmiş oturum tek Devam et önerir. Testte eşik 1sn.
  const prefs = await (await api.get("/api/notifications/preferences")).json();
  expect(
    (
      await api.put("/api/notifications/preferences", {
        data: { version: prefs.version, settings: { ...prefs.settings, returnToTask: true, returnAfterSeconds: 1 } },
      })
    ).status(),
  ).toBe(200);
  const started = await api.post("/api/work-sessions/start", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { taskId: t.id },
  });
  expect(started.status()).toBe(201);
  const work = await started.json();
  const finished = await api.post(`/api/work-sessions/${work.id}/finish`, { data: { version: work.version } });
  expect(finished.status()).toBe(200);
  await new Promise(resolve => setTimeout(resolve, 1500));
  await page.goto("/planning");
  const card = page.getByRole("region", { name: "Nerede kalmıştım?" });
  await expect(card).toContainText(t.title);
  await axe(page);
  await card.getByRole("button", { name: "Devam et", exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect.poll(async () => (await (await api.get("/api/sync")).json()).workSessionId).not.toBeNull();
  const running = (await (await api.get("/api/sync")).json()).workSessionId as string;
  const current = await (await api.get(`/api/work-sessions/${running}`)).json();
  expect(current.taskId).toBe(t.id);
  expect(
    (await api.post(`/api/work-sessions/${running}/finish`, { data: { version: current.version } })).status(),
  ).toBe(200);
});

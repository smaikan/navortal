import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, test, request, type APIRequestContext, type Page } from "@playwright/test";
import { signIn, signOutFromMenu } from "./helpers/session";
import type { Task } from "../../src/features/tasks/model";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";
import { trackFaults } from "./helpers/faults";
import { registerFixture } from "./helpers/fixture-account";
import { menuAction } from "./helpers/menu";
import { outboxDrained } from "./helpers/live-sync";
import { restartWorkspace } from "./helpers/browser-restart";
test.describe.configure({ mode: "default" });
type Work = { id: string; taskId: string; state: string; version: number; activeSeconds: number | string };
let api: APIRequestContext;
let token: string;
let foreignSession: Work;
const faults = new WeakMap<Page, string[]>();
const setupHost = "http://127.0.0.1:5182";
const evidence = EVIDENCE;
const tag = () => randomUUID().slice(0, 8);
async function register() {
  const setup = await request.newContext({ baseURL: setupHost });
  const r = await registerFixture(setup, "/api/auth/register", {
    data: { email: `work-pl-${randomUUID()}@example.test`, password: randomUUID() },
  });
  expect(r.status()).toBe(201);
  const value = (await r.json()).accessToken as string;
  await setup.dispose();
  return value;
}
async function task(title: string, client = api): Promise<Task> {
  const r = await client.post("/api/tasks", { data: { title } });
  expect(r.status()).toBe(201);
  return r.json();
}
async function getTask(id: string): Promise<Task> {
  const r = await api.get(`/api/tasks/${id}`);
  expect(r.status()).toBe(200);
  return r.json();
}
async function start(taskId: string, client = api): Promise<Work> {
  const r = await client.post("/api/work-sessions/start", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { taskId },
  });
  expect(r.status()).toBe(201);
  return r.json();
}
async function work(id: string): Promise<Work> {
  const r = await api.get(`/api/work-sessions/${id}`);
  expect(r.status()).toBe(200);
  return r.json();
}
async function move(id: string, action: "pause" | "resume" | "finish"): Promise<Work> {
  const r = await api.post(`/api/work-sessions/${id}/${action}`, { data: { version: (await work(id)).version } });
  expect(r.status()).toBe(200);
  return r.json();
}
async function open(state: "Running" | "Paused") {
  return (await (await api.get(`/api/work-sessions?State=${state}&Limit=100`)).json()).items as Work[];
}
async function closeAll() {
  for (const item of [...(await open("Running")), ...(await open("Paused"))])
    await api.post(`/api/work-sessions/${item.id}/finish`, { data: { version: (await work(item.id)).version } });
}
test.beforeAll(async () => {
  token = await register();
  api = await request.newContext({ baseURL: setupHost, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
  expect((await api.get(`${process.env.UI_E2E_BASE_URL ?? "http://127.0.0.1:3400"}/api/auth/me`)).status()).toBe(200);
  const other = await request.newContext({
    baseURL: setupHost,
    extraHTTPHeaders: { Authorization: `Bearer ${await register()}` },
  });
  const foreignTask = await task(`Başka hesap ${tag()}`, other);
  foreignSession = await start(foreignTask.id, other);
  await other.dispose();
});
test.afterAll(async () => {
  await api?.dispose();
});
test.beforeEach(async ({ page }) => {
  await closeAll();
  const messages: string[] = [];
  faults.set(page, messages);
  trackFaults(page, messages);
  await signIn(page, token);
});
test.afterEach(async ({ page }) => {
  await closeAll();
  expect(faults.get(page)).toEqual([]);
});
const player = (page: Page) => page.getByRole("region", { name: "Çalışma denetimleri" });
const timer = (page: Page) => player(page).getByRole("timer");
const seconds = (text: string) =>
  text
    .split(":")
    .map(Number)
    .reduce((sum, part) => sum * 60 + part, 0);
async function closePanel(page: Page) {
  const heading = page.getByRole("heading", { name: "Görev ayrıntısı" });
  if (await heading.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(heading).toBeHidden();
  }
}
const nav = (page: Page, name: string) =>
  page.getByRole("navigation", { name: /^(Çalışma alanı|Mobil gezinme)$/ }).getByRole("link", { name, exact: true });
async function panel(page: Page, id: string) {
  await page.goto(`/tasks?taskId=${id}`);
  await expect(page.getByLabel("Görev başlığı", { exact: true })).toBeVisible();
}

test(
  "start, pause, resume and finish are server-confirmed; finish never completes the task; the player survives navigation and reloads",
  { tag: "@smoke" },
  async ({ page }, info) => {
    const item = await task(`Oynatıcı ${tag()}`);
    await panel(page, item.id);
    await page.getByRole("button", { name: "Çalışmayı başlat", exact: true }).click();
    await expect(player(page)).toContainText(item.title);
    await expect(player(page)).toContainText("Çalışılıyor");
    await expect(page.getByRole("status").filter({ hasText: "Çalışma başladı." })).toHaveCount(1);
    await expect(page.getByRole("status").filter({ hasText: "Bu görevde: Çalışılıyor" })).toBeVisible();
    const started = (await open("Running"))[0];
    expect(started.taskId).toBe(item.id);
    expect((await getTask(item.id)).state).toBe("InProgress");
    await closePanel(page);
    await nav(page, "Görevler").click();
    await expect(page.getByRole("heading", { name: "Görevler", level: 1 })).toBeVisible();
    await expect(player(page)).toContainText(item.title);
    await expect(player(page)).toContainText("Çalışılıyor");
    await page.reload();
    await expect(player(page)).toContainText("Çalışılıyor");
    await page.screenshot({ path: `${evidence}/player-running-${info.project.name}.png` });
    await auditTask(page, "player-running", "work");
    await player(page).getByRole("button", { name: "Duraklat", exact: true }).click();
    await expect(player(page)).toContainText("Duraklatıldı");
    await expect(page.getByRole("status").filter({ hasText: "Çalışma duraklatıldı." })).toHaveCount(1);
    const frozen = await timer(page).textContent();
    await page.waitForTimeout(1500);
    await expect(timer(page)).toHaveText(frozen!);
    // current yalnız Running döndürür. Duraklatılmış oturum yenilemeden sonra eşitlemeyle bulunur.
    await page.reload();
    await expect(player(page)).toContainText("Duraklatıldı");
    await expect(timer(page)).toHaveText(frozen!);
    await player(page).getByRole("button", { name: "Devam et", exact: true }).click();
    await expect(player(page)).toContainText("Çalışılıyor");
    await player(page).getByRole("button", { name: "Oturumu bitir", exact: true }).click();
    await expect(player(page)).toHaveCount(0);
    expect((await work(started.id)).state).toBe("Finished");
    expect((await getTask(item.id)).state).not.toBe("Completed");
    await page.screenshot({ path: `${evidence}/player-finished-${info.project.name}.png` });
  },
);

test("60 active / 90 covered minutes are shown from real segments and the session finishes without completing the task", async ({
  page,
}) => {
  const item = await task(`Aralıklı iş ${tag()}`);
  const session = await start(item.id);
  await move(session.id, "pause");
  await move(session.id, "resume");
  await move(session.id, "pause");
  const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const segments = (await (await api.get(`/api/work-sessions/${session.id}/segments?Limit=100`)).json()).items as {
    id: string;
    version: number;
  }[];
  for (const [index, [from, to]] of [
    ["06:00", "06:20"],
    ["06:50", "07:30"],
  ].entries()) {
    const fresh = (await (await api.get(`/api/work-sessions/${session.id}/segments?Limit=100`)).json()).items.find(
      (s: { id: string }) => s.id === segments[index].id,
    );
    const r = await api.post(`/api/work-sessions/${session.id}/segments/${segments[index].id}/corrections`, {
      data: {
        version: (await work(session.id)).version,
        segmentVersion: fresh.version,
        startedAt: `${day}T${from}:00Z`,
        endedAt: `${day}T${to}:00Z`,
        isVoided: false,
        reason: "UI-11 60/90 fixture",
      },
    });
    expect(r.status()).toBe(200);
  }
  expect(Number((await work(session.id)).activeSeconds)).toBe(3600);
  await page.goto("/planning");
  await expect(player(page)).toContainText("Duraklatıldı");
  await expect(timer(page)).toHaveText("1:00:00");
  await menuAction(player(page), "Çalışma menüsü", "Aralıklar");
  const dialog = page.getByRole("dialog", { name: "Çalışma aralıkları" });
  const metric = (term: string) =>
    dialog.getByLabel("Oturum süreleri").getByText(term, { exact: true }).locator("+ dd");
  await expect(metric("Aktif çalışma")).toHaveText("1:00:00");
  await expect(metric("Kapsanan süre")).toContainText("1:30:00");
  await expect(metric("Kapsanan süre")).toContainText("1 saat 30 dakika");
  const rows = dialog.getByRole("list", { name: "Aralıklar" }).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("09:00:00");
  await expect(rows.nth(0)).toContainText("09:20:00");
  await expect(rows.nth(1)).toContainText("10:30:00");
  await auditTask(page, "segments", "work");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await player(page).getByRole("button", { name: "Oturumu bitir", exact: true }).click();
  // Bitince çubuk kapanır; görev açık kalır.
  await expect(player(page)).toHaveCount(0);
  const after = await getTask(item.id);
  expect(after.state).not.toBe("Completed");
  expect(Number((await work(session.id)).activeSeconds)).toBe(3600);
});

test("a skewed wall clock does not change elapsed time; only the timer renders each second; connected polling stops and visibility/offline resync", async ({
  page,
  context,
}) => {
  const item = await task(`Saat ${tag()}`);
  await start(item.id);
  await page.clock.install({ time: new Date(Date.now() + 3 * 3_600_000) });
  const calls: string[] = [];
  page.on("request", r => {
    if (new URL(r.url()).pathname.startsWith("/api/")) calls.push(new URL(r.url()).pathname);
  });
  await page.goto("/planning");
  await expect(player(page)).toContainText("Çalışılıyor");
  await expect(page.locator('[data-sync-state="connected"]')).toBeVisible();
  // Saniye değişimini ilk okumalar ve akışlı metadata çizilince izliyoruz.
  // Oynatıcı hazır olması gün listesi de geldi demek değildir.
  await expect(page).toHaveTitle(/^Gün Planlama/);
  await expect(page.getByRole("region", { name: "Gün planı", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Gün planı okunuyor" })).toHaveCount(0);
  // Yalnız sayaç DOM değişikliğini ölçmeden gerçek outbox teslimini bitiriyoruz.
  // Canlı güncellemeler realtime.spec.ts içinde ayrıca deneniyor.
  await outboxDrained(api, 60_000); // Test kuyruğu sakinleşiyor, sayaç/tarama kontrollerinin mevcut bütçesi korunuyor.
  // Saniyelik çizimi ölçmeden ilk yerleşim otursun. Oynatıcı boşluğu sahte saat karesinde yazılır.
  await page.clock.runFor(1_000);
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.querySelector(".workspace-shell")!).getPropertyValue("--player-space").trim(),
      ),
    )
    .not.toBe("");
  // Yayımlanan olayın HTTP okuması hâlâ sürebilir. Sayaç ayrımından önce onun çizimini tamamlıyoruz.
  await page.waitForLoadState("networkidle");
  await page.clock.runFor(50);
  const first = seconds((await timer(page).textContent())!);
  expect(first).toBeLessThan(60);
  await page.evaluate(() => {
    const record = window as unknown as {
      outsideTimer: number;
      outsideTimerDetails: {
        type: string;
        tag: string | null;
        classes: string | null;
        parentClasses: string | null;
        inputType: string | null;
        attribute: string | null;
        at: number;
      }[];
    };
    record.outsideTimer = 0;
    record.outsideTimerDetails = [];
    // Tarih değişince gerçek setter izini tutuyoruz, React kaydı mı yerel otomatik doldurma mı ayıralım.
    const inputType = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "type")!;
    const setterStacks: { value: string; stack: string }[] = [];
    Object.assign(record, { inputTypeSetterStacks: setterStacks });
    Object.defineProperty(HTMLInputElement.prototype, "type", {
      ...inputType,
      set(value: string) {
        setterStacks.push({ value, stack: new Error("input type setter").stack ?? "" });
        inputType.set!.call(this, value);
      },
    });
    const start = performance.now();
    new MutationObserver(list => {
      for (const m of list) {
        const node = m.target instanceof Element ? m.target : m.target.parentElement;
        // Uygulamada input name yazan kod yok. Mobil Chromium'un aralıklı name
        // değişiklikleri ayrıntıda tutulur ama uygulamanın yeniden çizimi sayılmaz.
        const foreignName = m.type === "attributes" && m.attributeName === "name" && node instanceof HTMLInputElement;
        if (!node?.closest("[data-work-timer]") && foreignName && record.outsideTimerDetails.length < 100)
          record.outsideTimerDetails.push({
            type: "ignored-name-attribute",
            tag: node.tagName,
            classes: null,
            parentClasses: node.parentElement?.getAttribute("class") ?? null,
            inputType: node.type,
            attribute: m.attributeName,
            at: performance.now() - start,
          });
        else if (!node?.closest("[data-work-timer]")) {
          record.outsideTimer++;
          if (record.outsideTimerDetails.length < 100)
            record.outsideTimerDetails.push({
              type: m.type,
              tag: node?.tagName ?? null,
              classes: node?.getAttribute("class") ?? null,
              parentClasses: node?.parentElement?.getAttribute("class") ?? null,
              inputType: node instanceof HTMLInputElement ? node.type : null,
              attribute: m.attributeName,
              at: performance.now() - start,
            });
        }
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  calls.length = 0;
  await page.clock.runFor(10_000);
  writeFileSync(
    `${evidence}/timer-mutations-${test.info().project.name}.json`,
    JSON.stringify(
      await page.evaluate(() => {
        const record = window as unknown as {
          outsideTimer: number;
          outsideTimerDetails: unknown[];
          inputTypeSetterStacks: unknown[];
        };
        return {
          count: record.outsideTimer,
          mutations: record.outsideTimerDetails,
          inputTypeSetterStacks: record.inputTypeSetterStacks,
        };
      }),
      null,
      2,
    ),
  );
  expect(calls).toEqual([]);
  expect(seconds((await timer(page).textContent())!)).toBeGreaterThanOrEqual(first + 9);
  expect(await page.evaluate(() => (window as unknown as { outsideTimer: number }).outsideTimer)).toBe(0);
  await page.clock.runFor(5_500);
  expect(calls.filter(path => path === "/api/workspace/snapshot")).toEqual([]);
  // Gizli sekmede hiç tarama yok.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  calls.length = 0;
  await page.clock.runFor(60_000);
  expect(calls.filter(path => path === "/api/workspace/snapshot")).toEqual([]);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => calls.filter(path => path === "/api/workspace/snapshot").length).toBe(1);
  // Çevrimdışında tarama durur, oynatıcı söyler. Bağlanınca eşitlenir.
  await context.setOffline(true);
  await expect(player(page)).toContainText("Bağlantı yok");
  calls.length = 0;
  await page.clock.runFor(45_000);
  expect(calls.filter(path => path === "/api/workspace/snapshot")).toEqual([]);
  await context.setOffline(false);
  await expect.poll(() => calls.filter(path => path === "/api/workspace/snapshot").length).toBeGreaterThan(0);
  await expect(player(page).getByText("Bağlantı yok")).toHaveCount(0);
});

test("two tabs converge, a stale command is rejected and re-read, one segment stays open, and a foreign session is not reachable", async ({
  page,
  context,
}) => {
  const item = await task(`İki sekme ${tag()}`);
  const other = await task(`Diğer ${tag()}`);
  const session = await start(item.id);
  const second = await context.newPage();
  const secondFaults: string[] = [];
  trackFaults(second, secondFaults);
  for (const target of [page, second]) {
    const ready = target.waitForResponse(
      r => new URL(r.url()).pathname === "/api/workspace/snapshot" && r.request().method() === "GET",
    );
    await target.goto("/planning");
    const current = await ready;
    expect(current.status()).toBe(200);
    expect((await current.json()).activeWork.id).toBe(session.id);
    await current.finished();
  }
  await expect(player(page)).toContainText("Çalışılıyor");
  await expect(player(second)).toContainText("Çalışılıyor");
  await player(page).getByRole("button", { name: "Duraklat", exact: true }).click();
  await expect(player(page)).toContainText("Duraklatıldı");
  await expect(player(second)).toContainText("Duraklatıldı", { timeout: 5000 });
  // Giden komutu dondurup gerçek sunucuyu değiştiriyoruz. Canlı olay ekranı
  // yenileyebilir ama serileşmiş isteğin sürümünü değiştiremez.
  const resumePath = `**/api/work-sessions/${session.id}/resume`;
  await second.route(resumePath, async route => {
    await move(session.id, "resume");
    await move(session.id, "pause");
    await move(session.id, "resume");
    await route.continue();
  });
  const posts: string[] = [];
  second.on("request", r => {
    if (r.method() === "POST" && r.url().includes("/api/work-sessions/")) posts.push(r.url());
  });
  await player(second).getByRole("button", { name: "Devam et", exact: true }).click();
  await expect(player(second).getByRole("alert")).toContainText("başka bir sekmede veya cihazda değişti");
  expect(posts).toHaveLength(1);
  await second.unroute(resumePath);
  await expect(player(second)).toContainText("Çalışılıyor");
  await auditTask(second, "stale-command", "work");
  // Tek açık parça var. Bu çalışırken başka görev başlayamaz.
  await second.goto(`/tasks?taskId=${other.id}`);
  await expect(second.getByRole("button", { name: "Çalışmayı başlat", exact: true })).toBeDisabled();
  const blocked = await api.post("/api/work-sessions/start", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { taskId: other.id },
  });
  expect(blocked.status()).toBe(409);
  expect((await blocked.json()).code).toBe("work_already_running");
  expect(await open("Running")).toHaveLength(1);
  // Başka hesabın oturum kimliği 404 verir, sahibinin verisini göstermez.
  await second.route("**/api/work-sessions/*/pause", route =>
    route.continue({
      url: route
        .request()
        .url()
        .replace(/work-sessions\/[^/]+\/pause/, `work-sessions/${foreignSession.id}/pause`),
    }),
  );
  await closePanel(second);
  await player(second).getByRole("button", { name: "Duraklat", exact: true }).click();
  await expect(player(second).getByRole("alert")).toContainText("bu hesaba ait olmayabilir");
  await second.unroute("**/api/work-sessions/*/pause");
  expect(secondFaults).toEqual([]);
  await second.close();
});

test("start is retried only with the same key; keyless transitions are resolved by reading; offline sends nothing", async ({
  page,
  context,
}) => {
  const item = await task(`Belirsiz başlat ${tag()}`);
  await panel(page, item.id);
  const starts: { key: string | null }[] = [];
  page.on("request", r => {
    if (r.method() === "POST" && r.url().endsWith("/api/work-sessions/start"))
      starts.push({ key: r.headers()["idempotency-key"] ?? null });
  });
  await context.setOffline(true);
  await expect(page.getByRole("button", { name: "Çalışmayı başlat", exact: true })).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByRole("button", { name: "Çalışmayı başlat", exact: true })).toBeEnabled();
  // Sunucu çalışmayı başlatır ama yanıt kaybolur.
  await page.route("**/api/work-sessions/start", async route => {
    await route.fetch();
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Çalışmayı başlat", exact: true }).click();
  // Geri bildirim komutun geldiği panelde. Telefonda oynatıcı modalın arkasında.
  await expect(page.getByRole("alert").filter({ hasText: /[Kk]aydedilmiş olabilir/ })).toBeVisible();
  expect(starts).toHaveLength(1);
  expect(starts[0].key).toBeTruthy();
  await expect(player(page).getByRole("alert")).toHaveCount(0);
  await page.unroute("**/api/work-sessions/start");
  await page.getByRole("button", { name: "Aynı başlatmayı güvenle yeniden dene", exact: true }).click();
  await expect(player(page)).toContainText("Çalışılıyor");
  expect(starts).toHaveLength(2);
  expect(starts[1].key).toBe(starts[0].key);
  expect(await open("Running")).toHaveLength(1);
  await auditTask(page, "start-retried", "work");
  await closePanel(page);
  // Yanıtı kayıp anahtarsız duraklatma tekrar edilmez. Okuma gerçek durumu gösterir.
  const pauses: string[] = [];
  page.on("request", r => {
    if (r.method() === "POST" && r.url().endsWith("/pause")) pauses.push(r.url());
  });
  await page.route("**/api/work-sessions/*/pause", async route => {
    await route.fetch();
    await route.abort("failed");
  });
  await player(page).getByRole("button", { name: "Duraklat", exact: true }).click();
  await expect(player(page).getByRole("alert")).toContainText("otomatik tekrar gönderilmedi");
  await expect(player(page).getByRole("button", { name: "Aynı başlatmayı güvenle yeniden dene" })).toHaveCount(0);
  // Belirsiz yanıtta kullanıcı kontrol edene kadar komut kilitli. Ekran son okunan durumdur;
  // komut öncesi veya canlı olay GET tetiklediyse Paused olabilir. Okuma var, yazı tekrarı yok.
  await expect(player(page).getByRole("button", { name: /^(Duraklat|Devam et)$/ })).toBeDisabled();
  await expect(player(page).getByRole("button", { name: "Oturumu bitir", exact: true })).toBeDisabled();
  await page.unroute("**/api/work-sessions/*/pause");
  await player(page).getByRole("button", { name: "Güncel çalışma durumunu kontrol et", exact: true }).click();
  await expect(player(page)).toContainText("Duraklatıldı");
  expect(pauses).toHaveLength(1);
  // Sunucuya varmadan kaybolursa okumada çalışan iş çıkmaz. Aynı anahtar gerekmiyor.
  await move((await open("Paused"))[0].id, "finish");
  await page.reload();
  await panel(page, item.id);
  await page.route("**/api/work-sessions/start", route => route.abort("failed"));
  await page.getByRole("button", { name: "Çalışmayı başlat", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /[Kk]aydedilmiş olabilir/ })).toBeVisible();
  await page.unroute("**/api/work-sessions/start");
  await page.getByRole("button", { name: "Güncel çalışma durumunu kontrol et", exact: true }).click();
  await expect(page.getByRole("button", { name: "Çalışmayı başlat", exact: true })).toBeEnabled();
  expect(await open("Running")).toHaveLength(0);
});

test("logout keeps work running; completing the task closes it; the mobile player never covers content", async ({
  page,
}, info) => {
  const item = await task(`Kalıcı iş ${tag()}`);
  await panel(page, item.id);
  await page.getByRole("button", { name: "Çalışmayı başlat", exact: true }).click();
  await expect(player(page)).toContainText("Çalışılıyor");
  const widths = info.project.name === "chromium" ? [320, 390, 768, 1199, 1440] : [info.project.use.viewport!.width];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    // Dokunmada hedefler 44px, farede sıkı kontroller en az 32px.
    for (const name of ["Duraklat", "Oturumu bitir", "Çalışma menüsü"]) {
      const box = await player(page).getByRole("button", { name, exact: true }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(info.project.name.startsWith("mobile") ? 44 : 32);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    await page.getByRole("button", { name: /^Notlar/ }).scrollIntoViewIfNeeded();
    const last = await page.getByRole("button", { name: /^Notlar/ }).boundingBox();
    const bar = await player(page).boundingBox();
    // Dar ekranda görev modalı çubuğun üstünde. Genişte panelin son denetimi çubuğun üstünde kalmalı.
    if ((await page.locator("dialog[open]").count()) === 0)
      expect(last!.y + last!.height).toBeLessThanOrEqual(bar!.y + 1);
  }
  await page.screenshot({ path: `${evidence}/player-layout-${info.project.name}.png` });
  await closePanel(page);
  await signOutFromMenu(page);
  await expect(page).toHaveURL(/login/);
  expect((await open("Running")).map(w => w.taskId)).toEqual([item.id]);

  // UI çıkışı yalnız tarayıcı oturumunu bitirdi. Yeni oturumla girince aynı çalışan iş bulunur.
  await signIn(page, token);
  await panel(page, item.id);
  await expect(player(page)).toContainText("Çalışılıyor");
  await page.getByRole("button", { name: "Görevi bitir", exact: true }).click();
  await expect(player(page)).toHaveCount(0);
  expect(await open("Running")).toHaveLength(0);
  expect((await getTask(item.id)).state).toBe("Completed");
});

test("L: browser restart preserves the session cookie and the same running work without sending a command", async ({
  browser,
}, info) => {
  const item = await task(`Tarayıcı dönüşü ${tag()}`);
  await start(item.id);
  await restartWorkspace(
    browser.browserType(),
    token,
    async restored => {
      await expect(player(restored)).toContainText("Çalışılıyor");
      await expect(restored).toHaveURL(/\/planning$/);
    },
    async () => {
      expect((await open("Running")).map(w => w.taskId)).toEqual([item.id]);
    },
    {
      viewport: info.project.use.viewport,
      isMobile: info.project.use.isMobile,
      hasTouch: info.project.use.hasTouch,
      deviceScaleFactor: info.project.use.deviceScaleFactor,
    },
  );
  expect((await getTask(item.id)).state).not.toBe("Completed");
});

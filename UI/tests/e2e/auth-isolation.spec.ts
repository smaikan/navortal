import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { EVIDENCE } from "./helpers/evidence";
import { expect, test } from "@playwright/test";
import { openAccountMenu, signIn } from "./helpers/session";
import { AUTH_CHANNEL } from "../../src/features/auth/browser-sync";

test("two tabs isolate owners, cancel old reads and preserve actual work on logout", async ({
  page,
  context,
  request,
}, info) => {
  if (info.project.name === "mobile-chromium") {
    // Mobil test BroadcastChannel olmadan depolama olayı yedeğini kontrol ediyor.
    await context.addInitScript(() => {
      Object.defineProperty(window, "BroadcastChannel", { value: undefined, configurable: true });
    });
  }
  // Yalnız işaret var mı bilgisi kaydolur. Kimlik, depolama değeri veya yanıt gövdesi kaydetmiyoruz.
  await context.addInitScript(() => {
    const events: { present: boolean; visibility: string }[] = [];
    Object.assign(window, { __authMarkerEvents: events });
    window.addEventListener("storage", event => {
      if (event.key === "adhd.session.v1" && events.length < 32)
        events.push({ present: event.newValue !== null, visibility: document.visibilityState });
    });
  });
  const authTraffic: { page: string; path: string; status: number }[] = [];
  async function owner(label: string) {
    const email = `${label}-${randomUUID()}@example.test`;
    const password = randomUUID();
    const register = await request.post("/api/auth/register", { data: { email, password } });
    expect(register.status()).toBe(201);
    const auth = (await register.json()) as { accessToken: string; user: { email: string } };
    // API kontrolleri ayrı cihaz oturumu kullanır. Tarayıcı kayıt sırasında açılan oturumu alır.
    const login = await request.post("/api/auth/login", { data: { email, password } });
    expect(login.status()).toBe(200);
    const headers = { Authorization: `Bearer ${((await login.json()) as { accessToken: string }).accessToken}` };
    const create = await request.post("/api/tasks", { headers, data: { title: `${label} hesabının özel görevi` } });
    expect(create.status()).toBe(201);
    const task = (await create.json()) as { id: string; title: string };
    return { email: auth.user.email, password, token: auth.accessToken, headers, task };
  }
  const a = await owner("Birinci");
  const b = await owner("Ikinci");
  const start = await request.post("/api/work-sessions/start", {
    headers: { ...a.headers, "Idempotency-Key": randomUUID() },
    data: { taskId: a.task.id },
  });
  expect(start.status()).toBe(201);
  const work = (await start.json()) as { id: string };

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Hesabına giriş yap" })).toBeVisible();
  await signIn(page, a.token);
  await page.goto("/internal-checks/auth");
  await expect(page.getByText(a.task.title, { exact: true })).toBeVisible();
  const other = await context.newPage();
  await other.goto("/internal-checks/auth");
  await expect(other.getByText(a.task.title, { exact: true })).toBeVisible();

  for (const [label, tab] of [
    ["first", page],
    ["other", other],
  ] as const)
    tab.on("response", response => {
      const path = new URL(response.url()).pathname;
      if (["/api/auth/logout", "/api/auth/me"].includes(path) && authTraffic.length < 32)
        authTraffic.push({ page: label, path, status: response.status() });
    });

  let release!: () => void;
  const delayed = new Promise<void>(resolve => {
    release = resolve;
  });
  let entered!: () => void;
  const intercepted = new Promise<void>(resolve => {
    entered = resolve;
  });
  let finish!: () => void;
  const handled = new Promise<void>(resolve => {
    finish = resolve;
  });
  const failures: string[] = [];
  let aborted = 0;
  let held = false;
  other.on("requestfailed", value => {
    if (new URL(value.url()).pathname === "/api/tasks") aborted++;
  });
  await other.route("**/api/tasks?*", async route => {
    // Yenilemeden sonraki ilk görev isteği A hesabının cookie'siyle gider. Yalnız onu bekletiyoruz.
    if (held) {
      await route.continue();
      return;
    }
    held = true;
    const response = await route.fetch();
    entered();
    await delayed;
    try {
      await route.fulfill({ response });
    } catch {
      if (!route.request().failure())
        failures.push("Old response could not be delivered without an observed request cancellation");
    } finally {
      finish();
    }
  });
  try {
    await other.reload();
    await intercepted;
    // This isolated auth fixture renders Account directly, without the workspace or mobile More shell.
    await page.getByRole("button", { name: "Hesap menüsü", exact: true }).click();
    await page.getByRole("menuitem", { name: "Çıkış yap", exact: true }).click();
    await expect(other.getByRole("heading", { name: "Hesabına giriş yap" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hesabına giriş yap" })).toBeVisible();
    await expect.poll(() => aborted).toBeGreaterThan(0);

    await page.getByLabel("E-posta", { exact: true }).fill(b.email);
    await page.getByLabel("Parola", { exact: true }).fill(b.password);
    await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
    for (const tab of [page, other]) {
      await openAccountMenu(tab);
      await expect(tab.getByRole("menuitem", { name: `Giriş yapılan hesap: ${b.email}`, exact: true })).toBeVisible();
      await tab.keyboard.press("Escape");
      const closeMore = tab.getByRole("button", { name: "Daha fazla panelini kapat", exact: true });
      if (await closeMore.isVisible()) await closeMore.click();
    }
    release();
    await handled;
    expect(failures).toEqual([]);

    await other.goto("/internal-checks/auth");
    await expect(other.getByText(b.task.title, { exact: true })).toBeVisible();
    await expect(other.getByText(a.task.title, { exact: true })).toHaveCount(0);
    if (info.project.name === "chromium")
      await page.evaluate(name => {
        const channel = new BroadcastChannel(name);
        channel.postMessage({ version: 1, kind: "changed" });
        channel.close();
      }, AUTH_CHANNEL);
    await expect(other.getByText(b.task.title, { exact: true })).toBeVisible();

    // Çıkış yalnız tarayıcı oturumunu kapatır. A'nın diğer oturumu ve çalışan işi etkilenmez.
    const actual = await request.get(`/api/work-sessions/${work.id}`, { headers: a.headers });
    expect(actual.status()).toBe(200);
    const after = (await actual.json()) as { id: string; state: string; endedAt: string | null };
    expect(after.id).toBe(work.id);
    expect(after.state).toBe("Running");
    expect(after.endedAt).toBeNull();
  } finally {
    const tabs = await Promise.all(
      [page, other].map(tab =>
        tab
          .evaluate(() => ({
            path: location.pathname,
            markerPresent: localStorage.getItem("adhd.session.v1") !== null,
            visibility: document.visibilityState,
            events: (window as unknown as { __authMarkerEvents?: unknown }).__authMarkerEvents,
          }))
          .catch(() => ({ unavailable: true })),
      ),
    );
    writeFileSync(
      `${EVIDENCE}/auth-storage-${info.project.name}-${info.repeatEachIndex}.json`,
      JSON.stringify({ kind: "marker-only-cross-tab-diagnostic", authTraffic, tabs }, null, 2),
    );
    release();
  }
});

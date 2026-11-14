import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { test, expect, request, type APIRequestContext, type Page } from "@playwright/test";
import { signOutFromMenu } from "./helpers/session";
import type { NativeTimerMessage } from "../../src/features/work/native-timer";

const apiOrigin = process.env.UI_NATIVE_TIMER_API_ORIGIN ?? "http://127.0.0.1:5182";
const email = `navortal-native-timer-${randomUUID()}@example.test`;
const password = `Timer-${randomUUID()}`;
let api: APIRequestContext;
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const setup = await request.newContext({ baseURL: apiOrigin });
  const response = await setup.post("/api/auth/register", { data: { email, password } });
  expect(response.status()).toBe(201);
  const account = await response.json();
  mkdirSync(".local", { recursive: true });
  // Temizlik kaydı sır içermez; yalnız bu testin hesapları kimlik ve e-posta birlikte doğrulanarak silinebilir.
  appendFileSync(".local/native-timer-owned-fixtures.jsonl", JSON.stringify({ id: account.user.id, email }) + "\n", {
    mode: 0o600,
  });
  api = await request.newContext({
    baseURL: apiOrigin,
    extraHTTPHeaders: { Authorization: `Bearer ${account.accessToken}` },
  });
  await setup.dispose();
});

test.afterAll(async () => {
  await api?.dispose();
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-posta", { exact: true }).fill(email);
  await page.getByLabel("Parola", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page.locator(".workspace-shell")).toBeVisible({ timeout: 30000 });
}

async function messages(page: Page): Promise<NativeTimerMessage[]> {
  return page.evaluate(() => (window as unknown as { __timerMessages: NativeTimerMessage[] }).__timerMessages);
}

for (const platform of ["android", "iphone"] as const) {
  test(`${platform}: confirmed start, pause, resume, bootstrap, finish and logout reach the native host`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(platform => {
      const state = window as unknown as { __timerMessages: unknown[] };
      state.__timerMessages = [];
      const host = { postMessage: (raw: string) => state.__timerMessages.push(JSON.parse(raw)) };
      if (platform === "android") Object.assign(window, { navortalTimer: host });
      else Object.assign(window, { webkit: { messageHandlers: { navortalTimer: host } } });
    }, platform);
    await login(page);
    const response = await api.post("/api/tasks", { data: { title: `Telefon sayacı ${platform}` } });
    expect(response.status()).toBe(201);
    const task = await response.json();
    await page.goto(`/tasks?taskId=${task.id}`);
    await page.getByRole("button", { name: "Çalışmayı başlat", exact: true }).click();
    const player = page.getByRole("region", { name: "Çalışma denetimleri" });
    await expect(player).toContainText("Çalışılıyor");
    await expect
      .poll(async () =>
        (await messages(page)).some(message => message.work?.state === "Running" && message.requestPermission),
      )
      .toBe(true);
    const started = (await messages(page)).find(message => message.work?.state === "Running")!;
    expect(started.work?.elapsedMs).toBeLessThan(5000);
    expect(started.work?.title).toBe(task.title);
    await page.keyboard.press("Escape");
    await player.getByRole("button", { name: "Duraklat", exact: true }).click();
    await expect.poll(async () => (await messages(page)).at(-1)?.work?.state).toBe("Paused");
    const paused = (await messages(page)).at(-1)!;
    expect(paused.requestPermission).toBe(false);
    await player.getByRole("button", { name: "Devam et", exact: true }).click();
    await expect
      .poll(async () =>
        (await messages(page)).some(
          message =>
            message.work?.state === "Running" &&
            message.work.elapsedMs >= paused.work!.elapsedMs &&
            !message.requestPermission,
        ),
      )
      .toBe(true);
    await page.reload();
    await expect(player).toContainText("Çalışılıyor");
    await expect.poll(async () => (await messages(page)).at(-1)?.work?.state).toBe("Running");
    expect((await messages(page)).every(message => !message.requestPermission)).toBe(true);
    await player.getByRole("button", { name: "Oturumu bitir", exact: true }).click();
    await expect(player).toHaveCount(0);
    await expect.poll(async () => (await messages(page)).at(-1)?.work).toBeNull();
    const finished = await api.get(`/api/work-sessions/${started.work!.id}`);
    expect((await finished.json()).state).toBe("Finished");
    // Yeni çalışma açıkken çıkış sayaç görünümünü kapatır; sunucudaki çalışmayı bitirmez.
    await page.goto(`/tasks?taskId=${task.id}`);
    await page.getByRole("button", { name: "Çalışmayı başlat", exact: true }).click();
    await expect(player).toContainText("Çalışılıyor");
    await page.keyboard.press("Escape");
    await signOutFromMenu(page);
    await expect.poll(async () => (await messages(page)).at(-1)?.work).toBeNull();
    expect((await messages(page)).at(-1)?.ownerId).toBe("");
    const current = await api.get("/api/work-sessions/current");
    const active = (await current.json()).activeSession;
    expect(active.state).toBe("Running");
    expect(
      (await api.post(`/api/work-sessions/${active.id}/finish`, { data: { version: active.version } })).status(),
    ).toBe(200);
    expect(errors).toEqual([]);
  });
}

test("a native bridge failure does not reject a confirmed work command", async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      navortalTimer: {
        postMessage: () => {
          throw new Error("native host failed");
        },
      },
    });
  });
  await login(page);
  const response = await api.post("/api/tasks", { data: { title: "Köprü hata yalıtımı" } });
  const task = await response.json();
  await page.goto(`/tasks?taskId=${task.id}`);
  await page.getByRole("button", { name: "Çalışmayı başlat", exact: true }).click();
  const player = page.getByRole("region", { name: "Çalışma denetimleri" });
  await expect(player).toContainText("Çalışılıyor");
  await page.keyboard.press("Escape");
  await player.getByRole("button", { name: "Oturumu bitir", exact: true }).click();
  await expect(player).toHaveCount(0);
});

test("web and PWA retain the existing work player without a native host", async ({ page }) => {
  await login(page);
  expect(await page.evaluate(() => "navortalTimer" in window)).toBe(false);
  const response = await api.post("/api/tasks", { data: { title: "Web sayacı" } });
  const task = await response.json();
  await page.goto(`/tasks?taskId=${task.id}`);
  await page.getByRole("button", { name: "Çalışmayı başlat", exact: true }).click();
  const player = page.getByRole("region", { name: "Çalışma denetimleri" });
  await expect(player.getByRole("timer")).toBeVisible();
  await page.keyboard.press("Escape");
  await player.getByRole("button", { name: "Oturumu bitir", exact: true }).click();
  await expect(player).toHaveCount(0);
});

import { expect, test, type Page } from "@playwright/test";
import type { Work } from "../../src/features/work/model";
import type { NativeTimerMessage } from "../../src/features/work/native-timer";
import { signOutFromMenu } from "./helpers/session";

// Every API request is intercepted. No account, cookie or real backend is used.
const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const user = { id: owner, email: "webview@example.test", displayName: "WebView Test" };
const at = "2026-11-12T08:00:00Z";
const initialWork: Work = {
  id,
  taskId: null,
  state: "Running",
  source: "Timer",
  startedAt: at,
  endedAt: null,
  timeZoneId: "Europe/Istanbul",
  taskAtStart: null,
  version: "1",
  activeSeconds: "120.5",
  serverNow: at,
  recordedAt: at,
};

async function fixture(page: Page, authenticated = true, native = false) {
  await page.addInitScript(
    ({ authenticated, native }) => {
      if (authenticated) localStorage.setItem("adhd.session.v1", JSON.stringify({ version: 1 }));
      if (native)
        Object.assign(window, {
          timerMessages: [],
          navortalTimer: {
            postMessage: (raw: string) => {
              (window as unknown as { timerMessages: NativeTimerMessage[] }).timerMessages.push(JSON.parse(raw));
            },
          },
        });
    },
    { authenticated, native },
  );
  const state = { authenticated, work: null as Work | null, reads: 0, allReads: 0, missing: false, read: false };
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me")
      return route.fulfill({
        status: state.authenticated ? 200 : 401,
        json: state.authenticated ? user : { code: "unauthorized" },
      });
    if (path === "/api/auth/session/login") {
      state.authenticated = true;
      return route.fulfill({ json: user });
    }
    if (path === "/api/auth/session/logout") {
      state.authenticated = false;
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/auth/google/config")
      return route.fulfill({ json: { enabled: false, clientId: null, nonce: null } });
    if (path === "/api/workspace/snapshot") {
      state.reads++;
      return route.fulfill({
        json: {
          serverNow: at,
          planningVersion: 0,
          versions: { planning: 0, notes: 0, specialDays: 0 },
          activeWork: state.work,
          focusSessionId: null,
          focusIncluded: false,
          activeFocus: null,
          preferences: {
            version: 0,
            timeZoneId: "Europe/Istanbul",
            timeFormat: "24h",
            weekStartsOn: 1,
            supportEnabled: false,
            hasWorkingWindows: false,
            uiSupports: {
              calmView: false,
              dayBar: true,
              calibrationHints: false,
              nudges: false,
              resumeCard: false,
              openTodayAsOneThing: false,
            },
          },
        },
      });
    }
    if (path.startsWith(`/api/work-sessions/${id}/`) && state.work) {
      const action = path.split("/").at(-1);
      const next = {
        ...state.work,
        version: String(BigInt(state.work.version) + 1n),
        state: action === "pause" ? "Paused" : action === "finish" ? "Finished" : "Running",
      } as Work;
      state.work = action === "finish" ? null : next;
      return route.fulfill({ json: next });
    }
    if (path === "/api/notifications/summary") return route.fulfill({ json: { unreadCount: 0, asOf: at } });
    if (path === "/api/notifications/read-all") {
      state.allReads++;
      return route.fulfill({ status: 500, json: { code: "unexpected_read_all" } });
    }
    if (path === `/api/notifications/${id}`)
      return route.fulfill({
        status: state.missing ? 404 : 200,
        json: state.missing
          ? { code: "not_found" }
          : {
              id,
              kind: "Custom",
              sourceId: id,
              taskId: null,
              dailyPlanId: null,
              revisionId: null,
              occurredAt: at,
              readyAt: at,
              notBefore: at,
              readAt: state.read ? at : null,
              state: "Ready",
              snoozeCount: 0,
              soundEnabled: false,
              version: "1",
              title: "Seçilen hatırlatma",
            },
      });
    if (path === `/api/notifications/${id}/delivery-status`)
      return route.fulfill({
        json: {
          snoozeCount: 0,
          preparedAt: at,
          providerAcceptedAt: null,
          clientDisplayedAt: null,
          clientOpenedAt: null,
          readAt: null,
        },
      });
    return route.fulfill({
      status: 503,
      json: { code: "fixture_unavailable", title: "Bu okuma bu testin kapsamı dışında." },
    });
  });
  return state;
}

const messages = (page: Page) =>
  page.evaluate(() => (window as unknown as { timerMessages: NativeTimerMessage[] }).timerMessages);

for (const path of ["/login", "/register"])
  test(`WebView ${path} hides Google sign-in and explains the reason without loading GIS`, async ({ page }) => {
    await fixture(page, false, true);
    const googleRequests: string[] = [];
    page.on("request", request => {
      if (request.url().includes("accounts.google.com") || request.url().includes("/api/auth/google/"))
        googleRequests.push("google-request");
    });
    await page.goto(path);
    await expect(
      page.getByRole("status").filter({ hasText: "Google ile giriş uygulamanın ilk ekranından yapılır." }),
    ).toBeVisible();
    await expect(page.locator(".google-auth-button")).toBeHidden();
    await expect(page.getByLabel("E-posta", { exact: true })).toBeEnabled();
    expect(googleRequests).toEqual([]);
  });

test("native timer bootstraps, refreshes unchanged state on resume, transitions and clears on logout", async ({
  page,
}) => {
  const state = await fixture(page, true, true);
  state.work = initialWork;
  const faults: string[] = [];
  page.on("pageerror", error => faults.push(error.message));
  await page.goto(`/notifications/${id}`);
  const dialog = page.getByRole("dialog", { name: "Bildirim ayrıntısı" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await messages(page)).at(-1)?.work?.state).toBe("Running");
  expect((await messages(page)).at(-1)?.requestPermission).toBe(false);
  const before = (await messages(page)).length;
  const reads = state.reads;
  await page.evaluate(() => window.dispatchEvent(new Event("navortal:resume")));
  await expect.poll(() => state.reads).toBeGreaterThan(reads);
  await expect.poll(async () => (await messages(page)).length).toBeGreaterThan(before);
  expect(Math.abs(Date.now() - (await messages(page)).at(-1)!.capturedAtMs)).toBeLessThan(10_000);
  const player = page.getByRole("region", { name: "Çalışma denetimleri" });
  await player.getByRole("button", { name: "Duraklat", exact: true }).click();
  await expect.poll(async () => (await messages(page)).at(-1)?.work?.state).toBe("Paused");
  await player.getByRole("button", { name: "Devam et", exact: true }).click();
  await expect.poll(async () => (await messages(page)).at(-1)?.work?.state).toBe("Running");
  expect((await messages(page)).at(-1)?.requestPermission).toBe(false);
  await player.getByRole("button", { name: "Oturumu bitir", exact: true }).click();
  await expect.poll(async () => (await messages(page)).at(-1)?.work).toBeNull();
  await signOutFromMenu(page);
  await expect.poll(async () => (await messages(page)).at(-1)?.ownerId).toBe("");
  expect(faults).toEqual([]);
});

for (const read of [false, true])
  test(`notification route opens exactly one ${read ? "read" : "unread"} notification`, async ({ page }) => {
    const state = await fixture(page);
    state.read = read;
    await page.goto(`/notifications/${id}`);
    const dialog = page.getByRole("dialog", { name: "Bildirim ayrıntısı" });
    await expect(dialog.getByRole("heading", { name: "Seçilen hatırlatma" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Okundu işaretle" })).toBeEnabled({ enabled: !read });
    expect(state.allReads).toBe(0);
  });

test("notification route returns to the same notification after password login", async ({ page }) => {
  const state = await fixture(page, false);
  await page.goto(`/notifications/${id}`);
  await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(`/notifications/${id}`)}$`));
  await page.getByLabel("E-posta", { exact: true }).fill(user.email);
  await page.getByLabel("Parola", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/notifications/${id}$`));
  await expect(page.getByRole("heading", { name: "Seçilen hatırlatma" })).toBeVisible();
  expect(state.allReads).toBe(0);
});

test("invalid notification UUID is rejected locally, missing/deleted/foreign UUID shows a safe error", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/notifications/invalid");
  await expect(page.getByRole("alert").filter({ hasText: "Bildirim bağlantısı geçersiz." })).toBeVisible();
  state.missing = true;
  await page.goto(`/notifications/${id}`);
  await expect(
    page.getByRole("alert").filter({ hasText: "Bildirim bulunamadı veya bu hesaba ait değil." }),
  ).toBeVisible();
  expect(state.allReads).toBe(0);
});

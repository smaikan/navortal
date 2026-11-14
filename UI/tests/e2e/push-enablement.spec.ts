import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";

const apiOrigin = process.env.UI_PUSH_API_ORIGIN ?? "http://127.0.0.1:5182";
const email = `push-enablement-${randomUUID()}@example.test`,
  password = `Push-${randomUUID()}`;
let api: APIRequestContext, publicKey: string, owner: string;
const point = createECDH("prime256v1").generateKeys().toString("base64url");
const authKey = randomBytes(16).toString("base64url");
const labelId = randomUUID();

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  const anonymous = await request.newContext({ baseURL: apiOrigin });
  const response = await anonymous.post("/api/auth/register", { data: { email, password } });
  expect(response.status()).toBe(201);
  const account = await response.json();
  owner = account.user.id;
  api = await request.newContext({
    baseURL: apiOrigin,
    extraHTTPHeaders: { Authorization: `Bearer ${account.accessToken}` },
  });
  await anonymous.dispose();
  publicKey =
    (await (await api.get("/api/notifications/push-config")).json()).publicKey ??
    createECDH("prime256v1").generateKeys().toString("base64url");
});
test.afterAll(async () => {
  await api?.dispose();
});
test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["notifications"]);
  const preferences = await (await api.get("/api/notifications/preferences")).json();
  expect(
    (
      await api.put("/api/notifications/preferences", {
        data: {
          version: preferences.version,
          settings: {
            ...preferences.settings,
            enabled: true,
            pushEnabled: false,
            soundEnabled: false,
            quietStart: null,
            quietEnd: null,
          },
        },
      })
    ).status(),
  ).toBe(200);
  for (const subscription of await (await api.get("/api/notifications/subscriptions")).json())
    if (subscription.active)
      expect(
        (
          await api.post(`/api/notifications/subscriptions/${subscription.id}/remove`, {
            data: { version: subscription.version },
          })
        ).status(),
      ).toBe(204);
  await page.route("**/api/notifications/push-config", route => route.fulfill({ json: { enabled: true, publicKey } }));
  await page.goto("/login");
  await page.getByLabel("E-posta", { exact: true }).fill(email);
  await page.getByLabel("Parola", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page.locator(".workspace-shell")).toBeVisible();
});

async function mockProvider(
  page: Page,
  options: { existing?: string; failure?: string; denied?: boolean; hold?: boolean } = {},
) {
  await page.addInitScript(
    ({ options, point, authKey, labelId }) => {
      const state = { subscribe: 0, unsubscribe: 0, permissionCalls: 0, activeAtPermission: false, release: () => {} };
      Object.assign(window, { __pushTest: state });
      localStorage.setItem("adhd.push-device.v1", labelId);
      if (options.denied) Object.defineProperty(Notification, "permission", { get: () => "default" });
      Notification.requestPermission = async () => {
        state.permissionCalls++;
        state.activeAtPermission = navigator.userActivation.isActive;
        if (options.hold)
          await new Promise<void>(resolve => {
            state.release = resolve;
          });
        return options.denied ? "denied" : "granted";
      };
      let current: PushSubscription | null = options.existing ? subscription(options.existing) : null;
      function subscription(key: string): PushSubscription {
        const bytes = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
        return {
          expirationTime: null,
          options: { applicationServerKey: bytes.buffer, userVisibleOnly: true },
          endpoint: `https://push.example.test/${labelId}`,
          getKey: () => null,
          toJSON: () => ({
            endpoint: `https://push.example.test/${labelId}`,
            expirationTime: null,
            keys: { p256dh: point, auth: authKey },
          }),
          unsubscribe: async () => {
            state.unsubscribe++;
            current = null;
            return true;
          },
        };
      }
      PushManager.prototype.getSubscription = async () => current;
      PushManager.prototype.subscribe = async values => {
        state.subscribe++;
        if (options.failure) throw new DOMException("provider detail", options.failure);
        const bytes = new Uint8Array(values!.applicationServerKey as ArrayBuffer);
        current = subscription(
          btoa(String.fromCharCode(...bytes))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, ""),
        );
        return current;
      };
    },
    { options, point, authKey, labelId },
  );
}
const openDevice = async (page: Page) => {
  await page.goto("/reminders/preferences");
  await expect(
    page.getByRole("button", { name: /^(Bu cihazda bildirimleri aç|Bağlantıyı yenile)$/, exact: true }),
  ).toBeEnabled({
    timeout: 20000,
  });
};
const enable = (page: Page) =>
  page.getByRole("button", { name: /^(Bu cihazda bildirimleri aç|Bağlantıyı yenile)$/, exact: true });
const saved = (page: Page) => page.getByText("Bu cihazda bildirimler açık.", { exact: true });
async function seedDevice() {
  const response = await api.post("/api/notifications/subscriptions", {
    data: {
      endpoint: `https://push.example.test/${labelId}`,
      p256dh: point,
      auth: authKey,
      label: `Tarayıcı:${labelId}`,
    },
  });
  expect(response.status()).toBe(200);
  const p = await (await api.get("/api/notifications/preferences")).json();
  expect(
    (
      await api.put("/api/notifications/preferences", {
        data: { version: p.version, settings: { ...p.settings, pushEnabled: true } },
      })
    ).status(),
  ).toBe(200);
}
const counters = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __pushTest: { subscribe: number; unsubscribe: number; permissionCalls: number; activeAtPermission: boolean };
        }
      ).__pushTest,
  );

test("bell opens, existing inbox is readable and Escape returns focus", async ({ page }) => {
  const response = await api.post("/api/notifications/reminders", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { title: "Bildirim açılma kontrolü", dueAt: new Date(Date.now() + 1500).toISOString() },
  });
  expect(response.status()).toBe(201);
  await expect
    .poll(async () => (await (await api.get("/api/notifications?limit=100")).json()).items.length, { timeout: 15000 })
    .toBeGreaterThan(0);
  const bell = page.getByRole("button", { name: /^Bildirimler/ });
  await bell.click();
  const panel = page.getByRole("dialog", { name: "Bildirimler", exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Bildirim açılma kontrolü bildirimini aç" })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Bildirimler", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(bell).toBeFocused();
});

test("disabled server configuration is visible and does not ask for permission", async ({ page }) => {
  await mockProvider(page);
  await page.route("**/api/notifications/push-config", route =>
    route.fulfill({ json: { enabled: false, publicKey: null } }),
  );
  await page.goto("/reminders/preferences");
  await expect(enable(page)).toBeDisabled();
  await expect(page.getByText("Cihaz bildirimleri şu an kullanılamıyor.", { exact: false })).toBeVisible();
  expect((await counters(page)).permissionCalls).toBe(0);
});

test("explicit click registers the real API subscription and survives a double click without duplicate setup", async ({
  page,
}) => {
  await mockProvider(page);
  await openDevice(page);
  await enable(page).dblclick();
  await expect(saved(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Bu cihazda bildirimleri kapat", exact: true })).toBeEnabled();
  expect(await counters(page)).toMatchObject({ subscribe: 1, permissionCalls: 1, activeAtPermission: true });
  const subscriptions = await (await api.get("/api/notifications/subscriptions")).json();
  expect(subscriptions.filter((s: { active: boolean }) => s.active)).toHaveLength(1);
  expect((await (await api.get("/api/notifications/preferences")).json()).settings.pushEnabled).toBe(true);
});

test("a missing browser subscription never appears enabled just because its device row exists", async ({ page }) => {
  await seedDevice();
  await mockProvider(page);
  await openDevice(page);
  await expect(page.locator(".device-state")).toHaveText("Kapalı");
  await enable(page).click();
  await expect(saved(page)).toBeVisible();
  expect((await counters(page)).subscribe).toBe(1);
});

test("a subscription with an old VAPID key is replaced and can be disabled locally", async ({ page }) => {
  await seedDevice();
  await mockProvider(page, { existing: createECDH("prime256v1").generateKeys().toString("base64url") });
  await openDevice(page);
  await enable(page).click();
  await expect(saved(page)).toBeVisible();
  expect(await counters(page)).toMatchObject({ subscribe: 1, unsubscribe: 1 });
  await page.getByRole("button", { name: "Bu cihazda bildirimleri kapat", exact: true }).click();
  await expect(enable(page)).toBeEnabled();
  expect((await counters(page)).unsubscribe).toBe(2);
  expect(
    (await (await api.get("/api/notifications/subscriptions")).json()).some((s: { active: boolean }) => s.active),
  ).toBe(false);
});

test("permission dismissal does not register a subscription or change preferences", async ({ page }) => {
  await mockProvider(page, { denied: true });
  await openDevice(page);
  await enable(page).click();
  await expect(
    page.getByText("İzin verilmedi. Bildirimler gelen kutusunda kullanılabilir.", { exact: true }),
  ).toBeVisible();
  expect((await counters(page)).subscribe).toBe(0);
  expect((await (await api.get("/api/notifications/preferences")).json()).settings.pushEnabled).toBe(false);
});

test("provider connection errors leave a usable retry action and clear explanation", async ({ page }) => {
  await mockProvider(page, { failure: "AbortError" });
  await openDevice(page);
  await enable(page).click();
  await expect(page.locator(".device-notifications [role=alert]")).toContainText("bildirim hizmetine bağlanılamadı");
  await expect(enable(page)).toBeEnabled();
  expect((await (await api.get("/api/notifications/preferences")).json()).settings.pushEnabled).toBe(false);
});

test("general notification opt-out remains intact and is explained", async ({ page }) => {
  const p = await (await api.get("/api/notifications/preferences")).json();
  expect(
    (
      await api.put("/api/notifications/preferences", {
        data: { version: p.version, settings: { ...p.settings, enabled: false } },
      })
    ).status(),
  ).toBe(200);
  await mockProvider(page);
  await openDevice(page);
  await enable(page).click();
  await expect(saved(page)).toBeVisible();
  await expect(page.getByText("Genel bildirim tercihin kapalı.", { exact: false })).toBeVisible();
  expect((await (await api.get("/api/notifications/preferences")).json()).settings.enabled).toBe(false);
});

test("native worker displays one copy, separates snoozes and rejects another recipient", async ({ page }) => {
  await mockProvider(page);
  await openDevice(page);
  await enable(page).click();
  await expect(saved(page)).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  let registrationId = "";
  cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
    for (const r of registrations) if (r.scopeURL === new URL("/", page.url()).href) registrationId = r.registrationId;
  });
  await cdp.send("ServiceWorker.enable");
  await expect.poll(() => registrationId).not.toBe("");
  const id = randomUUID();
  const payload = {
    notificationId: id,
    recipientUserId: owner,
    snoozeCount: 0,
    tag: `notification:${id}`,
    title: "Masaüstü teslim kontrolü",
    body: "Hatırlatma",
    url: `/notifications/${id}`,
    silent: true,
  };
  const deliver = async (data: typeof payload) =>
    cdp.send("ServiceWorker.deliverPushMessage", {
      origin: new URL(page.url()).origin,
      registrationId,
      data: JSON.stringify(data),
    });
  const notices = () =>
    page.evaluate(async () =>
      (await (await navigator.serviceWorker.ready).getNotifications()).map(n => ({
        title: n.title,
        count: n.data.snoozeCount,
      })),
    );
  await deliver(payload);
  await expect.poll(notices).toEqual([{ title: payload.title, count: 0 }]);
  await deliver(payload);
  await expect.poll(notices).toHaveLength(1);
  await deliver({ ...payload, snoozeCount: 1 });
  await expect.poll(notices).toEqual([{ title: payload.title, count: 1 }]);
  await deliver({ ...payload, notificationId: randomUUID(), recipientUserId: randomUUID() });
  await expect.poll(notices).toHaveLength(1);
  await cdp.detach();
});

test("a valid local subscription is reused when enabling the channel again", async ({ page }) => {
  await seedDevice();
  const p = await (await api.get("/api/notifications/preferences")).json();
  expect(
    (
      await api.put("/api/notifications/preferences", {
        data: { version: p.version, settings: { ...p.settings, pushEnabled: false } },
      })
    ).status(),
  ).toBe(200);
  await mockProvider(page, { existing: publicKey });
  await openDevice(page);
  await enable(page).click();
  await expect(saved(page)).toBeVisible();
  expect(await counters(page)).toMatchObject({ subscribe: 0, unsubscribe: 0 });
});

test("blocked device storage has a clear recovery message and performs no subscription write", async ({ page }) => {
  await mockProvider(page);
  await page.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (key === "adhd.push-device.v1") throw new DOMException("private detail", "SecurityError");
      return original.call(this, key);
    };
  });
  await openDevice(page);
  await enable(page).click();
  await expect(page.locator(".device-notifications [role=alert]")).toContainText("cihaz bilgisi saklanamıyor");
  expect((await counters(page)).subscribe).toBe(0);
  expect((await (await api.get("/api/notifications/preferences")).json()).settings.pushEnabled).toBe(false);
});

test("switching accounts during the permission prompt cannot enable notifications for the new account", async ({
  page,
}) => {
  await mockProvider(page, { hold: true });
  await openDevice(page);
  let writes = 0;
  page.on("request", r => {
    if (["POST", "PUT"].includes(r.method()) && r.url().includes("/api/notifications/")) writes++;
  });
  await enable(page).click();
  await expect.poll(async () => (await counters(page)).permissionCalls).toBe(1);
  const otherEmail = `push-switch-${randomUUID()}@example.test`;
  const anonymous = await request.newContext({ baseURL: apiOrigin });
  const response = await anonymous.post("/api/auth/register", { data: { email: otherEmail, password } });
  expect(response.status()).toBe(201);
  const other = await response.json();
  await page.context().addCookies([
    {
      name: "adhd_session",
      value: other.accessToken,
      url: new URL(page.url()).origin,
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  await page.evaluate(() => {
    const channel = new BroadcastChannel("adhd.auth.changes.v1");
    channel.postMessage({ version: 1, kind: "changed" });
    channel.close();
  });
  await page.getByRole("button", { name: "Hesap menüsü", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: `Giriş yapılan hesap: ${otherEmail}`, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as unknown as { __pushTest: { release: () => void } }).__pushTest.release());
  await expect(enable(page)).toBeEnabled();
  expect((await counters(page)).subscribe).toBe(0);
  expect(writes).toBe(0);
  await anonymous.dispose();
});

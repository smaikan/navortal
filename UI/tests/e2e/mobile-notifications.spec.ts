import { createECDH, randomUUID } from "node:crypto";
import { test, expect, request, type APIRequestContext, type Page } from "@playwright/test";
const apiOrigin = process.env.UI_PUSH_API_ORIGIN ?? "http://127.0.0.1:5183";
const email = `mobile-notification-${randomUUID()}@example.test`,
  password = `Mobile-${randomUUID()}`;
let api: APIRequestContext, owner: string;
const publicKey = createECDH("prime256v1").generateKeys().toString("base64url");
test.describe.configure({ mode: "serial" });
test.use({ isMobile: true, hasTouch: true });
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
});
test.afterAll(async () => {
  await api?.dispose();
});
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/notifications/push-config", route => route.fulfill({ json: { enabled: true, publicKey } }));
  await page.goto("/login");
  await page.getByLabel("E-posta", { exact: true }).fill(email);
  await page.getByLabel("Parola", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page.locator(".workspace-shell")).toBeVisible({ timeout: 20000 });
});
const bell = (page: Page) => page.getByRole("button", { name: /^Bildirimler(?:,|$)/ });
const panel = (page: Page) => page.getByRole("dialog", { name: "Bildirimler", exact: true });
async function open(page: Page) {
  await bell(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(page).toHaveURL(/inbox=open/);
}
async function apple(page: Page, installed = false) {
  await page.addInitScript(
    ({ installed }) => {
      Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
      Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 });
      Object.defineProperty(navigator, "standalone", { get: () => installed });
      Object.defineProperty(Notification, "permission", { get: () => "default" });
      Object.assign(window, { __permissionCalls: 0 });
      Notification.requestPermission = async () => {
        (window as unknown as { __permissionCalls: number }).__permissionCalls++;
        return "default";
      };
    },
    { installed },
  );
}
test("outside touch closes once, protects the underlying action, restores focus and next tap works", async ({
  page,
}) => {
  await page.goto("/reminders");
  await open(page);
  const tasks = page
    .getByRole("navigation", { name: "Mobil gezinme" })
    .getByRole("link", { name: "Görevler", exact: true });
  await tasks.tap();
  await expect(panel(page)).toBeHidden();
  await expect(page).toHaveURL("/reminders");
  await expect(bell(page)).toBeFocused();
  await tasks.tap();
  await expect(page).toHaveURL("/tasks");
});
test("back closes only the panel and preserves filters/hash; forward reopens; close returns focus", async ({
  page,
}) => {
  await page.goto("/reminders?filter=kept#test");
  await open(page);
  await page.goBack();
  await expect(panel(page)).toBeHidden();
  await expect(page).toHaveURL("/reminders?filter=kept#test");
  await expect(bell(page)).toBeFocused();
  await page.goForward();
  await expect(panel(page)).toBeVisible();
  await expect(page).toHaveURL(/filter=kept&inbox=open#test/);
  await panel(page).getByRole("button", { name: "Kapat", exact: true }).click();
  await expect(panel(page)).toBeHidden();
  await expect(page).toHaveURL("/reminders?filter=kept#test");
  await expect(bell(page)).toBeFocused();
});
test("rotating a touch device preserves the open inbox and Back still closes it", async ({ page }) => {
  await page.goto("/reminders");
  await open(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(panel(page)).toBeVisible();
  const bounds = await panel(page).boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(844);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(390);
  await page.goBack();
  await expect(panel(page)).toBeHidden();
  await expect(page).toHaveURL("/reminders");
});
test("panel links navigate correctly and browser back restores the inbox entry", async ({ page }) => {
  await page.goto("/reminders");
  await open(page);
  await panel(page).getByRole("link", { name: "Bildirim tercihleri", exact: true }).click();
  await expect(page).toHaveURL("/reminders/preferences");
  await expect(panel(page)).toBeHidden();
  await page.goBack();
  await expect(page).toHaveURL(/\/reminders\?inbox=open$/);
  await expect(panel(page)).toBeVisible();
});
test("a direct inbox URL closes without leaving the current page", async ({ page }) => {
  await page.goto("/reminders?inbox=open&filter=kept");
  await expect(panel(page)).toBeVisible();
  await panel(page).getByRole("button", { name: "Kapat", exact: true }).click();
  await expect(panel(page)).toBeHidden();
  await expect(page).toHaveURL("/reminders?filter=kept");
});
test("iPad desktop mode offers installation inside the existing card without requesting permission", async ({
  page,
}) => {
  await apple(page);
  await page.goto("/reminders/preferences");
  await expect(page.getByRole("button", { name: "Ana ekrana ekleyerek kullan", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ana ekrana ekleyerek kullan", exact: true }).click();
  await expect(page.getByText("“Ana Ekrana Ekle”yi seç.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Bu cihazda bildirimleri aç|Bağlantıyı yenile)$/ })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __permissionCalls: number }).__permissionCalls)).toBe(0);
});
test("installed Apple app offers explicit enable and special-day/lead preferences are visible", async ({ page }) => {
  await apple(page, true);
  await page.goto("/reminders/preferences");
  await expect(page.getByRole("button", { name: "Bu cihazda bildirimleri aç", exact: true })).toBeEnabled({
    timeout: 20000,
  });
  await expect(page.getByRole("button", { name: "Ana ekrana ekleyerek kullan", exact: true })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Özel günler", exact: true })).toBeVisible();
  await expect(
    page.getByText("Önceden haber verme süresi plan başlangıcı, plan bitişi ve son teslim bildirimlerine uygulanır.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __permissionCalls: number }).__permissionCalls)).toBe(0);
});
test("unread summary includes unread items older than the recent page, and acknowledgement cannot be overwritten by stale GET", async ({
  page,
}) => {
  await api.post("/api/notifications/read-all");
  const at = new Date(Date.now() + 1800).toISOString();
  for (let i = 0; i < 14; i++)
    expect(
      (
        await api.post("/api/notifications/reminders", {
          headers: { "Idempotency-Key": randomUUID() },
          data: { title: `Sayac ${i}`, dueAt: at },
        })
      ).status(),
    ).toBe(201);
  await expect
    .poll(async () => (await (await api.get("/api/notifications/summary")).json()).unreadCount, { timeout: 20000 })
    .toBe(14);
  const rows = (await (await api.get("/api/notifications?limit=100")).json()).items;
  for (const n of rows.slice(0, 13))
    expect((await api.post(`/api/notifications/${n.id}/read`, { data: { version: n.version } })).status()).toBe(200);
  expect(
    (await (await api.get("/api/notifications?limit=10")).json()).items.every(
      (n: { readAt: string | null }) => n.readAt,
    ),
  ).toBe(true);
  let held = false,
    release: () => void = () => {};
  const wait = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route("**/api/notifications/summary", async route => {
    if (!held) {
      held = true;
      await wait;
      await route.fulfill({ json: { unreadCount: 8, asOf: new Date().toISOString() } }).catch(() => {});
    } else await route.continue();
  });
  await page.goto("/reminders");
  await expect.poll(() => held, { timeout: 15000 }).toBe(true);
  await open(page);
  await expect.poll(async () => (await (await api.get("/api/notifications/summary")).json()).unreadCount).toBe(0);
  release();
  await expect(bell(page)).toHaveAccessibleName("Bildirimler");
  await expect(page.locator(".bell-count")).toHaveCount(0);
  await panel(page).getByRole("button", { name: "Kapat", exact: true }).click();
  await page.unroute("**/api/notifications/summary");
  await page.reload();
  await expect(bell(page)).toHaveAccessibleName("Bildirimler");
});
test("delivery detail keeps provider and client evidence separate and refresh does not change the source", async ({
  page,
}) => {
  const rows = (await (await api.get("/api/notifications?limit=100")).json()).items;
  const n = rows.find((x: { kind: string }) => x.kind === "Custom");
  expect(n).toBeTruthy();
  const source = (await (await api.get("/api/notifications/reminders?limit=100")).json()).find(
    (x: { id: string }) => x.id === n.sourceId,
  );
  await page.goto(`/notifications?notificationId=${n.id}`);
  const dialog = page.getByRole("dialog", { name: "Bildirim ayrıntısı", exact: true });
  await expect(dialog).toBeVisible();
  const details = dialog.locator("details.notification-delivery");
  await details.locator("summary").click();
  await expect(details.getByText("Bildirim hizmeti kabul etti", { exact: true })).toBeVisible();
  await expect(details.getByText("Tarayıcı gösterim bildirdi", { exact: true })).toBeVisible();
  const request = page.waitForResponse(
    response => response.url().endsWith(`/api/notifications/${n.id}/delivery-status`) && response.status() === 200,
  );
  await details.getByRole("button", { name: "Teslim bilgisini yenile", exact: true }).click();
  const status = await (await request).json();
  expect(status.providerAcceptedAt).toBeNull();
  expect(status.clientDisplayedAt).toBeNull();
  expect(status.clientOpenedAt).toBeNull();
  const after = (await (await api.get("/api/notifications/reminders?limit=100")).json()).find(
    (x: { id: string }) => x.id === n.sourceId,
  );
  expect(after).toEqual(source);
});
test("reminder setup offer appears only after successful creation, dismisses for session and never opens permission automatically", async ({
  page,
}) => {
  await apple(page);
  await page.route("**/api/notifications/push-config", route =>
    route.fulfill({ json: { enabled: true, publicKey: "B" + "A".repeat(86) } }),
  );
  await page.goto("/reminders");
  await expect(page.getByRole("complementary", { name: "Hatırlatmayı cihazında gör" })).toHaveCount(0);
  async function create(title: string) {
    await page.getByRole("button", { name: "Hatırlatma ekle", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Hatırlatma ekle", exact: true });
    await dialog.getByLabel("Hatırlatma başlığı", { exact: true }).fill(title);
    await dialog.getByRole("button", { name: "15 dk sonra", exact: true }).click();
    await dialog.getByRole("button", { name: "Hatırlatmayı kaydet", exact: true }).click();
    await expect(dialog).toBeHidden();
  }
  await create("Mobil teklif testi");
  const nudge = page.getByRole("complementary", { name: "Hatırlatmayı cihazında gör" });
  await expect(nudge).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __permissionCalls: number }).__permissionCalls)).toBe(0);
  await nudge.getByRole("button", { name: "Şimdi değil", exact: true }).click();
  await expect(nudge).toHaveCount(0);
  await create("İkinci mobil teklif");
  await expect(nudge).toHaveCount(0);
  await page.reload();
  await expect(nudge).toHaveCount(0);
});
test("receipt queue sends only contentless owner-scoped CSRF requests, retries failures and clears only old owner", async ({
  page,
}) => {
  await page.goto("/reminders");
  const id = randomUUID(),
    other = randomUUID();
  const payloads: unknown[] = [];
  let status = 503;
  await page.route("**/api/notifications/*/delivery-receipts", async route => {
    payloads.push({ body: route.request().postDataJSON(), csrf: route.request().headers()["x-adhd-csrf"] });
    await route.fulfill({ status });
  });
  const result = await page.evaluate(
    async ({ owner, id, other }) => {
      const path = "/delivery-receipts.js",
        recipientPath = "/recipient-store.js";
      const { queueReceipt, flushReceipts } = await import(path);
      const { setRecipient } = await import(recipientPath);
      await setRecipient(owner, "mobile-audit");
      await queueReceipt(owner, id, 0, "Displayed");
      await queueReceipt(other, id, 0, "Opened");
      await flushReceipts(other);
      await flushReceipts(owner);
      return true;
    },
    { owner, id, other },
  );
  expect(result).toBe(true);
  expect(payloads).toEqual([{ body: { expectedUserId: owner, snoozeCount: 0, stage: "Displayed" }, csrf: "1" }]);
  status = 204;
  await page.evaluate(
    async ({ owner }) => {
      const path = "/delivery-receipts.js";
      const m = await import(path);
      await m.flushReceipts(owner);
      await m.flushReceipts(owner);
      await m.clearReceipts(owner);
    },
    { owner },
  );
  expect(payloads).toHaveLength(2);
  await page.evaluate(
    async ({ other }) => {
      const path = "/recipient-store.js",
        receipts = "/delivery-receipts.js";
      await (await import(path)).setRecipient(other, "next");
      await (await import(receipts)).flushReceipts(other);
    },
    { other },
  );
  expect(payloads).toHaveLength(3);
  expect(payloads[2]).toEqual({ body: { expectedUserId: other, snoozeCount: 0, stage: "Opened" }, csrf: "1" });
});
test("receipt queue is bounded and one flush performs at most twenty requests", async ({ page }) => {
  await page.goto("/reminders");
  let calls = 0;
  await page.route("**/api/notifications/*/delivery-receipts", route => {
    calls++;
    return route.fulfill({ status: 204 });
  });
  const count = await page.evaluate(
    async ({ owner }) => {
      const path = "/delivery-receipts.js",
        recipientPath = "/recipient-store.js";
      const { queueReceipt, flushReceipts, clearReceipts } = await import(path);
      await clearReceipts(owner);
      await (await import(recipientPath)).setRecipient(owner, "bounded");
      for (let i = 0; i < 270; i++) await queueReceipt(owner, crypto.randomUUID(), 0, "Displayed");
      const read = () =>
        new Promise<number>((resolve, reject) => {
          const request = indexedDB.open("adhd-notification-receipts-v1");
          request.onerror = reject;
          request.onsuccess = () => {
            const db = request.result,
              tx = db.transaction("pending", "readonly"),
              count = tx.objectStore("pending").count();
            tx.oncomplete = () => {
              db.close();
              resolve(count.result);
            };
          };
        });
      const before = await read();
      await flushReceipts(owner);
      const after = await read();
      await clearReceipts(owner);
      return { before, after };
    },
    { owner },
  );
  expect(count.before).toBe(256);
  expect(calls).toBe(20);
  expect(count.after).toBe(236);
});

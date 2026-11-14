import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
// Sunucu/izin kontrolleri worker çalışmasından ayrı. Gerçek worker akışı pwa.spec.ts içinde.
// Playwright worker desteğini yalnız Chromium için belgeliyor: https://playwright.dev/docs/service-workers
test.use({ serviceWorkers: "block" });
let fx: FocusFixture;
const base = "/reminders/preferences";
test.beforeAll(async () => {
  fx = await FocusFixture.create();
});
test.afterAll(async () => {
  await fx?.api.dispose();
});
test.beforeEach(async ({ page }) => {
  await fx.login(page);
});

test("permission denial and missing PushManager are explicit; neither sends a subscription (browser boundary double)", async ({
  page,
}) => {
  const key = createECDH("prime256v1").generateKeys().toString("base64url");
  let writes = 0;
  await page.route("**/api/notifications/push-config", route =>
    route.fulfill({ json: { enabled: true, publicKey: key } }),
  );
  await page.addInitScript(() => {
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { permission: "default", requestPermission: async () => "denied" },
    });
    if (!("PushManager" in window))
      Object.defineProperty(window, "PushManager", { configurable: true, value: class {} });
  });
  page.on("request", r => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/notifications/subscriptions") writes++;
  });
  await page.goto(base);
  await page.getByRole("button", { name: "Bu cihazda bildirimleri aç", exact: true }).click();
  await expect(
    page.getByText("İzin verilmedi. Bildirimler gelen kutusunda kullanılabilir.", { exact: true }),
  ).toBeVisible();
  expect(writes).toBe(0);
  await page.evaluate(() => {
    Reflect.deleteProperty(window, "PushManager");
    window.dispatchEvent(new Event("focus"));
  });
  await expect(
    page.getByText("Bu tarayıcıda cihaz bildirimi kullanılamıyor. Hatırlatmalarını gelen kutusunda görebilirsin.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Bu cihazda bildirimleri aç", exact: true })).toHaveCount(0);
});

test("real subscription removal handles stale version and lost ACK through GET; endpoint and keys never render", async ({
  page,
}) => {
  const command = {
    endpoint: `https://push.example.test/${randomUUID()}`,
    p256dh: createECDH("prime256v1").generateKeys().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
    label: "Test cihazı",
  };
  const first = await fx.api.post("/api/notifications/subscriptions", { data: command });
  expect(first.status()).toBe(200);
  const subscription = await first.json();
  await page.goto(base);
  await page.getByText("Diğer cihazlar ve uygulama", { exact: true }).click();
  const row = page.locator(`[data-subscription-id="${subscription.id}"]`);
  await expect(row).toContainText("Test cihazı");
  expect(
    await page.evaluate(
      values => values.some(value => document.documentElement.innerHTML.includes(value)),
      [command.endpoint, command.p256dh, command.auth],
    ),
  ).toBe(false);
  const removeUrl = `**/api/notifications/subscriptions/${subscription.id}/remove`;
  // Hazırlanmış gövdeyi yarıştırıyoruz. Normal arka plan yenilemesi hedeflenen eski sürüm koşulunu silmesin.
  await page.route(removeUrl, async route => {
    expect((await fx.api.post("/api/notifications/subscriptions", { data: command })).status()).toBe(200);
    await route.continue();
  });
  await row.getByRole("button", { name: "Bu cihazı kaldır", exact: true }).click();
  await expect(page.locator("#main").getByRole("alert")).toContainText("değişmiş");
  await expect(row.getByRole("button", { name: "Bu cihazı kaldır", exact: true })).toBeDisabled();
  await page.unroute(removeUrl);
  await page.locator("details.device-details").getByRole("button", { name: "Durumu yenile", exact: true }).click();
  await expect(row.getByRole("button", { name: "Bu cihazı kaldır", exact: true })).toBeEnabled();
  let posts = 0;
  await page.route(`**/api/notifications/subscriptions/${subscription.id}/remove`, async route => {
    posts++;
    await route.fetch();
    await route.abort("failed");
  });
  await row.getByRole("button", { name: "Bu cihazı kaldır", exact: true }).click();
  await expect(page.locator("#main").getByRole("alert")).toContainText("sonucu belirsiz");
  await expect(row.getByRole("button", { name: "Bu cihazı kaldır", exact: true })).toBeDisabled();
  await page.locator("details.device-details").getByRole("button", { name: "Durumu yenile", exact: true }).click();
  await expect(row).toHaveCount(0);
  expect(posts).toBe(1);
  const prefs = await (await fx.api.get("/api/notifications/preferences")).json();
  expect(
    (
      await fx.api.put("/api/notifications/preferences", {
        data: { version: prefs.version, settings: { ...prefs.settings, pushEnabled: true } },
      })
    ).status(),
  ).toBe(200);
  await page.locator("details.device-details").getByRole("button", { name: "Durumu yenile", exact: true }).click();
  await page.getByRole("button", { name: "Tüm cihaz bildirimlerini kapat", exact: true }).click();
  await expect(
    page.getByText("Tüm cihaz bildirimleri kapalı. Uygulamadaki gelen kutusu açık kalır.", { exact: true }),
  ).toBeVisible();
  const after = await (await fx.api.get("/api/notifications/preferences")).json();
  expect(after.settings).toEqual({ ...prefs.settings, pushEnabled: false });
  await page.unrouteAll({ behavior: "wait" });
});

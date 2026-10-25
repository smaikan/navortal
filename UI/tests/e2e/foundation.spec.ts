import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createApiClient, type ApiIdentity } from "../../src/lib/api/client";
import { EVIDENCE } from "./helpers/evidence";
import { trackFaults } from "./helpers/faults";
import { expectDecorOnly } from "./helpers/decor-contrast";

test.beforeAll(async ({ browser, browserName }, worker) => {
  writeFileSync(
    `${EVIDENCE}/environment-${worker.project.name}-${worker.workerIndex}.json`,
    JSON.stringify(
      {
        browserName,
        browserVersion: browser.version(),
        project: worker.project.name,
        node: process.version,
        platform: process.platform,
        buildId: readFileSync(`${process.env.UI_E2E_BUILD_DIR ?? ".next"}/BUILD_ID`, "utf8").trim(),
        viewport: worker.project.use.viewport,
        locale: "tr-TR",
        timeZone: "Europe/Istanbul",
        fixture: "isolated synthetic accounts; no auth trace",
      },
      null,
      2,
    ) + "\n",
  );
});

test("empty foundation, real404 and keyboard skip remain usable", { tag: "@smoke" }, async ({ page }) => {
  const faults: string[] = [];
  trackFaults(page, faults);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Zihnin dağınık olabilir, planın olmasın." })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Başlangıç" }).getByRole("link", { name: "Ücretsiz başla", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "İçeriğe geç" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(result.violations).toEqual([]);
  await expectDecorOnly(page, result.incomplete);
  const response = await page.goto("/bulunamayan-sayfa");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Bu sayfa bulunamadı" })).toBeVisible();
  await page.getByRole("link", { name: "Başlangıca dön" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Zihnin dağınık olabilir, planın olmasın." })).toBeVisible();
  expect(faults).toEqual([]);
});

test("error fallback focuses its heading and retry restores the route", async ({ page }) => {
  await page.goto("/internal-checks/error");
  await page.getByRole("button", { name: "Kontrollü hata oluştur" }).click();
  const heading = page.getByRole("heading", { name: "Bu ekran açılamadı" });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(result.violations).toEqual([]);
  expect(result.incomplete).toEqual([]);
  await page.getByRole("button", { name: "Yeniden dene" }).click();
  await expect(page.getByRole("heading", { name: "Hata sınırı kontrolü" })).toBeVisible();
});

test("typed transport reaches real API through no-store proxy and isolates owners", async ({ baseURL }) => {
  async function account() {
    let identity: ApiIdentity = { epoch: 0, active: false, verified: false };
    // Node cookie tutmaz. Hesabın HttpOnly cookie'sini tarayıcı gibi aynı kaynakta koruyoruz.
    let cookie = "";
    const client = createApiClient({
      identity: () => identity,
      onUnauthorized: () => {
        identity = { epoch: identity.epoch + 1, active: false, verified: false };
      },
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        if (cookie) headers.set("Cookie", cookie);
        headers.set("Origin", new URL(baseURL!).origin);
        const response = await fetch(new URL(String(input), baseURL), { ...init, headers });
        const set = response.headers.getSetCookie().find(x => x.startsWith("adhd_session="));
        if (set) cookie = set.split(";")[0];
        expect(response.headers.get("Cache-Control")).toContain("no-store");
        return response;
      },
    });
    const auth = await client
      .mutation("/api/auth/register", "post", {
        body: { email: `ui-${randomUUID()}@example.test`, password: randomUUID() },
      })
      .execute();
    expect(cookie).toMatch(/^adhd_session=/);
    identity = { epoch: 1, active: true, verified: false };
    const me = await client.read("/api/auth/me");
    expect(me.id).toBe(auth.user.id);
    identity = { ...identity, verified: true };
    return { client, auth };
  }
  const a = await account();
  const b = await account();
  const unauthorized = await fetch(`${baseURL}/api/tasks`);
  expect(unauthorized.status).toBe(401);
  expect(unauthorized.headers.get("Cache-Control")).toContain("no-store");
  const task = await a.client
    .mutation("/api/tasks", "post", { body: { title: "Gerçek API ile küçük adım" } })
    .execute();
  const detail = await a.client.read("/api/tasks/{id}", { path: { id: task.id } });
  expect(detail.title).toBe("Gerçek API ile küçük adım");
  await expect(b.client.read("/api/tasks/{id}", { path: { id: task.id } })).rejects.toMatchObject({ status: 404 });
  const response = await fetch(`${baseURL}/api/tasks`, {
    headers: { Authorization: `Bearer ${a.auth.accessToken}` },
    cache: "no-store",
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  await a.client
    .mutation("/api/tasks/{id}", "put", {
      path: { id: task.id },
      body: { version: task.version, title: "Güncel adım" },
    })
    .execute();
  await expect(
    a.client
      .mutation("/api/tasks/{id}", "put", {
        path: { id: task.id },
        body: { version: task.version, title: "Eski sürüm" },
      })
      .execute(),
  ).rejects.toMatchObject({ status: 409 });
});

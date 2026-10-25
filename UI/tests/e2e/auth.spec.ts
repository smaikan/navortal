import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { SESSION_MARKER_KEY } from "../../src/features/auth/session";
import { openAccountMenu, sessionCookie, signIn, signOutFromMenu } from "./helpers/session";
import { EVIDENCE } from "./helpers/evidence";
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
        fixture: "isolated synthetic accounts; tokens stay in memory/browser storage only",
      },
      null,
      2,
    ) + "\n",
  );
});
async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(result.violations.map(x => ({ id: x.id, impact: x.impact, nodes: x.nodes.map(n => n.target) }))).toEqual([]);
  await expectDecorOnly(page, result.incomplete);
}

async function assertSignedInAccount(page: Page, email: string) {
  await openAccountMenu(page);
  await expect(page.getByRole("menuitem", { name: `Giriş yapılan hesap: ${email}`, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Hesap menüsü", exact: true })).toHaveCount(0);
  const closeMore = page.getByRole("button", { name: "Daha fazla panelini kapat", exact: true });
  if (await closeMore.isVisible()) {
    await closeMore.click();
    await expect(closeMore).not.toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("menu")).toBeNull();
  }
}

test("auth form validation, keyboard, mobile reflow and noindex", { tag: "@smoke" }, async ({ page }, info) => {
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Kendi alanını oluştur" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  expect(await page.content()).not.toContain('"accessToken":');
  await page.getByRole("button", { name: "Hesap oluştur", exact: true }).click();
  await expect(page.getByLabel("E-posta", { exact: true })).toBeFocused();
  await expect(page.getByText("E-posta adresini yaz.", { exact: true })).toBeVisible();
  await page.getByLabel("E-posta", { exact: true }).fill("reader@example.test");
  await page.getByLabel("Parola", { exact: true }).fill("12345");
  await page.getByRole("button", { name: "Parolayı göster" }).click();
  await expect(page.getByLabel("Parola", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Parolayı gizle" }).click();
  await page.getByRole("button", { name: "Hesap oluştur", exact: true }).click();
  await expect(page.getByText("Parola en az 6 karakter olmalı.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Parola", { exact: true })).toBeFocused();
  await axe(page);
  await page.getByLabel("Parola", { exact: true }).fill("");
  await page.screenshot({ path: `${EVIDENCE}/register-validation-${info.project.name}.png`, fullPage: true });
  for (const width of info.project.name === "chromium" ? [320, 390, 768, 1440] : []) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `${EVIDENCE}/register-${width}.png`, fullPage: true });
  }

  await page.goto("/login");
  const password = page.getByLabel("Parola", { exact: true });
  const recovery = page.getByRole("link", { name: "Parolamı unuttum", exact: true });
  await expect(recovery).toHaveCount(1);
  await expect(recovery).toBeVisible();
  const field = (await password.boundingBox())!;
  const link = (await recovery.boundingBox())!;
  expect(link.y).toBeGreaterThanOrEqual(field.y + field.height);
  expect(Math.abs(link.x + link.width - field.x - field.width)).toBeLessThan(2);
  await page.getByRole("button", { name: "Parolayı göster" }).focus();
  await page.keyboard.press("Tab");
  await expect(recovery).toBeFocused();
  await axe(page);
  await page.screenshot({ path: `${EVIDENCE}/login-${info.project.name}.png`, fullPage: true });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/forgot-password$/);
});

test("real register, reload, server sign out and wrong/correct login", async ({ page }) => {
  const email = `auth-${randomUUID()}@example.test`;
  const password = " 1234 ";
  const faults: string[] = [];
  const disallowed: string[] = [];
  let phase = "register";
  const network: { event: string; path?: string; phase: string; message?: string; time: number }[] = [];
  const start = Date.now();
  page.on("pageerror", error => {
    faults.push(error.message);
    network.push({ event: "pageerror", phase, message: error.message, time: Date.now() - start });
  });
  page.on("requestfailed", request =>
    network.push({
      event: "requestfailed",
      phase,
      path: new URL(request.url()).pathname,
      message: request.failure()?.errorText,
      time: Date.now() - start,
    }),
  );
  page.on("request", request => {
    if (/refresh|google|work-sessions|focus-sessions/.test(new URL(request.url()).pathname))
      disallowed.push(new URL(request.url()).pathname);
  });
  await page.goto("/register?next=%2Fapp%2Fbugun%3Fdate%3D2026-10-17");
  await page.getByLabel("E-posta", { exact: true }).fill(email);
  await page.getByLabel("Parola", { exact: true }).fill(password);
  await page.getByRole("checkbox", { name: /Kullanım Koşulları/ }).check();
  await page.getByRole("button", { name: "Hesap oluştur", exact: true }).click();
  await expect(page).toHaveURL(/\/planning\?date=2026-10-17$/);
  await assertSignedInAccount(page, email);
  // UI-04 bildirimi me sonrasında özel okuma yapar. Hazır ekranı yeniliyoruz;
  // WebKit gezinme iptalinde tarayıcı erişim hatası bildirebilir.
  await expect(page.getByText("Henüz haftalık çalışma saati belirlemedin.", { exact: false })).toBeVisible();
  phase = "reload";
  await page.reload();
  await assertSignedInAccount(page, email);
  await expect(page.getByText("Henüz haftalık çalışma saati belirlemedin.", { exact: false })).toBeVisible();
  phase = "logout";
  await signOutFromMenu(page);
  await expect(page.getByRole("heading", { name: "Hesabına giriş yap" })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key) === null, SESSION_MARKER_KEY)).toBe(true);
  expect(await sessionCookie(page.context())).toBeUndefined();
  phase = "login";
  await page.getByLabel("E-posta", { exact: true }).fill(email);
  await page.getByLabel("Parola", { exact: true }).fill("wrong!");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("E-posta veya parola hatalı");
  await expect(page.getByRole("main").getByRole("alert")).toBeFocused();
  await expect(page.getByLabel("Parola", { exact: true })).toHaveValue("");
  await axe(page);
  await page.getByLabel("Parola", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await assertSignedInAccount(page, email);
  await expect(page.getByText("Henüz haftalık çalışma saati belirlemedin.", { exact: false })).toBeVisible();
  writeFileSync(`${EVIDENCE}/auth-reload-network-${test.info().project.name}.json`, JSON.stringify(network, null, 2));
  expect(faults).toEqual([]);
  expect(disallowed).toEqual([]);
});

test("bootstrap outage preserves token and explicit retry recovers the real user", async ({ page, request }) => {
  const email = `recovery-${randomUUID()}@example.test`;
  const response = await request.post("/api/auth/register", { data: { email, password: randomUUID() } });
  // Yanıt gövdesini veya token değerini teste/rapora eklemiyoruz.
  expect(response.status()).toBe(201);
  const auth = (await response.json()) as { accessToken: string };
  await signIn(page, auth.accessToken);
  let release!: () => void;
  const wait = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route("**/api/auth/me", async route => {
    await wait;
    await route.abort("failed");
  });
  await page.goto("/planning");
  // Kabuk ve başlık hemen görünür. Durum satırı ekran okuyucu içindir.
  await expect(page.getByRole("status")).toHaveText("Çalışma alanın açılıyor…");
  await expect(page.locator("#main h1")).toHaveText("Gün Planlama");
  await expect(page.getByRole("button", { name: "Hesap menüsü" })).toHaveCount(0);
  release();
  await expect(page.getByRole("heading", { name: "Çalışma alanına bağlanılamadı" })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key) !== null, SESSION_MARKER_KEY)).toBe(true);
  expect(await sessionCookie(page.context())).toBeDefined();
  await axe(page);
  await page.unroute("**/api/auth/me");
  await page.getByRole("button", { name: "Yeniden dene" }).click();
  await assertSignedInAccount(page, email);
});

test("invalid session cookie 401 clears locally and retains safe app return context", async ({ page }) => {
  await signIn(page, "invalid-test-access");
  await page.goto("/planning?taskId=sample");
  await expect(page.getByRole("heading", { name: "Hesabına giriş yap" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("next")).toBe("/planning?taskId=sample");
  expect(await page.evaluate(key => localStorage.getItem(key) === null, SESSION_MARKER_KEY)).toBe(true);
  expect(await sessionCookie(page.context())).toBeUndefined();
});

test("offline mutation and unknown register result never queue or silently retry", async ({ page, context }) => {
  let posts = 0;
  await page.goto("/register");
  await page.route("**/api/auth/register", async route => {
    posts++;
    await route.abort("failed");
  });
  await context.setOffline(true);
  await page.getByLabel("E-posta", { exact: true }).fill("offline@example.test");
  await page.getByLabel("Parola", { exact: true }).fill("123456");
  await page.getByRole("checkbox", { name: /Kullanım Koşulları/ }).check();
  await page.getByRole("button", { name: "Hesap oluştur", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Bağlantı yok");
  expect(posts).toBe(0);
  await context.setOffline(false);
  await page.getByLabel("Parola", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Hesap oluştur", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Hesabının oluşup oluşmadığı doğrulanamadı");
  await expect(page.getByRole("button", { name: "Hesap oluştur", exact: true })).toBeDisabled();
  expect(posts).toBe(1);
  await page.getByRole("link", { name: "Giriş yap", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hesabına giriş yap" })).toBeVisible();
  expect(posts).toBe(1);
});

test("400 field errors and429 waiting remain actionable without exposing raw errors", async ({ page }) => {
  await page.goto("/login");
  await page.route("**/api/auth/login", route =>
    route.fulfill({
      status: 400,
      contentType: "application/problem+json",
      json: { errors: { Email: ["E-posta adresini kontrol et."] }, code: "validation_error" },
    }),
  );
  await page.getByLabel("E-posta", { exact: true }).fill("person@example.test");
  await page.getByLabel("Parola", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page.getByText("E-posta adresini kontrol et.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("E-posta", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("main form")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByLabel("Parola", { exact: true })).toHaveValue("");
  await page.unroute("**/api/auth/login");
  await page.route("**/api/auth/login", route =>
    route.fulfill({ status: 429, headers: { "Retry-After": "120" }, body: "" }),
  );
  await page.getByLabel("Parola", { exact: true }).fill("123456");
  await expect(page.getByLabel("Parola", { exact: true })).toHaveValue("123456");
  const throttled = page.waitForResponse(
    response => new URL(response.url()).pathname === "/api/auth/login" && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  expect((await throttled).status()).toBe(429);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Çok sık deneme");
  await expect(page.getByRole("button", { name: "Giriş yap", exact: true })).toBeDisabled();
  await axe(page);
});

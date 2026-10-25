import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { LEGACY_TOKEN_KEY, SESSION_MARKER_KEY } from "../../src/features/auth/session";
import { SESSION_COOKIE, sessionCookie, signOutFromMenu } from "./helpers/session";
import { trackFaults } from "./helpers/faults";
import { EVIDENCE } from "./helpers/evidence";

/** Tarayıcı oturumu HttpOnly cookie'dir. Sayfa JavaScript'i tokenı okuyamaz, depolamada tutulmaz. */
const jwtShape = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;

async function register(page: Page) {
  const email = `cookie-${randomUUID()}@example.test`;
  const password = randomUUID();
  await page.goto("/register");
  await page.getByLabel("E-posta", { exact: true }).fill(email);
  await page.getByLabel("Parola", { exact: true }).fill(password);
  await page.getByRole("checkbox", { name: /Kullanım Koşulları/ }).check();
  await page.getByRole("button", { name: "Hesap oluştur", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Bildirimler/ })).toBeVisible();
  return { email, password };
}

async function storageDump(page: Page) {
  return page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
    cookie: document.cookie,
    html: document.documentElement.outerHTML,
  }));
}

test(
  "a real sign-in keeps no token in storage, cookies or HTML and the cookie is HttpOnly + SameSite=Strict",
  { tag: "@smoke" },
  async ({ page, context, browserName }) => {
    const faults: string[] = [];
    trackFaults(page, faults);
    const issued = page.waitForResponse(r => new URL(r.url()).pathname === "/api/auth/register");
    await register(page);
    // Cookie özelliklerinde sunucunun Set-Cookie başlığı esas alınır.
    const header = ((await (await issued).headerValue("set-cookie")) ?? "").toLowerCase();
    expect(header).toContain("httponly");
    expect(header).toContain("samesite=strict");
    const dump = await storageDump(page);
    expect(JSON.stringify(dump.local)).not.toMatch(jwtShape);
    expect(JSON.stringify(dump.session)).not.toMatch(jwtShape);
    expect(dump.local.map(([key]) => key)).toContain(SESSION_MARKER_KEY);
    expect(dump.local.find(([key]) => key === SESSION_MARKER_KEY)?.[1]).toBe(JSON.stringify({ version: 1 }));
    expect(dump.cookie).not.toContain(SESSION_COOKIE);
    expect(dump.html).not.toMatch(jwtShape);
    const cookie = await sessionCookie(context);
    expect(cookie).toMatchObject({ httpOnly: true, path: "/" });
    // Windows Playwright WebKit SameSite desteklemez, bütün cookie'leri None diye bildirir.
    if (browserName !== "webkit") expect(cookie?.sameSite).toBe("Strict");
    // Yerel testte belgeli Development/Testing Secure istisnası var. Production __Host- ve Secure kullanır.
    expect(cookie?.secure).toBe(false);
    expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000 + 300 * 24 * 3600);
    expect(faults).toEqual([]);
  },
);

test("sign-out ends the server session; Back shows no private data and the old cookie value is refused", async ({
  page,
  context,
  request,
}) => {
  await register(page);
  const title = `Özel görev ${randomUUID().slice(-6)}`;
  const before = (await sessionCookie(context))!.value;
  const created = await request.post("/api/tasks", { headers: { Authorization: `Bearer ${before}` }, data: { title } });
  expect(created.status()).toBe(201);
  await page.goto("/tasks");
  await expect(page.getByText(title).first()).toBeVisible();
  await signOutFromMenu(page);
  await expect(page.getByRole("heading", { name: "Hesabına giriş yap" })).toBeVisible();
  expect(await sessionCookie(context)).toBeUndefined();
  expect(await page.evaluate(key => localStorage.getItem(key), SESSION_MARKER_KEY)).toBeNull();
  await page.goBack();
  await expect(page.getByText(title)).toHaveCount(0);
  const reused = await request.get("/api/auth/me", { headers: { Authorization: `Bearer ${before}` } });
  expect(reused.status()).toBe(401);
});

test("Ayarlar › Tüm cihazlardan çık ends a second browser too, after an explicit confirmation", async ({
  page,
  browser,
}, info) => {
  const account = await register(page);
  const second = await browser.newContext();
  const other = await second.newPage();
  try {
    await other.goto("/login");
    await other.getByLabel("E-posta", { exact: true }).fill(account.email);
    await other.getByLabel("Parola", { exact: true }).fill(account.password);
    await other.getByRole("button", { name: "Giriş yap", exact: true }).click();
    await expect(other.getByRole("button", { name: /^Bildirimler/ })).toBeVisible();
    await page.goto("/settings?section=account");
    const start = page.getByRole("button", { name: "Tüm cihazlardan çık" }).first();
    await start.click();
    const dialog = page.getByRole("dialog", { name: "Tüm cihazlardan çıkılsın mı?" });
    await expect(dialog).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(axe.violations).toEqual([]);
    await page.screenshot({ path: `${EVIDENCE}/logout-all-confirm-${info.project.name}.png` });
    await dialog.getByRole("button", { name: "Vazgeç" }).click();
    await expect(start).toBeFocused();
    await start.click();
    await dialog.getByRole("button", { name: "Tüm cihazlardan çık", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Hesabına giriş yap" })).toBeVisible();
    await other.reload();
    await expect(other.getByRole("heading", { name: "Hesabına giriş yap" })).toBeVisible();
  } finally {
    await second.close();
  }
});

test("a pre-cookie stored token is adopted once into a cookie session and removed from storage", async ({
  page,
  context,
  request,
}) => {
  const email = `legacy-${randomUUID()}@example.test`;
  const registered = await request.post("/api/auth/register", { data: { email, password: randomUUID() } });
  expect(registered.status()).toBe(201);
  const { user } = (await registered.json()) as { user: { id: string } };
  // Bu koşunun kendi anahtarıyla imzalı, sid içermeyen eski biçim token.
  const key = process.env.Jwt__SigningKey!;
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: user.id, iat: Math.floor(Date.now() / 1000), iss: "adhd-api", aud: "adhd-web" })}`;
  const legacy = `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
  expect((await request.get("/api/auth/me", { headers: { Authorization: `Bearer ${legacy}` } })).status()).toBe(401);
  await page.goto("/login");
  await page.evaluate(({ k, token }) => localStorage.setItem(k, JSON.stringify({ version: 1, token })), {
    k: LEGACY_TOKEN_KEY,
    token: legacy,
  });
  await page.goto("/planning");
  await expect(page.getByRole("button", { name: /^Bildirimler/ })).toBeVisible();
  expect(await page.evaluate(k => localStorage.getItem(k), LEGACY_TOKEN_KEY)).toBeNull();
  expect(await sessionCookie(context)).toBeDefined();
  // Aynı tokenla ikinci adopt sunucuda reddedilir.
  const again = await request.post("/api/auth/session/adopt", { headers: { Authorization: `Bearer ${legacy}` } });
  expect(again.status()).toBe(401);
});

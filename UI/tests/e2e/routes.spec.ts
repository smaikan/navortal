import { expect, test } from "@playwright/test";
import { workspacePaths, routeChanges } from "../../public/route-paths.js";
import { FocusFixture } from "./helpers/focus-fixture";
import { EVIDENCE } from "./helpers/evidence";
import AxeBuilder from "@axe-core/playwright";
import { expectDecorOnly } from "./helpers/decor-contrast";

const pages: Record<string, string> = {
  "/planning": "Gün Planlama",
  "/tasks": "Görevler",
  "/matrix": "Eisenhower Matrisi",
  "/tasks/completed": "Biten görevler",
  "/calendar": "Takvim",
  "/focus": "Odak",
  "/pool": "Havuz",
  "/projects": "Projeler",
  "/notes": "Notlar",
  "/recurrences": "Rutin",
  "/analytics": "Analiz",
  "/analytics/plan": "Analiz",
  "/reminders": "Hatırlatmalar",
  "/reminders/special-days": "Hatırlatmalar",
  "/reminders/preferences": "Hatırlatmalar",
  // /settings kalıcı bağlantıdır; Ayarlar penceresini Gün Planlama üstünde açar.
  "/settings": "Gün Planlama",
  "/work": "Çalışma kayıtları",
  "/categories": "Kategoriler",
  "/guide": "Kullanım rehberi",
};
const publicPages: Record<string, RegExp> = {
  "/": /Navortal/,
  "/features": /Özellikler/,
  "/how-it-works": /Nasıl çalışır/,
  "/help": /Kullanım yardımı/,
  "/login": /Giriş yap/,
  "/register": /Hesap oluştur/,
  "/forgot-password": /Parolamı unuttum/,
  "/reset-password": /Yeni parola/,
};
test.describe.configure({ mode: "default" });
let owner: FocusFixture;
test.beforeAll(async () => {
  owner = await FocusFixture.create();
  expect(Object.keys(pages).sort()).toEqual([...workspacePaths].sort());
});
test.afterAll(async () => {
  if (owner) {
    await owner.clean();
    await owner.api.dispose();
  }
});

for (const [path, heading] of Object.entries(pages)) {
  test(`direct workspace page ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.name));
    await owner.login(page);
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("#main h1").first()).toHaveText(heading);
    await expect(page.locator(".workspace-shell")).toBeVisible();
    await expect(page.locator("[data-sync-state]")).toHaveAttribute("data-sync-state", "connected");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    const moved: Record<string, string> = {
      "/analytics/plan": "/analytics",
      "/settings": "/planning",
    };
    expect(new URL(page.url()).pathname).toBe(moved[path] ?? path);
    expect(errors).toEqual([]);
    await expect(page.getByRole("heading", { name: "Bu ekran açılamadı" })).toHaveCount(0);
    await expect(page.locator('a[href^="/app/"]')).toHaveCount(0);
  });
}
for (const [path, title] of Object.entries(publicPages)) {
  test(`direct public page ${path}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.name));
    // Çalışma alanı koyu olsa da giriş karşılaması açık kalır.
    await page.addInitScript(() => localStorage.setItem("ui-theme", "dark"));
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(title);
    await expect(page.locator("#main h1").first()).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(path);
    if (path === "/login" || path === "/register") {
      await expect(page.getByLabel("E-posta", { exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      expect(await page.locator(".auth-page").evaluate(el => getComputedStyle(el).colorScheme)).toBe("light");
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(audit.violations).toEqual([]);
      await expectDecorOnly(page, audit.incomplete);
      await page.screenshot({ path: `${EVIDENCE}/welcome-${path.slice(1)}-${info.project.name}.png`, fullPage: true });
      if (info.project.name === "chromium") {
        for (const [width, height] of [
          [320, 800],
          [768, 1024],
          [1920, 1080],
          [640, 320],
        ]) {
          await page.setViewportSize({ width, height });
          expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
          const input = await page.getByLabel("E-posta", { exact: true }).boundingBox();
          expect(input!.height).toBeGreaterThanOrEqual(44);
          await page.screenshot({
            path: `${EVIDENCE}/welcome-${path.slice(1)}-${width}x${height}.png`,
            fullPage: true,
          });
        }
      }
    }
    expect(errors).toEqual([]);
  });
}
test("every legacy page redirects; deep link query and hash survive", async ({ page, request }) => {
  for (const [source, target] of Object.entries(routeChanges)) {
    const response = await request.get(source, { maxRedirects: 0 });
    expect(response.status(), source).toBe(308);
    expect(new URL(response.headers().location, response.url()).pathname, source).toBe(target);
  }
  await owner.login(page);
  await page.goto("/app/bugun?date=2026-10-26#plan");
  await expect(page.locator("#main h1")).toHaveText("Gün Planlama");
  expect(new URL(page.url()).pathname).toBe("/planning");
  expect(new URL(page.url()).searchParams.get("date")).toBe("2026-10-26");
  expect(new URL(page.url()).hash).toBe("#plan");
  const manifest = await request.get("/manifest.webmanifest");
  expect((await manifest.json()).start_url).toBe("/planning");
});
test("anonymous workspace deep link returns through login without private reads", async ({ page }) => {
  const privateReads: string[] = [];
  page.on("request", r => {
    const p = new URL(r.url()).pathname;
    if (p.startsWith("/api/") && p !== "/api/auth/me") privateReads.push(p);
  });
  await page.goto("/tasks?taskId=synthetic#detail");
  await expect(page.getByRole("heading", { name: "Hesabına giriş yap", exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/login");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/tasks?taskId=synthetic");
  expect(privateReads).toEqual([]);
});

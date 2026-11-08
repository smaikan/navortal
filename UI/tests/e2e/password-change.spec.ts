import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { EVIDENCE } from "./helpers/evidence";

async function account(page: Page) {
  const email = `password-${randomUUID()}@example.test`;
  const password = randomUUID();
  await page.goto("/register");
  await page.getByLabel("E-posta", { exact: true }).fill(email);
  await page.getByLabel("Parola", { exact: true }).fill(password);
  await page.getByRole("checkbox", { name: /Kullanım Koşulları/ }).check();
  await page.getByRole("button", { name: "Hesap oluştur", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Bildirimler/ })).toBeVisible();
  await page.goto("/settings?section=account");
  return { email, password };
}
async function fill(page: Page, current: string, next: string, confirm = next) {
  await page.getByLabel("Mevcut parola", { exact: true }).fill(current);
  await page.getByLabel("Yeni parola", { exact: true }).fill(next);
  await page.getByLabel("Yeni parola tekrar", { exact: true }).fill(confirm);
}
async function audit(page: Page, theme: string, project: string) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  writeFileSync(
    `${EVIDENCE}/password-change-axe-${theme}-${project}.json`,
    JSON.stringify({ violations: result.violations, incomplete: result.incomplete }, null, 2),
  );
  expect(result.violations).toEqual([]);
}

test("account password change validates, rotates the session and keeps the settings design", async ({
  page,
  browser,
}, info) => {
  const user = await account(page);
  const dialog = page.getByRole("dialog", { name: "Ayarlar", exact: true });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}/password-change-${info.project.name}.png` });
  await audit(page, "light", info.project.name);
  const theme = await page.evaluate(() => {
    const value = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", "dark");
    return value;
  });
  await page.screenshot({ path: `${EVIDENCE}/password-change-dark-${info.project.name}.png` });
  await audit(page, "dark", info.project.name);
  await page.evaluate(value => {
    if (value) document.documentElement.setAttribute("data-theme", value);
    else document.documentElement.removeAttribute("data-theme");
  }, theme);
  if (info.project.name === "mobile-chromium") {
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: 320, height: 800 });
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `${EVIDENCE}/password-change-320.png` });
    await page.setViewportSize(viewport);
  }
  const other = await browser.newContext();
  try {
    const login = await other.request.post("http://127.0.0.1:3400/api/auth/session/login", {
      data: { email: user.email, password: user.password },
    });
    expect(login.status()).toBe(200);
    const button = page.getByRole("button", { name: "Parolayı değiştir", exact: true });
    let posts = 0;
    page.on("request", request => {
      if (new URL(request.url()).pathname === "/api/auth/change-password" && request.method() === "POST") posts++;
    });
    await fill(page, user.password, "short");
    await button.click();
    await expect(page.getByText("Parola en az 6 karakter olmalı.", { exact: true })).toBeVisible();
    expect(posts).toBe(0);
    await fill(page, user.password, "new-password", "does-not-match");
    await button.click();
    await expect(page.getByText("Yeni parolalar eşleşmiyor.", { exact: true })).toBeVisible();
    expect(posts).toBe(0);
    await fill(page, "wrong-password", "new-password");
    await button.click();
    await expect(page.getByText("Mevcut parolan doğru değil.", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Ayarlar", exact: true })).toBeVisible();
    await fill(page, user.password, "new-password");
    await page.getByRole("button", { name: "Yeni parolayı göster", exact: true }).click();
    await expect(page.getByLabel("Yeni parola", { exact: true })).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Yeni parolayı gizle", exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await fill(page, user.password, "new-password");
    await button.click();
    await expect(page.getByRole("status").filter({ hasText: "Parolan değiştirildi." })).toBeVisible();
    await expect(page.getByLabel("Mevcut parola", { exact: true })).toHaveValue("");
    expect(posts).toBe(2);
    expect((await other.request.get("http://127.0.0.1:3400/api/auth/me")).status()).toBe(401);
    expect((await page.request.get("/api/auth/me")).status()).toBe(200);
    const oldLogin = await other.request.post("http://127.0.0.1:3400/api/auth/session/login", {
      data: { email: user.email, password: user.password },
    });
    expect(oldLogin.status()).toBe(401);
    expect(
      (
        await other.request.post("http://127.0.0.1:3400/api/auth/session/login", {
          data: { email: user.email, password: "new-password" },
        })
      ).status(),
    ).toBe(200);
  } finally {
    await other.close();
  }
});

test("password drafts respect settings navigation and offline changes are not queued", async ({ page, context }) => {
  const user = await account(page);
  await fill(page, user.password, "new-password");
  page.once("dialog", dialog => void dialog.dismiss());
  const back = page.getByRole("button", { name: "Ayarlar listesine dön", exact: true });
  if (await back.isVisible()) await back.click();
  else await page.getByRole("button", { name: "Profil", exact: true }).click();
  await expect(page.getByLabel("Yeni parola", { exact: true })).toHaveValue("new-password");
  let posts = 0;
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/auth/change-password") posts++;
  });
  await context.setOffline(true);
  await page.getByRole("button", { name: "Parolayı değiştir", exact: true }).click();
  await expect(page.getByRole("form", { name: "Parolayı değiştir", exact: true }).getByRole("alert")).toContainText(
    "Bağlantı yok",
  );
  await expect(page.getByLabel("Yeni parola", { exact: true })).toHaveValue("");
  await context.setOffline(false);
  expect(posts).toBe(0);
});

test("a lost password-change acknowledgement never resends the write", async ({ page }) => {
  const user = await account(page);
  let posts = 0;
  await page.route("**/api/auth/change-password", async route => {
    posts++;
    await route.fetch();
    await route.abort("failed");
  });
  await fill(page, user.password, "new-password");
  await page.getByRole("button", { name: "Parolayı değiştir", exact: true }).click();
  await expect(page.getByRole("form", { name: "Parolayı değiştir", exact: true }).getByRole("alert")).toContainText(
    "İşlemin sonucu doğrulanamadı",
  );
  await expect(page.getByRole("button", { name: "Parolayı değiştir", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Yeni parola", { exact: true })).toHaveValue("");
  expect(posts).toBe(1);
});

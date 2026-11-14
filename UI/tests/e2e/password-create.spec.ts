import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// API integration tests cover Google verification and database/session changes.
// These browser tests exercise the form with controlled Google and API responses.
async function googleAccount(page: Page) {
  let created = false;
  const user = {
    id: randomUUID(),
    email: "google-password@example.test",
    displayName: "Google Reader",
    profileVersion: 1,
    photoVersion: null,
    googlePictureUrl: null,
  };
  await page.route("**/api/**", route =>
    route.fulfill({ status: 503, json: { title: "Not part of this fixture", code: "fixture_unavailable" } }),
  );
  await page.route("**/api/auth/me", route => route.fulfill({ json: user }));
  await page.addInitScript(() => localStorage.setItem("adhd.session.v1", JSON.stringify({ version: 1 })));
  await page.route("**/api/auth/google/config", route =>
    route.fulfill({
      json: {
        enabled: true,
        clientId: "test.apps.googleusercontent.com",
        nonce: "n".repeat(43),
      },
    }),
  );
  await page.route("https://accounts.google.com/gsi/client", route =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.google = { accounts: { id: {
      initialize(config) { window.testPasswordGis = config; },
      renderButton(parent) {
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = 'Google test verify';
        button.onclick = () => window.testPasswordGis.callback({credential: 'fresh-google-proof'});
        parent.appendChild(button);
      }
    }}};`,
    }),
  );
  await page.route("**/api/account/profile", route =>
    route.fulfill({
      json: {
        user: { ...user, profileVersion: created ? 2 : 1 },
        photoUploadEnabled: false,
        firstName: "",
        lastName: "",
        hasPassword: created,
        googleLinked: true,
      },
    }),
  );
  await page.goto("/settings?section=account");
  await expect(page.getByRole("heading", { name: "Şifre oluştur", exact: true })).toBeVisible();
  return {
    user,
    markCreated: () => {
      created = true;
    },
  };
}

async function fill(page: Page, password: string, confirmation = password) {
  await page.getByLabel("Yeni parola", { exact: true }).fill(password);
  await page.getByLabel("Yeni parola tekrar", { exact: true }).fill(confirmation);
}

test("Google users verify identity, validate a new password and gain a second login method", async ({ page }) => {
  const { user, markCreated } = await googleAccount(page);
  let posts = 0;
  await page.route("**/api/auth/set-password", async route => {
    posts++;
    expect(route.request().postDataJSON()).toEqual({
      expectedUserId: user.id,
      idToken: "fresh-google-proof",
      newPassword: "new-password",
    });
    expect(route.request().headers()["x-adhd-csrf"]).toBe("1");
    markCreated();
    await route.fulfill({ json: { ...user, profileVersion: 2 } });
  });
  const submit = page.getByRole("button", { name: "Şifre oluştur", exact: true });
  await expect(page.getByLabel("Mevcut parola", { exact: true })).toHaveCount(0);
  await expect(submit).toBeDisabled();
  await page.getByRole("button", { name: "Google test verify" }).click();
  await expect(submit).toBeEnabled();
  await fill(page, "short");
  await submit.click();
  await expect(page.getByText("Parola en az 6 karakter olmalı.", { exact: true })).toBeVisible();
  await fill(page, "new-password", "different");
  await submit.click();
  await expect(page.getByText("Yeni parolalar eşleşmiyor.", { exact: true })).toBeVisible();
  expect(posts).toBe(0);
  await fill(page, "new-password");
  await page.getByRole("button", { name: "Yeni parolayı göster", exact: true }).click();
  await expect(page.getByLabel("Yeni parola", { exact: true })).toHaveAttribute("type", "text");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await submit.click();
  await expect(page.getByRole("status").filter({ hasText: "Şifren oluşturuldu." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Parolayı değiştir", exact: true })).toBeVisible();
  await expect(page.getByText("E-posta ve parola", { exact: true })).toBeVisible();
  await expect(page.getByText("Bağlı", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Yeni parola", { exact: true })).toHaveValue("");
  expect(posts).toBe(1);
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(storage).not.toContain("fresh-google-proof");
  expect(storage).not.toContain("new-password");
});

test("wrong Google identity requires fresh verification and preserves the session", async ({ page }) => {
  await googleAccount(page);
  await page.route("**/api/auth/set-password", route =>
    route.fulfill({
      status: 400,
      json: {
        code: "google_account_mismatch",
        title: "Bu hesaba bağlı Google hesabını seç.",
      },
    }),
  );
  await page.getByRole("button", { name: "Google test verify" }).click();
  await fill(page, "new-password");
  await page.getByRole("button", { name: "Şifre oluştur", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Bu hesaba bağlı Google hesabını seç." })).toBeVisible();
  await expect(page.getByLabel("Yeni parola", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Şifre oluştur", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Google test verify" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Ayarlar", exact: true })).toBeVisible();
});

test("unknown password creation result is never retried", async ({ page }) => {
  await googleAccount(page);
  let posts = 0;
  await page.route("**/api/auth/set-password", async route => {
    posts++;
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Google test verify" }).click();
  await fill(page, "new-password");
  await page.getByRole("button", { name: "Şifre oluştur", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "İşlemin sonucu doğrulanamadı" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Şifre oluştur", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Yeni parola", { exact: true })).toHaveValue("");
  expect(posts).toBe(1);
});

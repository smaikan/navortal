import { expect, test, type Page } from "@playwright/test";

// GIS callback ve tarayıcı oturumu kontrollü taklit edilir. Gerçek Google kabulü değildir;
// kriptografik doğrulama/bağlama ve cookie sınırları API integration testlerindedir.
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "google-browser@example.test",
  displayName: "Google Reader",
  profileVersion: 1,
  photoVersion: null,
  googlePictureUrl: null,
};
const sdk = `
window.google = { accounts: { id: {
  initialize(config) { window.testGisConfig = config; },
  renderButton(parent, options) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = 'Google test sign-in';
    button.style.width = options.width + 'px';
    const callback = window.testGisConfig.callback;
    button.onclick = () => callback({credential: 'synthetic-google-proof'});
    parent.appendChild(button);
  }
}}};`;

async function config(page: Page, enabled = true) {
  await page.route("**/api/auth/google/config", route =>
    route.fulfill({
      json: {
        enabled,
        clientId: enabled ? "test.apps.googleusercontent.com" : null,
        nonce: enabled ? "n".repeat(43) : null,
      },
    }),
  );
}

test("Google callback uses the session API and keeps credentials out of storage", async ({ page }) => {
  const faults: string[] = [];
  page.on("pageerror", error => faults.push(error.message));
  await page.route("**/api/**", route =>
    route.fulfill({ status: 503, json: { title: "Workspace not part of this fixture", code: "fixture_unavailable" } }),
  );
  await config(page);
  await page.route("https://accounts.google.com/gsi/client", route => {
    // GIS must receive the site origin, without auth paths or return query parameters.
    expect(route.request().headers().referer).toBe(`${new URL(page.url()).origin}/`);
    return route.fulfill({ contentType: "text/javascript", body: sdk });
  });
  await page.route("**/api/auth/me", route => route.fulfill({ json: user }));
  let submissions = 0;
  await page.route("**/api/auth/session/google", async route => {
    submissions++;
    expect(route.request().postDataJSON()).toEqual({ idToken: "synthetic-google-proof" });
    expect(route.request().headers()["x-adhd-csrf"]).toBe("1");
    expect(route.request().headers().authorization).toBeUndefined();
    await route.fulfill({ json: user });
  });
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Google test sign-in" })).toBeVisible();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(async () => {
        const primary = await page.getByRole("button", { name: "Giriş yap", exact: true }).boundingBox();
        const google = await page.getByRole("button", { name: "Google test sign-in" }).boundingBox();
        return (
          !!primary && !!google && Math.abs(primary.width - google.width) <= 1 && Math.abs(primary.x - google.x) <= 1
        );
      })
      .toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  expect(
    await page.evaluate(() => (window as unknown as { testGisConfig: { nonce: string } }).testGisConfig.nonce),
  ).toBe("n".repeat(43));
  await page.getByRole("button", { name: "Google test sign-in" }).click();
  await expect(page).toHaveURL(/\/planning$/);
  expect(submissions).toBe(1);
  const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(storage.local["adhd.session.v1"]).toBe(JSON.stringify({ version: 1 }));
  expect(JSON.stringify(storage)).not.toContain("synthetic-google-proof");
  expect(JSON.stringify(storage)).not.toContain("accessToken");
  expect(faults).toEqual([]);
});

test("Google signup requires terms and ignores a stale callback after terms are withdrawn", async ({ page }) => {
  await config(page);
  await page.route("https://accounts.google.com/gsi/client", route => {
    expect(route.request().headers().referer).toBe(`${new URL(page.url()).origin}/`);
    return route.fulfill({ contentType: "text/javascript", body: sdk });
  });
  let submissions = 0;
  await page.route("**/api/auth/session/google", async route => {
    submissions++;
    await route.fulfill({ json: user });
  });
  await page.goto("/register");
  await expect(page.getByText("Google ile devam etmek için Kullanım Koşulları’nı kabul et.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Google test sign-in" })).toHaveCount(0);
  const terms = page.getByRole("checkbox", { name: "Kullanım Koşulları’nı kabul ediyorum." });
  await terms.check();
  await expect(page.getByRole("button", { name: "Google test sign-in" })).toBeVisible();
  await terms.uncheck();
  await expect(page.getByRole("button", { name: "Google test sign-in" })).toHaveCount(0);
  await page.evaluate(() =>
    (
      window as unknown as { testGisConfig: { callback: (response: { credential: string }) => void } }
    ).testGisConfig.callback({ credential: "stale-proof" }),
  );
  expect(submissions).toBe(0);
});

test("a blocked GIS script leaves password login available", async ({ page }) => {
  await config(page);
  await page.route("https://accounts.google.com/gsi/client", route => route.abort("failed"));
  await page.goto("/login");
  await expect(page.getByRole("alert").filter({ hasText: "Google ile giriş yüklenemedi" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Giriş yap", exact: true })).toBeEnabled();
  await expect(page.getByLabel("E-posta", { exact: true })).toBeEnabled();
});

test("disabled Google config does not request the SDK", async ({ page }) => {
  await config(page, false);
  const requests: string[] = [];
  page.on("request", request => {
    if (request.url().includes("accounts.google.com")) requests.push(request.url());
  });
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Giriş yap", exact: true })).toBeVisible();
  await expect(page.getByText("Google giriş seçeneği kontrol ediliyor…")).toHaveCount(0);
  await expect(page.locator(".google-auth-divider")).toBeHidden();
  expect(requests).toEqual([]);
});

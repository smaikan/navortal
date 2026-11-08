import http from "node:http";
import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { sessionCookie, signIn, signOutFromMenu } from "./helpers/session";
import { EVIDENCE } from "./helpers/evidence";

test("strict CSP diagnostics in report-only, then enforced inline-script blocking with working theme and navigation", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    const events: { directive: string; disposition: string }[] = [];
    Object.assign(window, { __cspEvents: events });
    document.addEventListener("securitypolicyviolation", e =>
      events.push({ directive: e.effectiveDirective, disposition: e.disposition }),
    );
    localStorage.setItem("ui-theme", "dark");
  });
  const ran = () =>
    page.evaluate(() => (window as Window & { __untrustedScriptRan?: boolean }).__untrustedScriptRan === true);
  const events = () =>
    page.evaluate(
      () => (window as Window & { __cspEvents?: { directive: string; disposition: string }[] }).__cspEvents ?? [],
    );
  let reportOnly = true;
  await page.route("**/csp-test-report", route => route.fulfill({ status: 204, body: "" }));
  // Yalnız sahipli test belgesine parser tarafından okunacak sahte saldırı kodu eklenir.
  await page.route("**/login", async route => {
    if (!route.request().isNavigationRequest()) return route.continue();
    const r = await route.fetch();
    const headers = r.headers();
    if (reportOnly) {
      headers["content-security-policy-report-only"] =
        headers["content-security-policy"] + "; report-uri /csp-test-report";
      delete headers["content-security-policy"];
    }
    delete headers["content-length"];
    delete headers["content-encoding"];
    const body = (await r.text()).replace("</body>", "<script>window.__untrustedScriptRan = true</script></body>");
    await route.fulfill({ response: r, headers, body });
  });
  await page.goto("/login");
  await expect(page.getByRole("textbox", { name: "E-posta", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await ran()).toBe(true);
  await expect
    .poll(async () => (await events()).some(e => e.directive.startsWith("script-src") && e.disposition === "report"))
    .toBe(true);
  reportOnly = false;
  await page.goto("/login");
  await expect(page.getByRole("textbox", { name: "E-posta", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await ran()).toBe(false);
  await expect
    .poll(async () => (await events()).some(e => e.directive.startsWith("script-src") && e.disposition === "enforce"))
    .toBe(true);
  await page.unroute("**/login");
  await page.getByRole("link", { name: "Ücretsiz hesap oluştur", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Kendi alanını oluştur" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const a = await request.get("/login", {
    headers: { "x-nonce": "attacker", "content-security-policy": "script-src 'unsafe-inline'" },
  });
  const b = await request.get("/login");
  const policyA = a.headers()["content-security-policy"];
  const policyB = b.headers()["content-security-policy"];
  expect(policyA).not.toBe(policyB);
  expect(policyA).not.toContain("attacker");
  expect(policyA.split(";").find(x => x.trim().startsWith("script-src"))).not.toMatch(/unsafe-inline|unsafe-eval/);
  const html = await a.text();
  const nonce = /'nonce-([^']+)'/.exec(policyA)![1];
  expect(html.includes(`nonce="${nonce}"`)).toBe(true);
});

test("security headers protect HTML, errors and redirects without caching private API data", async ({ request }) => {
  for (const path of ["/login", "/register", "/planning", "/security-check-not-found"]) {
    const r = await request.get(path);
    expect(r.status()).toBe(path.includes("not-found") ? 404 : 200);
    expect(r.headers()["x-frame-options"]).toBe("DENY");
    expect(r.headers()["x-content-type-options"]).toBe("nosniff");
    expect(r.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(r.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  }
  const reset = await request.get("/reset-password?unexpected=1", { maxRedirects: 0 });
  expect(reset.status()).toBe(303);
  expect(new URL(reset.headers().location, reset.url()).pathname).toBe("/reset-password");
  expect(new URL(reset.headers().location, reset.url()).search).toBe("");
  expect(reset.headers()["referrer-policy"]).toBe("no-referrer");
  expect(reset.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  const api = await request.get("/api/auth/me");
  expect(api.status()).toBe(401);
  expect(api.headers()["cache-control"]).toContain("no-store");
  expect(api.headers()["x-content-type-options"]).toBe("nosniff");
  // Sayfa CSP'si API'nin kendi profil-görsel politikasına yayılmıyor.
  expect(api.headers()["content-security-policy"]).toBeUndefined();
});

test("a foreign origin cannot frame the login form", async ({ page, baseURL }) => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(
      `<html lang="en"><title>Owned frame host</title><iframe src="${baseURL}/login" title="target"></iframe></html>`,
    );
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    // Pozitif kontrol: yalnız test yanıtından iki frame korumasını kaldırınca form açılmalı.
    await page.route("**/login", async route => {
      const response = await route.fetch();
      const headers = response.headers();
      delete headers["x-frame-options"];
      headers["content-security-policy"] = headers["content-security-policy"].replace(/frame-ancestors[^;]+;?/, "");
      await route.fulfill({ response, headers });
    });
    await page.goto(`http://localhost:${address.port}`);
    await expect(page.frameLocator("iframe").getByRole("textbox", { name: "E-posta", exact: true })).toBeVisible();
    await page.unroute("**/login");
    let denied = false;
    page.on("console", msg => {
      if (/frame|ancestor/i.test(msg.text()) && /refused|denied|violate/i.test(msg.text())) denied = true;
    });
    page.on("requestfailed", r => {
      if (r.url() === `${baseURL}/login`) denied = true;
    });
    await page.goto(`http://localhost:${address.port}`);
    await expect
      .poll(
        () =>
          denied ||
          page.frames().some(f => /chrome-error|webkit-error|about:blank/.test(f.url()) && f !== page.mainFrame()),
      )
      .toBe(true);
    await expect(page.frameLocator("iframe").getByRole("textbox", { name: "E-posta", exact: true })).toHaveCount(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("failed logout-all clears the UI and warns while another real browser session stays active", async ({
  page,
  browser,
}) => {
  const fx = await FocusFixture.create();
  const second = await browser.newContext();
  try {
    await fx.login(page);
    await page.goto("/planning");
    await expect(page.getByRole("button", { name: /^Bildirimler/ })).toBeVisible();
    const before = (await sessionCookie(page.context()))!.value;
    await signIn(second, fx.token);
    const remote = await second.newPage();
    await remote.goto("/planning");
    await expect(remote.getByRole("button", { name: /^Bildirimler/ })).toBeVisible();
    let posts = 0;
    await page.route("**/api/auth/logout-all", route => {
      posts++;
      return route.fulfill({ status: 503, body: "" });
    });
    await page.goto("/settings?section=account");
    await page.getByRole("button", { name: "Tüm cihazlardan çık", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Tüm cihazlardan çıkılsın mı?" })
      .getByRole("button", { name: "Tüm cihazlardan çık", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Hesabına giriş yap" })).toBeVisible();
    await expect(page.getByText(/Sunucudaki oturumun kapatıldığı doğrulanamadı/)).toBeVisible();
    await expect(page.getByText(/Diğer cihazlardaki oturumlar açık kalmış olabilir/)).toBeVisible();
    await expect(page.locator(".workspace-shell")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("adhd.session.v1"))).toBeNull();
    expect((await sessionCookie(page.context()))?.value === before).toBe(true);
    expect(posts).toBe(1);
    await remote.reload();
    await expect(remote.getByRole("button", { name: /^Bildirimler/ })).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Sunucudaki oturumun kapatıldığı doğrulanamadı/)).toHaveCount(0);
  } finally {
    await second.close();
    await fx.api.dispose();
  }
});

test("failed current logout reports uncertainty and never silently retries", async ({ page }) => {
  const fx = await FocusFixture.create();
  try {
    await fx.login(page);
    await page.goto("/planning");
    let posts = 0;
    await page.route("**/api/auth/logout", route => {
      posts++;
      return route.fulfill({ status: 403, body: "" });
    });
    await signOutFromMenu(page);
    await expect(page.getByRole("heading", { name: "Hesabına giriş yap" })).toBeVisible();
    await expect(page.getByText(/Sunucudaki oturumun kapatıldığı doğrulanamadı/)).toBeVisible();
    await expect(page.getByText(/Diğer cihazlardaki oturumlar açık kalmış olabilir/)).toHaveCount(0);
    expect(posts).toBe(1);
  } finally {
    await fx.api.dispose();
  }
});

test("security public HTTP timing samples", async ({ request }, info) => {
  const rows = [];
  for (const path of ["/", "/login", "/planning"]) {
    await request.get(path);
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const r = await request.get(path);
      expect(r.status()).toBe(200);
      samples.push(Math.round((performance.now() - start) * 100) / 100);
    }
    const median = [...samples].sort((a, b) => a - b)[2];
    rows.push({ path, samplesMs: samples, medianMs: median });
  }
  writeFileSync(
    `${EVIDENCE}/security-http-timings-${info.project.name}.json`,
    JSON.stringify({ kind: "owned-production-anonymous-http-total-not-lcp", rows }, null, 2),
  );
});

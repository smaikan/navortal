import { assertSignedInAccount } from "./helpers/session";
import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readResetCode } from "../../src/features/auth/reset-code";
import { EVIDENCE } from "./helpers/evidence";

test("real SMTP reset is private, single-use, expires, and ends existing access JWT", async ({
  page,
  request,
}, info) => {
  const email = `reset-${randomUUID()}@example.test`;
  const password = randomUUID();
  const registered = await request.post("http://127.0.0.1:5181/api/auth/register", { data: { email, password } });
  expect(registered.status()).toBe(201);
  const auth = (await registered.json()) as { accessToken: string; user: { id: string } };
  const mailboxHeaders = { "X-UI-Fixture-Key": process.env.ADHD_UI_MAILBOX_KEY! };
  async function mailboxLink() {
    const response = await request.post("http://127.0.0.1:5527/latest", {
      headers: mailboxHeaders,
      data: { recipient: email },
    });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { resetLink: string };
    const url = new URL(body.resetLink);
    expect(
      url.origin === (process.env.UI_E2E_BASE_URL ?? "http://127.0.0.1:3400") &&
        url.pathname === "/reset-password" &&
        url.search === "",
    ).toBe(true);
    const code = readResetCode(url.hash);
    expect(code !== null).toBe(true);
    return { link: body.resetLink, code: code! };
  }
  async function openLink(target: Page, link: string, code: string) {
    await target.goto("/");
    // Gerçek sır içeren URL Playwright kayıtlarına girmesin diye yerel gezinme kullanıyoruz.
    await target.evaluate(url => {
      window.location.assign(url);
    }, link);
    await expect(target.getByRole("heading", { name: "Yeni parolanı belirle" })).toBeVisible();
    expect(await target.evaluate(() => window.location.hash === "" && window.location.search === "")).toBe(true);
    expect((await target.content()).includes(code)).toBe(false);
    expect(
      await target.evaluate(
        value =>
          JSON.stringify(window.history.state).includes(value) ||
          Object.values(localStorage).some(item => item.includes(value)),
        code,
      ),
    ).toBe(false);
  }

  // SMTP kapalı gerçek uç kimlik saymayan 202 döndürür. Ekran teslim edildi demez.
  await page.goto("/forgot-password");
  await page.getByLabel("E-posta", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Sıfırlama bağlantısı iste" }).click();
  await expect(page.getByRole("heading", { name: "E-postanı kontrol edebilirsin" })).toBeVisible();
  await expect(
    page.getByText(
      "Hesabın uygunsa sıfırlama bağlantısı gönderilecek. Bu mesaj e-postanın teslim edildiğini doğrulamaz.",
      { exact: true },
    ),
  ).toBeVisible();
  const disabled = await request.post("http://127.0.0.1:5527/latest", {
    headers: mailboxHeaders,
    data: { recipient: email },
  });
  expect(disabled.status()).toBe(404);

  // SMTP testi aynı izole DB'yi kullanan ikinci gerçek Kestrel sürecidir.
  await page.route("**/api/auth/**", async route => {
    const url = new URL(route.request().url());
    const host = url.host;
    url.port = "5181";
    // Aynı kaynak UI proxy gibi iletilen host, CSRF aynı-host kontrolünü anlamlı tutar.
    const response = await route.fetch({
      url: url.href,
      headers: { ...route.request().headers(), "x-forwarded-host": host },
    });
    await route.fulfill({ response });
  });
  await page.goto("/forgot-password");
  await page.getByLabel("E-posta", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Sıfırlama bağlantısı iste" }).click();
  await expect(page.getByRole("heading", { name: "E-postanı kontrol edebilirsin" })).toBeVisible();
  const one = await mailboxLink();
  await openLink(page, one.link, one.code);
  await page.getByLabel("Yeni parola", { exact: true }).fill("12345");
  await page.getByRole("button", { name: "Parolayı güncelle" }).click();
  await expect(page.getByText("Parola en az 6 karakter olmalı.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Yeni parola", { exact: true })).toBeFocused();
  const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(a11y.violations).toEqual([]);
  expect(a11y.incomplete).toEqual([]);
  await page.getByLabel("Yeni parola", { exact: true }).fill("");
  await page.screenshot({ path: `${EVIDENCE}/reset-form-${info.project.name}.png`, fullPage: true });
  const replacement = " abcde ";
  await page.getByLabel("Yeni parola", { exact: true }).fill(replacement);
  await page.getByRole("button", { name: "Parolayı güncelle" }).click();
  await expect(page.getByRole("heading", { name: "Parolan güncellendi" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Parolan güncellendi" })).toBeFocused();

  await openLink(page, one.link, one.code);
  await page.getByLabel("Yeni parola", { exact: true }).fill("654321");
  await page.getByRole("button", { name: "Parolayı güncelle" }).click();
  await expect(page.getByRole("heading", { name: "Bu bağlantı kullanılamıyor" })).toBeVisible();
  await page.goto("/login");
  await page.getByLabel("E-posta", { exact: true }).fill(email);
  await page.getByLabel("Parola", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("E-posta veya parola hatalı");
  await page.getByLabel("Parola", { exact: true }).fill(replacement);
  await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
  await assertSignedInAccount(page, email);

  await page.goto("/forgot-password");
  await page.getByLabel("E-posta", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Sıfırlama bağlantısı iste" }).click();
  await expect(page.getByRole("heading", { name: "E-postanı kontrol edebilirsin" })).toBeVisible();
  const two = await mailboxLink();
  const expired = await request.post("http://127.0.0.1:5527/expire", {
    headers: mailboxHeaders,
    data: { userId: auth.user.id, tokenHash: createHash("sha256").update(two.code).digest("hex").toUpperCase() },
  });
  expect(expired.status()).toBe(200);
  await openLink(page, two.link, two.code);
  await page.getByLabel("Yeni parola", { exact: true }).fill("654321");
  await page.getByRole("button", { name: "Parolayı güncelle" }).click();
  await expect(page.getByRole("heading", { name: "Bu bağlantı kullanılamıyor" })).toBeVisible();
  const existing = await request.get("http://127.0.0.1:5181/api/auth/me", {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });
  // Başarılı parola sıfırlama hesabın bütün oturumlarını kapatır.
  expect(existing.status()).toBe(401);
});

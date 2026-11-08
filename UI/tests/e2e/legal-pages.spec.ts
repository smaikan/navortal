import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { legalLinks } from "../../src/features/legal/links";
import { EVIDENCE } from "./helpers/evidence";
import { FocusFixture } from "./helpers/focus-fixture";
import { openAccountMenu } from "./helpers/session";

for (const { href, label } of legalLinks) {
  test(`legal page is public, readable and accessible: ${href}`, async ({ page }, info) => {
    const privateReads: string[] = [];
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/")) privateReads.push(path);
    });
    const response = await page.goto(href);
    expect(response?.status()).toBe(200);
    await expect(page.locator("main h1")).toContainText(href === "/cookies" ? "Çerezler" : label);
    await expect(page.locator("main nav a[aria-current=page]")).toHaveAttribute("href", href);
    await expect(page.getByRole("contentinfo").getByRole("link", { name: label, exact: true })).toHaveAttribute(
      "href",
      href,
    );
    await expect(page.getByRole("complementary", { name: "Metin durumu" })).toHaveCount(0);
    await expect(page.getByText("info@navortal.com.tr").or(page.getByText("Sürüm 3")).first()).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    for (const theme of ["light", "dark"]) {
      await page.evaluate(value => {
        document.documentElement.dataset.theme = value;
      }, theme);
      const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      writeFileSync(
        `${EVIDENCE}/legal-axe-${href.slice(1)}-${theme}-${info.project.name}.json`,
        JSON.stringify({ violations: audit.violations, incomplete: audit.incomplete }, null, 2),
      );
      expect(audit.violations).toEqual([]);
      expect(audit.incomplete).toEqual([]);
    }
    if (info.project.name === "mobile-chromium") await page.setViewportSize({ width: 320, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `${EVIDENCE}/legal-${href.slice(1)}-${info.project.name}.png`, fullPage: true });
    expect(privateReads).toEqual([]);
  });
}

test("registration separates terms from notice, keeps drafts when reading and sends no account request without acceptance", async ({
  page,
  context,
}, info) => {
  let posts = 0;
  let sent: unknown;
  await page.route("**/api/auth/session/register", async route => {
    posts++;
    sent = route.request().postDataJSON();
    await route.abort("failed");
  });
  await page.goto("/register");
  const terms = page.getByRole("checkbox", { name: /Kullanım Koşulları/ });
  const form = page.locator("form");
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  await expect(page.getByText("Rutinler", { exact: true })).toHaveCount(0);
  await expect(form.getByRole("link", { name: /KVKK Aydınlatma Metni/ })).toHaveAttribute("href", "/privacy-notice");
  await expect(terms).not.toBeChecked();
  await page.getByLabel("E-posta", { exact: true }).fill("legal-form@example.test");
  await page.getByLabel("Parola", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Hesap oluştur", exact: true }).click();
  await expect(terms).toBeFocused();
  await expect(page.getByText("Devam etmek için Kullanım Koşulları’nı kabul et.", { exact: true })).toBeVisible();
  expect(posts).toBe(0);
  const popupReady = context.waitForEvent("page");
  await form.getByRole("link", { name: /Koşulları oku/ }).click();
  const popup = await popupReady;
  await expect(popup.locator("main h1")).toHaveText("Kullanım Koşulları");
  await popup.close();
  await expect(page.getByLabel("E-posta", { exact: true })).toHaveValue("legal-form@example.test");
  await expect(page.getByLabel("Parola", { exact: true })).toHaveValue("123456");
  await expect(terms).not.toBeChecked();
  await terms.focus();
  await page.keyboard.press("Space");
  await expect(terms).toBeChecked();
  await page.screenshot({ path: `${EVIDENCE}/legal-register-${info.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Hesap oluştur", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Hesabının oluşup oluşmadığı doğrulanamadı");
  expect(posts).toBe(1);
  expect(sent).toEqual({ email: "legal-form@example.test", password: "123456" });
  await expect(page.getByRole("button", { name: "Hesap oluştur", exact: true })).toBeDisabled();
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Hesabına giriş yap" })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Gizlilik ve kullanım" }).getByRole("link")).toHaveCount(5);
  expect(posts).toBe(1);
});

test("account menu and settings provide the same five legal documents", async ({ page }) => {
  const owner = await FocusFixture.create();
  try {
    await owner.login(page);
    await page.goto("/planning");
    await openAccountMenu(page);
    await page.getByRole("menuitem", { name: "Gizlilik ve kullanım", exact: true }).click();
    await expect(page.locator("main h1")).toHaveText("KVKK Aydınlatma Metni");
    await expect(page.locator("main nav").getByRole("link")).toHaveCount(5);
    await page.goto("/settings?section=privacy");
    await expect(page.getByRole("dialog", { name: "Ayarlar" })).toBeVisible();
    const navigation = page.getByRole("navigation", { name: "Gizlilik ve kullanım" });
    for (const { href, label } of legalLinks)
      await expect(navigation.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);
    await navigation.getByRole("link", { name: "Gizlilik", exact: true }).click();
    await expect(page.locator("main h1")).toHaveText("Gizlilik");
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Ayarlar", exact: true })).toBeVisible();
  } finally {
    await owner.clean();
    await owner.api.dispose();
  }
});

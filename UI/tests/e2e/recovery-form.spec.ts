import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { EVIDENCE } from "./helpers/evidence";

test("recovery form validation and unavailable service remain usable", async ({ page }, info) => {
  await page.goto("/forgot-password");
  await page.getByRole("button", { name: "Sıfırlama bağlantısı iste" }).click();
  await expect(page.getByLabel("E-posta", { exact: true })).toBeFocused();
  await expect(page.getByText("E-posta adresini yaz.", { exact: true })).toBeVisible();
  await page.route("**/api/auth/forgot-password", route =>
    route.fulfill({ status: 503, contentType: "application/problem+json", json: { status: 503 } }),
  );
  await page.getByLabel("E-posta", { exact: true }).fill("unavailable@example.test");
  await page.getByRole("button", { name: "Sıfırlama bağlantısı iste" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("şu anda ulaşılamıyor");
  await expect(page.getByRole("main").getByRole("alert")).toBeFocused();
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(result.violations).toEqual([]);
  expect(result.incomplete).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/recovery-unavailable-${info.project.name}.png`, fullPage: true });
});

test("reset without a code and legacy query never render the query value", async ({ page, request }) => {
  const legacyCode = "0".repeat(64); // Yapay geçersiz kod, e-posta kutusundan gelen sır değil.
  const response = await request.get(`/reset-password?token=${legacyCode}`, { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers().location.endsWith("/reset-password")).toBe(true);
  expect((await response.text()).includes(legacyCode)).toBe(false);
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "Bu bağlantı kullanılamıyor" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bu bağlantı kullanılamıyor" })).toBeFocused();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(result.violations).toEqual([]);
  expect(result.incomplete).toEqual([]);
});

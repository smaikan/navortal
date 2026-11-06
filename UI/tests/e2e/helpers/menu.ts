import type { Locator, Page } from "@playwright/test";

/** İkincil işlem menüde. Adıyla menüyü açıp değişmeyen erişilebilir adıyla öğeyi seçiyoruz. */
export async function menuAction(scope: Page | Locator, menu: string, item: string) {
  const page = "page" in scope ? scope.page() : scope;
  await scope.getByRole("button", { name: menu, exact: true }).first().click();
  await page.getByRole("menu", { name: menu, exact: true }).getByRole("menuitem", { name: item, exact: true }).click();
}

/** Bugün satırı menüsünün adı görev başlığı + plan öğesi menüsü. Taşıma, ayrıntı ve kaldırma burada. */
export const blockAction = (scope: Page | Locator, title: string, item: string) =>
  menuAction(scope, `${title} plan öğesi menüsü`, item);

export const planMenu = (
  scope: Page | Locator,
  item:
    | "Görev Ertele"
    | "Gün sonunu gözden geçir"
    | "Sakin görünüm: kapalı, aç"
    | "Sakin görünüm: açık, kapat"
    | "Acil işe geç",
) => menuAction(scope, "Plan menüsü", item);

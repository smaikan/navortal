import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { expect, test, request as apiRequest, type APIRequestContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./helpers/session";
import type { Task } from "../../src/features/tasks/model";
import { EVIDENCE } from "./helpers/evidence";
import { trackFaults } from "./helpers/faults";
import { registerFixture } from "./helpers/fixture-account";

// F7: kök "Görev ekle" satırında alt görev taslağı; tek atomik istek, belirsiz sonuçta aynı anahtarla elle tekrar.
let setup: APIRequestContext;
let token: string;
const roots = async () =>
  ((await (await setup.get("/api/tasks/children?limit=100")).json()).items as Task[]).map(x => x.title);
const children = async (parentId: string) =>
  (await (await setup.get(`/api/tasks/children?parentId=${parentId}`)).json()).items as Task[];
const rootTask = async (text: string) =>
  ((await (await setup.get("/api/tasks/children?limit=100")).json()).items as Task[]).find(x => x.title === text)!;
const detail = (page: Page, text: string) => page.getByRole("button", { name: `${text} ayrıntısını aç`, exact: true });

test.beforeAll(async () => {
  const register = await apiRequest.newContext({ baseURL: "http://127.0.0.1:5182" });
  const auth = await registerFixture(register, "/api/auth/register", {
    data: { email: `add-tree-${randomUUID()}@example.test`, password: randomUUID() },
  });
  expect(auth.status()).toBe(201);
  token = (await auth.json()).accessToken;
  setup = await apiRequest.newContext({
    baseURL: "http://127.0.0.1:5182",
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  await register.dispose();
});
test.afterAll(async () => {
  await setup?.dispose();
});

test("draft row menu reverses indentation and removes a parent while retaining its written children", async ({
  page,
}) => {
  const run = randomUUID().slice(0, 6);
  await signIn(page, token);
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Görev ekle", exact: true }).click();
  await page.getByRole("textbox", { name: "Yeni görev adı", exact: true }).fill(`Düzenlenen taslak ${run}`);
  await page.getByRole("button", { name: "Yeni göreve alt görev ekle", exact: true }).click();
  const first = page.getByRole("textbox", { name: "1. alt görev adı, 1. seviye", exact: true });
  await first.fill(`Hazırlık ${run}`);
  const second = page.getByRole("textbox", { name: "2. alt görev adı, 1. seviye", exact: true });
  await second.fill(`Kontrol ${run}`);
  await second.press("Tab");
  await expect(page.getByRole("textbox", { name: "2. alt görev adı, 2. seviye", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(second).toBeFocused();
  await expect(second).toHaveValue(`Kontrol ${run}`);
  await second.press("Tab");

  const actions = page.getByRole("button", { name: `Kontrol ${run} taslak işlemleri`, exact: true });
  await expect(actions).toBeVisible();
  await actions.click();
  await page.getByRole("menuitem", { name: "Bir seviye yukarı al", exact: true }).click();
  await expect(second).toBeFocused();
  await page.getByRole("button", { name: `Kontrol ${run} altına alt görev ekle`, exact: true }).click();
  await page.getByRole("textbox", { name: "3. alt görev adı, 2. seviye", exact: true }).fill(`Korunan alt adım ${run}`);
  await actions.click();
  await page.getByRole("menuitem", { name: "Kaldır", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "2. alt görev adı, 1. seviye", exact: true })).toHaveValue(
    `Korunan alt adım ${run}`,
  );
  await expect(first).toBeFocused();
  await page.getByRole("button", { name: "Ekle", exact: true }).click();
  await expect(detail(page, `Düzenlenen taslak ${run}`)).toBeVisible();
  const saved = await children((await rootTask(`Düzenlenen taslak ${run}`)).id);
  expect(saved.map(task => task.title)).toEqual([`Hazırlık ${run}`, `Korunan alt adım ${run}`]);
});

test("the final empty draft row can be removed by Backspace or its menu without discarding the title", async ({
  page,
}) => {
  await signIn(page, token);
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Görev ekle", exact: true }).click();
  const title = page.getByRole("textbox", { name: "Yeni görev adı", exact: true });
  const plus = page.getByRole("button", { name: "Yeni göreve alt görev ekle", exact: true });
  await plus.click();
  await page.getByRole("textbox", { name: "1. alt görev adı, 1. seviye", exact: true }).press("Backspace");
  await expect(page.getByRole("textbox", { name: /alt görev adı/ })).toHaveCount(0);
  await expect(title).toBeFocused();
  await title.fill("Korunacak ana görev");
  await plus.click();
  await page.getByRole("button", { name: "1. satır taslak işlemleri", exact: true }).click();
  await page.getByRole("menuitem", { name: "Kaldır", exact: true }).click();
  await expect(title).toBeFocused();
  await expect(title).toHaveValue("Korunacak ana görev");
  await expect(page.getByRole("textbox", { name: /alt görev adı/ })).toHaveCount(0);
  await plus.click();
  const first = page.getByRole("textbox", { name: "1. alt görev adı, 1. seviye", exact: true });
  await first.fill("Yazılan görev");
  await page.getByRole("textbox", { name: "2. alt görev adı, 1. seviye", exact: true }).press("Backspace");
  await expect(first).toBeFocused();
  await expect(page.getByRole("textbox", { name: /alt görev adı/ })).toHaveCount(1);
  await first.press("End");
  await first.press("Backspace");
  await expect(first).toHaveValue("Yazılan göre");
  // Editing the last filled row keeps the existing automatic next-empty-row behavior.
  await expect(page.getByRole("textbox", { name: /alt görev adı/ })).toHaveCount(2);
  await first.press("Escape");
  await expect(page.getByRole("button", { name: "Görev ekle", exact: true })).toBeVisible();
});

test("add row opens only the title with a plus; subtasks nest and save once; unknown result is retried only by the user with the same key", async ({
  page,
}, info) => {
  const faults: string[] = [];
  trackFaults(page, faults);
  const phone = info.project.name.includes("mobile");
  const run = randomUUID().slice(0, 6);
  await signIn(page, token);
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Görev ekle", exact: true }).click();
  const titleField = page.getByRole("textbox", { name: "Yeni görev adı", exact: true });
  await expect(titleField).toBeFocused();
  // Alt görev alanı kendiliğinden açılmaz; ad alanının sağında "+" vardır.
  await expect(page.getByRole("textbox", { name: /alt görev adı/ })).toHaveCount(0);
  const plus = page.getByRole("button", { name: "Yeni göreve alt görev ekle", exact: true });
  await expect(plus).toBeVisible();
  const field = await titleField.boundingBox(),
    button = await plus.boundingBox();
  expect(button!.x).toBeGreaterThan(field!.x + field!.width - 2);
  expect(Math.abs(button!.y + button!.height / 2 - (field!.y + field!.height / 2))).toBeLessThan(4);

  // Alt görevsiz Enter bugünkü gibi tek görevi hemen kaydeder.
  await titleField.fill(`Tek görev ${run}`);
  await titleField.press("Enter");
  await expect(detail(page, `Tek görev ${run}`)).toBeVisible();
  await expect(titleField).toHaveValue("");
  await expect(titleField).toBeFocused();

  // "+" ilk alt görev satırını açar; yazınca altında sıradaki boş satır açılır.
  await titleField.fill(`Tez ${run}`);
  await plus.click();
  const first = page.getByRole("textbox", { name: "1. alt görev adı, 1. seviye", exact: true });
  await expect(first).toBeFocused();
  // İlk alt görev de ad alanının altında girintili durur (iç içe satırlarla aynı adım).
  expect((await first.boundingBox())!.x).toBeGreaterThan((await titleField.boundingBox())!.x + 10);
  await first.fill(`Tablolar ${run}`);
  const second = page.getByRole("textbox", { name: "2. alt görev adı, 1. seviye", exact: true });
  await expect(second).toBeVisible();
  if (phone) {
    // Mobilde Tab yerine satırdaki "+" alt görev açar.
    await page.getByRole("button", { name: `Tablolar ${run} altına alt görev ekle`, exact: true }).click();
    const nested = page.getByRole("textbox", { name: "2. alt görev adı, 2. seviye", exact: true });
    await expect(nested).toBeFocused();
    await nested.fill(`Tablo 1 ${run}`);
    // ⋯ menüsü: boş kalan satırı kaldır.
    await page.getByRole("button", { name: "3. satır taslak işlemleri", exact: true }).click();
    await page.getByRole("menuitem", { name: "Kaldır", exact: true }).click();
    await expect(page.getByRole("textbox", { name: /^3\. alt görev adı/ })).toHaveCount(0);
  } else {
    await second.fill(`Tablo 1 ${run}`);
    await second.press("Tab");
    await expect(page.getByRole("textbox", { name: "2. alt görev adı, 2. seviye", exact: true })).toBeFocused();
    // Shift+Tab geri alır, Tab yeniden alt görev yapar.
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("textbox", { name: "2. alt görev adı, 1. seviye", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("textbox", { name: "2. alt görev adı, 2. seviye", exact: true })).toBeFocused();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const axe = await new AxeBuilder({ page })
    .include(".r2-add-draft")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  writeFileSync(
    `${EVIDENCE}/axe-add-tree-${info.project.name}.json`,
    JSON.stringify({ violations: axe.violations, incomplete: axe.incomplete }, null, 2),
  );
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/add-tree-${info.project.name}.png` });

  // İlk gönderim sunucuya ulaşır ama yanıt kaybolur: taslak kalır, otomatik tekrar yok.
  const keys: string[] = [];
  let lose = true;
  await page.route("**/api/tasks/tree", async route => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    if (!lose) return route.continue();
    lose = false;
    await route.fetch();
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Ekle", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Kaydedildi mi anlaşılamadı" })).toBeVisible();
  await expect(titleField).toHaveValue(`Tez ${run}`);
  await expect(page.getByRole("textbox", { name: "1. alt görev adı, 1. seviye", exact: true })).toHaveValue(
    `Tablolar ${run}`,
  );
  await page.waitForTimeout(500);
  expect(keys).toHaveLength(1);
  // Kullanıcı yeniden ekler: aynı anahtar, sunucu tekrar oluşturmaz.
  await page.getByRole("button", { name: "Ekle", exact: true }).click();
  await expect(detail(page, `Tez ${run}`)).toBeVisible();
  await expect(titleField).toHaveValue("");
  await expect(page.getByRole("textbox", { name: /alt görev adı/ })).toHaveCount(0);
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  expect((await roots()).filter(x => x === `Tez ${run}`)).toHaveLength(1);
  const root = await rootTask(`Tez ${run}`);
  expect(root.hasDirectWork).toBe(false);
  const level1 = await children(root.id);
  expect(level1.map(x => x.title)).toEqual([`Tablolar ${run}`]);
  expect((await children(level1[0].id)).map(x => x.title)).toEqual([`Tablo 1 ${run}`]);

  // Esc vazgeçer; ekleme düğmesi geri gelir.
  await titleField.fill(`Vazgeçilen ${run}`);
  await plus.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Görev ekle", exact: true })).toBeVisible();
  expect(await roots()).not.toContain(`Vazgeçilen ${run}`);
  expect(faults.filter(x => !/api\/tasks\/tree|ERR_FAILED/.test(x))).toEqual([]);
});

import { randomUUID } from "node:crypto";
import { expect, test, request as apiRequest, type APIRequestContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./helpers/session";
import { EVIDENCE } from "./helpers/evidence";
import { trackFaults } from "./helpers/faults";
import { registerFixture } from "./helpers/fixture-account";

// Kart seç: saatsiz işlerden birini ortadaki pencerede gösterir, tekrar seçer ve başlatır.
let setup: APIRequestContext;
let token: string;
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
async function plan(title: string) {
  const created = await setup.post("/api/tasks", { data: { title } });
  expect(created.status()).toBe(201);
  const task = await created.json();
  expect((await setup.post(`/api/daily-plans/${day}/items`, { data: { taskId: task.id } })).status()).toBe(201);
  return task;
}

test.beforeAll(async () => {
  const register = await apiRequest.newContext({ baseURL: "http://127.0.0.1:5182" });
  const auth = await registerFixture(register, "/api/auth/register", {
    data: { email: `card-${randomUUID()}@example.test`, password: randomUUID() },
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

test("Kart seç picks an untimed task in a centered dialog, picks again and starts it", async ({ page }, info) => {
  const faults: string[] = [];
  trackFaults(page, faults);
  const run = randomUUID().slice(0, 6);
  const titles = [`Birinci ${run}`, `İkinci ${run}`];
  for (const title of titles) await plan(title);
  await signIn(page, token);
  await page.goto(`/planning?date=${day}`);
  const open = page.getByRole("button", { name: "Kart seç", exact: true });
  await open.click();
  const dialog = page.getByRole("dialog", { name: "Kart seç", exact: true });
  const title = dialog.locator(".card-pick-title");
  await expect(title).toBeVisible();
  const first = (await title.textContent())!;
  expect(titles).toContain(first);
  const box = await dialog.boundingBox();
  const width = page.viewportSize()!.width;
  expect(Math.abs(box!.x + box!.width / 2 - width / 2)).toBeLessThan(4);
  // Tekrar seçim aynı görevi vermez.
  await dialog.getByRole("button", { name: "Tekrar kart seç", exact: true }).click();
  await expect(title).toHaveText(titles.find(x => x !== first)!);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const axe = await new AxeBuilder({ page })
    .include(".card-pick")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${EVIDENCE}/card-pick-${info.project.name}.png` });
  // Esc kapatır ve odak düğmeye döner; plan değişmez.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  const started = page.waitForRequest(r => r.method() === "POST" && new URL(r.url()).pathname.includes("/api/work"));
  await dialog.getByRole("button", { name: "Başlat", exact: true }).click();
  await started;
  await expect(dialog).toHaveCount(0);
  expect(faults).toEqual([]);
});

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { expect, test, request as apiRequest, type APIRequestContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./helpers/session";
import type { Task } from "../../src/features/tasks/model";
import { EVIDENCE } from "./helpers/evidence";
import { trackFaults } from "./helpers/faults";
import { registerFixture } from "./helpers/fixture-account";

// Görev ayrıntısındaki Alt görevler bölümü, kompakt zaman alanları ve etiketsiz sınıflandırma satırları.
let setup: APIRequestContext;
let token: string;
async function create(title: string): Promise<Task> {
  const r = await setup.post("/api/tasks", { data: { title } });
  expect(r.status()).toBe(201);
  return r.json();
}
async function child(parentId: string, title: string): Promise<Task> {
  const parent = await setup.get(`/api/tasks/${parentId}`);
  const r = await setup.post(`/api/tasks/${parentId}/children`, {
    data: { parentVersion: (await parent.json()).version, title, parentWorkDisposition: "PreserveDirect" },
  });
  expect(r.status()).toBe(201);
  return r.json();
}
const get = async (id: string): Promise<Task> => (await setup.get(`/api/tasks/${id}`)).json();
const titles = async (parentId: string) =>
  ((await (await setup.get(`/api/tasks/children?parentId=${parentId}`)).json()).items as Task[]).map(x => x.title);

test.beforeAll(async () => {
  const register = await apiRequest.newContext({ baseURL: "http://127.0.0.1:5182" });
  const auth = await registerFixture(register, "/api/auth/register", {
    data: { email: `subtasks-${randomUUID()}@example.test`, password: randomUUID() },
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

test("task detail lists subtasks with progress, nested toggles, menu and inline add; time is compact and tags are gone", async ({
  page,
}, info) => {
  const faults: string[] = [];
  trackFaults(page, faults);
  await signIn(page, token);
  const run = randomUUID().slice(0, 6);
  const parent = await create(`Ana iş ${run}`);
  const nested = await child(parent.id, `İç içe ${run}`);
  await child(nested.id, `Torun ${run}`);
  const leaf = await child(parent.id, `Yaprak ${run}`);
  await page.goto(`/tasks?taskId=${parent.id}`);
  const section = page.getByRole("region", { name: "Alt görevler", exact: true });
  await expect(section).toBeVisible();
  await expect(section.getByText("0/2", { exact: true })).toBeVisible();
  // Kendi alt görevi olan satır onay kutusu yerine aç/kapat oku gösterir.
  const toggle = section.getByRole("button", { name: `İç içe ${run} alt görevlerini göster`, exact: true });
  await expect(toggle).toBeVisible();
  await expect(section.getByRole("checkbox", { name: `İç içe ${run} tamamlandı` })).toHaveCount(0);
  await toggle.click();
  await expect(section.getByRole("button", { name: `Torun ${run} ayrıntısını aç`, exact: true })).toBeVisible();
  // Yaprak satırı tamamlanır; ilerleme sunucu sayımından yenilenir.
  const box = section.getByRole("checkbox", { name: `Yaprak ${run} tamamlandı`, exact: true });
  await box.check();
  await expect.poll(async () => (await get(leaf.id)).state).toBe("Completed");
  await expect(section.getByText("1/2", { exact: true })).toBeVisible();
  // Menüden alt göreve alt görev eklenir; satır aç/kapat okuna döner.
  await section.getByRole("button", { name: `İç içe ${run} ayrıntısını aç`, exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Alt görev ekle", exact: true }).click();
  const nestedAdd = section.getByRole("textbox", { name: `İç içe ${run} için alt görev ekle`, exact: true });
  await expect(nestedAdd).toBeFocused();
  await nestedAdd.fill(`İkinci torun ${run}`);
  await nestedAdd.press("Enter");
  await expect.poll(() => titles(nested.id)).toContain(`İkinci torun ${run}`);
  await expect(nestedAdd).toHaveValue("");
  // Bölümün altındaki giriş doğrudan bu göreve alt görev ekler.
  const add = section.getByRole("textbox", { name: "Alt görev ekle", exact: true });
  await add.fill(`Yeni alt görev ${run}`);
  await add.press("Enter");
  await expect.poll(() => titles(parent.id)).toContain(`Yeni alt görev ${run}`);
  await expect(add).toHaveValue("");
  await expect(
    section.getByRole("button", { name: `Yeni alt görev ${run} ayrıntısını aç`, exact: true }),
  ).toBeVisible();
  // Etiketler panelde yok; proje, havuz ve kategori satırları seçiciyi doğrudan açar.
  await expect(page.locator(".classification-row dt", { hasText: /^Etiketler$/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Proje seçimini değiştir", exact: true })).toContainText("Seç");
  // Görevin zamanı: başlangıç ve bitiş yan yana.
  const from = await page.getByLabel("başlangıç tarihi", { exact: true }).first().boundingBox();
  const to = await page.getByLabel("bitiş tarihi", { exact: true }).first().boundingBox();
  expect(Math.abs(from!.y - to!.y)).toBeLessThan(2);
  expect(to!.x).toBeGreaterThan(from!.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const axe = await new AxeBuilder({ page })
    .include(".r2-subtasks")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  writeFileSync(
    `${EVIDENCE}/axe-subtasks-${info.project.name}.json`,
    JSON.stringify({ violations: axe.violations, incomplete: axe.incomplete }, null, 2),
  );
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: `${EVIDENCE}/subtasks-${info.project.name}.png` });
  expect(faults).toEqual([]);
});

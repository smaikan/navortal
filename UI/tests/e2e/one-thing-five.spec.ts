import { randomUUID } from "node:crypto";
import { expect, test, request as apiRequest, type APIRequestContext } from "@playwright/test";
import { signIn } from "./helpers/session";
import { trackFaults } from "./helpers/faults";
import { registerFixture } from "./helpers/fixture-account";

// Tek görev kartında "Sadece 5 dakika" seçili görevi onay penceresi beklemeden başlatır ve sayfada kalır.
let setup: APIRequestContext;
let token: string;
test.beforeAll(async () => {
  const register = await apiRequest.newContext({ baseURL: "http://127.0.0.1:5182" });
  const auth = await registerFixture(register, "/api/auth/register", {
    data: { email: `five-${randomUUID()}@example.test`, password: randomUUID() },
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

test("Sadece 5 dakika starts the selected task at once and stays on the day plan", async ({ page }) => {
  const faults: string[] = [];
  trackFaults(page, faults);
  const created = await setup.post("/api/tasks", { data: { title: `Beş dakika ${randomUUID().slice(0, 6)}` } });
  expect(created.status()).toBe(201);
  const task = await created.json();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  expect((await setup.post(`/api/daily-plans/${day}/items`, { data: { taskId: task.id } })).status()).toBe(201);
  await signIn(page, token);
  await page.goto(`/planning?date=${day}&gorunum=tek`);
  const card = page.locator(".one-thing");
  await expect(card.getByRole("heading", { level: 2 })).toHaveText(task.title);
  let starts = 0;
  page.on("request", r => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/support/quick-start") starts++;
  });
  await card.getByRole("button", { name: "Sadece 5 dakika", exact: true }).click();
  await expect
    .poll(async () => (await (await setup.get("/api/focus-sessions/current")).json()).session?.taskId ?? null)
    .toBe(task.id);
  expect(starts).toBe(1);
  // Onay penceresi beklemez, odak ekranına da atlamaz.
  await expect(page.getByRole("dialog", { name: "Beş dakika başla" })).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/planning");
  expect(faults).toEqual([]);
});

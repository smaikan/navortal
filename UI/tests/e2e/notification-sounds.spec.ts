import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { FocusFixture, steady } from "./helpers/focus-fixture";
import { trackFaults } from "./helpers/faults";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";

declare global {
  interface Window {
    __toneFrequencies: number[];
  }
}
let fx: FocusFixture;
const faults = new WeakMap<Page, string[]>();
const frequencies = (page: Page) => page.evaluate(() => window.__toneFrequencies);
const saved = (page: Page) =>
  page.waitForResponse(
    r =>
      new URL(r.url()).pathname === "/api/notifications/preferences" &&
      r.request().method() === "PUT" &&
      r.status() === 200,
  );

test.beforeEach(async ({ page, context }, info) => {
  fx = await FocusFixture.create();
  const messages: string[] = [];
  faults.set(page, messages);
  trackFaults(page, messages);
  // Yenilemeyle ayar okumalarını kesmemek için gezinmeden önce ekliyoruz.
  if (info.title.includes("unavailable audio"))
    await context.addInitScript(() =>
      Object.defineProperty(window, "AudioContext", { value: undefined, configurable: true }),
    );
  await context.addInitScript(() => {
    window.__toneFrequencies = [];
    if (typeof AudioContext === "undefined") return;
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const node = create.call(this),
        set = node.frequency.setValueAtTime.bind(node.frequency);
      node.frequency.setValueAtTime = (value, at) => {
        window.__toneFrequencies.push(value);
        return set(value, at);
      };
      return node;
    };
  });
  await fx.login(page);
  await page.goto("/reminders/preferences");
  await expect(page.getByRole("combobox", { name: "Pomodoro sesi", exact: true })).toBeVisible();
});
test.afterEach(async ({ page }) => {
  await fx.clean();
  await fx.api.dispose();
  expect(faults.get(page)).toEqual([]);
});

test("sound choices: three independent saved choices survive reload, and previews never write preferences", async ({
  page,
}, info) => {
  expect(await frequencies(page)).toEqual([]);
  for (const [label, value] of [
    ["Pomodoro", "glass"],
    ["Hatırlatma", "pulse"],
    ["Görev süresi bitimi", "marimba"],
  ]) {
    const response = saved(page);
    await page.getByRole("combobox", { name: `${label} sesi`, exact: true }).selectOption(value);
    await response;
  }
  const preferences = await (await fx.api.get("/api/notifications/preferences")).json();
  expect(preferences.settings).toMatchObject({
    pomodoroSound: "glass",
    reminderSound: "pulse",
    taskEndSound: "marimba",
  });
  expect(await frequencies(page)).toEqual([]);
  await page.reload();
  for (const [label, value] of [
    ["Pomodoro", "glass"],
    ["Hatırlatma", "pulse"],
    ["Görev süresi bitimi", "marimba"],
  ])
    await expect(page.getByRole("combobox", { name: `${label} sesi`, exact: true })).toHaveValue(value);
  let writes = 0;
  page.on("request", r => {
    if (new URL(r.url()).pathname === "/api/notifications/preferences" && r.method() === "PUT") writes++;
  });
  const expected: number[] = [];
  for (const [label, notes] of [
    ["Pomodoro", [1174.66, 1568, 2349.32]],
    ["Hatırlatma", [440, 660, 440, 660]],
    ["Görev süresi bitimi", [523.25, 659.25, 784]],
  ] as const) {
    const button = page.getByRole("button", { name: `${label} sesini dene`, exact: true });
    await expect(button).toBeEnabled();
    await button.click();
    expected.push(...notes);
    await expect.poll(() => frequencies(page)).toEqual(expected);
    await expect(button).toBeEnabled();
  }
  expect(writes).toBe(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await auditTask(page, "sound-choices", "notification-sounds");
  await page.screenshot({ path: `${EVIDENCE}/sounds-light-${info.project.name}.png`, fullPage: true });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await auditTask(page, "sound-choices-dark", "notification-sounds", "dark");
  await page.screenshot({ path: `${EVIDENCE}/sounds-dark-${info.project.name}.png`, fullPage: true });
});

test("sound choices: real Pomodoro and reminder alerts use their saved patterns without marking them read", async ({
  page,
}) => {
  test.setTimeout(60_000);
  for (const [label, value] of [
    ["Pomodoro", "glass"],
    ["Hatırlatma", "pulse"],
  ]) {
    const response = saved(page);
    await page.getByRole("combobox", { name: `${label} sesi`, exact: true }).selectOption(value);
    await response;
  }
  const baseline = page.waitForResponse(
    r => new URL(r.url()).pathname === "/api/notifications/alerts" && r.status() === 200,
  );
  await page.getByRole("heading", { name: "Bildirim sesleri", exact: true }).click();
  await baseline;
  expect(await frequencies(page)).toEqual([]);
  const focus = await fx.start({ ...steady, workSeconds: 3, soundEnabled: true });
  await expect
    .poll(
      async () => {
        await fx.current();
        return frequencies(page);
      },
      { timeout: 15_000 },
    )
    .toEqual([1174.66, 1568, 2349.32]);
  await fx.clean();
  const created = await fx.api.post("/api/notifications/reminders", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { title: "Farklı hatırlatma sesi", dueAt: new Date(Date.now() + 1800).toISOString() },
  });
  expect(created.status()).toBe(201);
  const reminder = await created.json();
  await expect.poll(() => frequencies(page), { timeout: 15_000 }).toEqual([1174.66, 1568, 2349.32, 440, 660, 440, 660]);
  const items = (await (await fx.api.get("/api/notifications?limit=100")).json()).items;
  expect(items.find((n: { sourceId: string }) => n.sourceId === focus.id)).toMatchObject({
    sound: "glass",
    readAt: null,
  });
  expect(items.find((n: { sourceId: string }) => n.sourceId === reminder.id)).toMatchObject({
    sound: "pulse",
    readAt: null,
  });
});

test("sound choices: a stale save keeps the choice and explicitly reconciles the three fields", async ({ page }) => {
  const p = await (await fx.api.get("/api/notifications/preferences")).json();
  expect(
    (
      await fx.api.put("/api/notifications/preferences", {
        data: { version: p.version, settings: { ...p.settings, reminderSound: "digital" } },
      })
    ).status(),
  ).toBe(200);
  // Yalnız tercih okumalarını donduruyoruz. Canlı eşitleme beklenen çatışmadan önce yeni sürümü almasın.
  await page.route("**/api/notifications/preferences", async route => {
    if (route.request().method() === "GET") await route.fulfill({ json: p });
    else await route.continue();
  });
  await page.reload();
  const conflict = page.waitForResponse(
    r => new URL(r.url()).pathname === "/api/notifications/preferences" && r.status() === 409,
  );
  await page.getByRole("combobox", { name: "Pomodoro sesi", exact: true }).selectOption("pulse");
  await conflict;
  await expect(page.getByRole("combobox", { name: "Pomodoro sesi", exact: true })).toHaveValue("pulse");
  await expect(page.getByRole("combobox", { name: "Pomodoro sesi", exact: true })).toBeDisabled();
  await page.unroute("**/api/notifications/preferences");
  await page.getByRole("button", { name: "Güncel tercihleri kontrol et" }).click();
  await expect(page.getByRole("button", { name: "Seçimlerimi güncel kayda uygula" })).toBeVisible();
  const response = saved(page);
  await page.getByRole("button", { name: "Seçimlerimi güncel kayda uygula" }).click();
  await response;
  const latest = await (await fx.api.get("/api/notifications/preferences")).json();
  expect(latest.settings).toMatchObject({ pomodoroSound: "pulse", reminderSound: "digital", taskEndSound: "digital" });
});

test("sound choices: unavailable audio reports a local message and still saves sound preferences", async ({ page }) => {
  await page.getByRole("button", { name: "Pomodoro sesini dene", exact: true }).click();
  await expect(
    page.getByText("Ses açılamadı. Tarayıcı izinlerini kontrol edip yeniden dene.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workspace-shell")).toBeVisible();
  await expect(page.getByText("Bu ekran açılamadı", { exact: false })).toHaveCount(0);
  const response = saved(page);
  await page.getByRole("combobox", { name: "Pomodoro sesi", exact: true }).selectOption("pulse");
  await response;
  expect((await (await fx.api.get("/api/notifications/preferences")).json()).settings.pomodoroSound).toBe("pulse");
});

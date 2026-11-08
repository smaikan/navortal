import { test, expect, type Page } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { trackFaults } from "./helpers/faults";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { syncConnected } from "./helpers/live-sync";
import { rewriteExtensionText } from "./helpers/extension-text";

let fx: FocusFixture;
const stage = (page: Page) => page.getByRole("region", { name: "Güncel pomodoro", exact: true });
const start = (page: Page) => page.getByRole("dialog", { name: "Pomodoro başlat", exact: true });

test("pomodoro: extension text replacement cannot crash bottom bar pause and resume", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const original = await fx.start();
  await page.goto("/focus");
  await expect(stage(page).getByRole("timer")).toBeVisible();
  const player = page.locator("#work-player-slot");
  for (let i = 0; i < 2; i++) {
    for (const [label, next, state] of [
      ["Duraklat", "Devam et", "Paused"],
      ["Devam et", "Duraklat", "Working"],
    ] as const) {
      const button = player.getByRole("button", { name: label, exact: true });
      await expect(button).toBeEnabled();
      expect(await rewriteExtensionText(button)).toBeGreaterThan(0);
      await button.click();
      await expect(player.getByRole("button", { name: next, exact: true })).toBeVisible();
      await expect.poll(async () => (await fx.current())!.state).toBe(state);
      await expect(stage(page).getByRole("timer")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Bu ekran açılamadı", exact: true })).toHaveCount(0);
      await expect(page).toHaveURL(/\/focus$/);
    }
  }
  expect((await fx.current())!.workSessionId).toBe(original.workSessionId);
  expect(errors).toEqual([]);
});
test.beforeEach(async ({ page }) => {
  fx = await FocusFixture.create();
  await fx.login(page);
  if (process.env.UI_E2E_EDGE === "1") {
    const userAgent = await page.evaluate(() => navigator.userAgent);
    expect(userAgent).toContain("Edg/");
    await test.info().attach("edge-runtime", { body: userAgent, contentType: "text/plain" });
  }
});
test.afterEach(async () => {
  await fx.api.dispose();
});

test("navigation: clean browser records cold and warm workspace transitions without a render error", async ({
  page,
}, info) => {
  await page.goto("/focus");
  await expect(page.getByRole("heading", { name: "Pomodoro", exact: true })).toBeVisible();
  const samples: { pass: string; path: string; milliseconds: number }[] = [];
  for (const pass of ["first", "warm"]) {
    for (const [path, heading] of [
      ["/calendar", "Takvim"],
      ["/planning", "Gün Planlama"],
      ["/focus", "Pomodoro"],
    ]) {
      const begin = performance.now();
      await page.locator(`a[href="${path}"]:visible`).first().click();
      await expect(page.getByRole("heading", { name: heading, exact: true, level: 1 })).toBeVisible();
      samples.push({ pass, path, milliseconds: Math.round(performance.now() - begin) });
      await expect(page.getByRole("heading", { name: "Bu ekran açılamadı", exact: true })).toHaveCount(0);
    }
  }
  writeFileSync(
    `${EVIDENCE}/navigation-clean-${info.project.name}.json`,
    JSON.stringify(
      { kind: "owned-production-without-extensions", includesPlaywrightAndHostScheduling: true, samples },
      null,
      2,
    ),
  );
});

async function backdrop(page: Page) {
  const old = page.viewportSize()!;
  // Telefonda panel bütün ekranı kaplar. Dış alan tıklamasını tablette de deniyoruz.
  if (old.width < 768) await page.setViewportSize({ width: 900, height: old.height });
  await page.mouse.click(10, 100);
  if (old.width < 768) await page.setViewportSize(old);
}

test("pomodoro: failed cold form chunk stays local, sends no start and can recover after reconnect", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/focus");
  await expect(page.getByRole("button", { name: "25/5", exact: false })).toBeEnabled();
  await syncConnected(page);
  const directory = resolve(process.env.UI_E2E_BUILD_DIR ?? ".local/next-e2e", "static/chunks");
  const chunks = new Set(
    readdirSync(directory).filter(
      name => name.endsWith(".js") && readFileSync(resolve(directory, name), "utf8").includes("Pomodoroyu başlat"),
    ),
  );
  expect(chunks.size).toBeGreaterThan(0);
  let fail = true,
    blocked = 0,
    posts = 0;
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/focus-sessions") posts++;
  });
  await page.route("**/_next/static/chunks/*.js", async route => {
    if (fail && chunks.has(new URL(route.request().url()).pathname.split("/").at(-1)!)) {
      blocked++;
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "25/5", exact: false }).click();
  await expect(start(page).getByRole("alert")).toContainText("Form yüklenemedi");
  await expect(page.getByRole("heading", { name: "Pomodoro", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bu ekran açılamadı", exact: true })).toHaveCount(0);
  expect(blocked).toBeGreaterThan(0);
  expect(posts).toBe(0);
  fail = false;
  await start(page).getByRole("button", { name: "Formu yeniden yükle", exact: true }).click();
  await expect(start(page).getByRole("button", { name: "Pomodoroyu başlat", exact: true })).toBeEnabled();
  await start(page).getByRole("button", { name: "Pomodoroyu başlat", exact: true }).click();
  await expect(start(page)).toBeHidden();
  await expect(stage(page).getByRole("timer")).toBeVisible();
  expect(posts).toBe(1);
  expect(errors).toEqual([]);
});

test("pomodoro: compact stage, two start types, automatic close and repeated pause/resume stay on screen", async ({
  page,
}, info) => {
  const faults: string[] = [];
  trackFaults(page, faults);
  await page.goto("/focus");
  await expect(page.getByRole("heading", { name: "Pomodoro", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bilgi", exact: true }).click();
  const help = page.getByRole("dialog", { name: "Pomodoro nedir?" });
  await expect(help).toContainText("kısa molalarla");
  await help.getByRole("heading", { name: "Pomodoro nedir?", exact: true }).click();
  await expect(help).toBeVisible();
  await backdrop(page);
  await expect(help).toBeHidden();
  await page.getByRole("button", { name: "25/5", exact: false }).click();
  await expect(start(page).getByLabel("Başlatma türü").locator("option")).toHaveText(["Genel odak", "Görev seç"]);
  await start(page).getByRole("button", { name: "Pomodoroyu başlat", exact: true }).click();
  await expect(start(page)).toBeHidden();
  await expect(stage(page).getByRole("timer")).toBeVisible();
  await expect(stage(page)).toContainText("Çalışma süresi");
  await expect(stage(page).getByText("Bu döngüde gerçek çalışma")).toHaveCount(0);
  await expect(stage(page).getByText("Ayrıntı", { exact: true })).toHaveCount(0);
  await expect(
    stage(page).getByRole("button", { name: /Dikkat notu|Notları aç|hedef sesini etkinleştir/ }),
  ).toHaveCount(0);
  const first = (await fx.current())!;
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const [button, state] of [
      ["Odağı duraklat", "Paused"],
      ["Odağa devam et", "Working"],
    ] as const) {
      await stage(page).getByRole("button", { name: button, exact: true }).click();
      await expect(page.getByRole("dialog", { name: button, exact: true })).toHaveCount(0);
      await expect.poll(async () => (await fx.current())!.state).toBe(state);
      await expect(stage(page).getByRole("timer")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Bu ekran açılamadı" })).toHaveCount(0);
    }
  }
  expect((await fx.current())!.workSessionId).toBe(first.workSessionId);
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(value => (document.documentElement.dataset.theme = value), theme);
    await auditTask(page, `pomodoro-${theme}`, "pomodoro", theme);
    await page.screenshot({ path: `${EVIDENCE}/pomodoro-${theme}-${info.project.name}.png`, fullPage: true });
  }
  expect(faults).toEqual([]);
});

test("pomodoro: task list scrolls past 25 without search/pages; unknown start retains one key until receipt closes the sheet", async ({
  page,
}) => {
  const tasks: { id: string; title: string }[] = [];
  for (let i = 0; i < 28; i++) tasks.push(await fx.task());
  await page.goto("/focus");
  await page.getByRole("button", { name: "25/5", exact: false }).click();
  const dialog = start(page);
  await dialog.getByLabel("Başlatma türü").selectOption("task");
  await expect(dialog.getByRole("searchbox")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /^(Önceki|Sonraki) sayfa$/ })).toHaveCount(0);
  const choices = dialog.getByRole("group", { name: "Görev seç", exact: true });
  await expect(choices.getByRole("radio")).toHaveCount(25);
  await choices.evaluate(el => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(choices.getByRole("radio")).toHaveCount(28);
  await choices.getByRole("radio").last().check();
  const selected = await choices.getByRole("radio").last().inputValue();
  const keys: string[] = [],
    bodies: string[] = [];
  await page.route("**/api/focus-sessions", async route => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    bodies.push(route.request().postData()!);
    if (keys.length === 1) {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await dialog.getByRole("button", { name: "Pomodoroyu başlat", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("sonucu alınamadı");
  await backdrop(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Aynı odak başlatmayı güvenle yeniden dene" }).click();
  await expect(dialog).toBeHidden();
  expect(keys).toHaveLength(2);
  expect(new Set(keys).size).toBe(1);
  expect(new Set(bodies).size).toBe(1);
  expect((await fx.current())!.taskId).toBe(selected);
  expect((await (await fx.api.get(`/api/tasks/${selected}`)).json()).state).not.toBe("Completed");
  await expect(stage(page).getByRole("timer")).toBeVisible();
});

test("matrix: importance headings, two cards per desktop row, shared info and outside dismissal", async ({
  page,
}, info) => {
  for (let i = 0; i < 2; i++) {
    const task = await fx.task();
    const board = await (await fx.api.get("/api/matrix")).json();
    expect(
      (
        await fx.api.post(`/api/matrix/items/${task.id}`, { data: { version: board.version, quadrant: "Do" } })
      ).status(),
    ).toBe(200);
  }
  await page.goto("/matrix");
  const lane = page.locator('[data-matrix-area="Do"]');
  await expect(lane.getByRole("heading", { name: "Önemli · Acil", exact: true })).toBeVisible();
  await expect(page.getByText("Nasıl kullanılır?", { exact: true })).toHaveCount(0);
  if (info.project.name !== "mobile-chromium") {
    const boxes = await lane.locator(".matrix-card").evaluateAll(elements =>
      elements.map(el => {
        const r = el.getBoundingClientRect();
        return { top: r.top, left: r.left };
      }),
    );
    expect(Math.abs(boxes[0].top - boxes[1].top)).toBeLessThan(2);
    expect(boxes[1].left).toBeGreaterThan(boxes[0].left);
  }
  await page.getByRole("button", { name: "Bilgi", exact: true }).click();
  const help = page.getByRole("dialog", { name: "Eisenhower Matrisi nedir?" });
  await expect(help).toContainText("her acil iş önemli olmayabilir");
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await page.getByRole("button", { name: "Görev seç", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Matrise görev seç" });
  await expect(picker).toBeVisible();
  await backdrop(page);
  await expect(picker).toBeHidden();
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(value => (document.documentElement.dataset.theme = value), theme);
    await auditTask(page, `matrix-${theme}`, "pomodoro-matrix", theme);
    await page.screenshot({ path: `${EVIDENCE}/matrix-${theme}-${info.project.name}.png`, fullPage: true });
  }
  await lane.locator(".matrix-task-title").first().click();
  await expect(page.getByRole("heading", { name: "Görev ayrıntısı", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Görev başlığı", exact: true })).toBeVisible();
  await backdrop(page);
  await expect(page.getByRole("heading", { name: "Görev ayrıntısı", exact: true })).toBeHidden();
});

test("routine: create closes on confirmed receipt and pending writes resist backdrop and Escape", async ({ page }) => {
  await page.goto("/recurrences");
  await page.getByRole("button", { name: "Rutin oluştur", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Rutin oluştur", exact: true });
  await expect(dialog).toBeVisible();
  await backdrop(page);
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Rutin oluştur", exact: true }).click();
  await dialog.getByLabel("Rutin adı", { exact: true }).fill("Sabah okuması");
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route("**/api/recurrence-templates", async route => {
    if (route.request().method() !== "POST") return route.continue();
    await gate;
    await route.continue();
  });
  try {
    await dialog.getByRole("button", { name: "Rutin oluştur", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Kaydediliyor…" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await backdrop(page);
    await expect(dialog).toBeVisible();
  } finally {
    release();
  }
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Sabah okuması serisini aç", exact: true })).toBeVisible();
});

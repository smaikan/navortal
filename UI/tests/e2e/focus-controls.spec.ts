import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { actionLabels, type FocusAction } from "../../src/features/focus/model";
import { FocusFixture, steady } from "./helpers/focus-fixture";
import { EVIDENCE } from "./helpers/evidence";
import { auditTask } from "./helpers/task-audit";
import { trackFaults } from "./helpers/faults";
test.describe.configure({ mode: "default" });
let fx: FocusFixture;
const faults = new WeakMap<Page, string[]>();
const stage = (p: Page) => p.getByRole("region", { name: "Güncel pomodoro", exact: true });
const feedback = (p: Page, action: FocusAction) => p.getByRole("region", { name: actionLabels[action], exact: true });
// Duraklat, devam, sonraki ve bitir sahnede; kalanlar Odak işlemleri menüsünde.
async function act(p: Page, action: FocusAction | string) {
  const name = action in actionLabels ? actionLabels[action as FocusAction] : action;
  const direct = stage(p).getByRole("group", { name: "Odak denetimleri" }).getByRole("button", { name, exact: true });
  if (["pause", "resume", "next", "finish"].includes(action) || (await direct.count())) return direct.click();
  await stage(p).getByRole("button", { name: "Odak işlemleri", exact: true }).click();
  await p.getByRole("menuitem", { name, exact: true }).click();
}
async function visit(p: Page) {
  await p.goto("/focus");
  await expect(stage(p).locator(".focus-state")).toBeVisible();
}
async function command(p: Page, action: FocusAction) {
  const response = p.waitForResponse(
    r => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith(`/${action}`),
  );
  await act(p, action);
  expect((await response).status()).toBe(200);
  await expect(p.getByRole("dialog", { name: actionLabels[action], exact: true })).toHaveCount(0);
  await expect(p.locator(".focus-command-feedback")).toHaveCount(0);
}

async function refresh(p: Page) {
  await act(p, "Güncel odağı kontrol et");
}
test.beforeAll(async () => {
  fx = await FocusFixture.create();
});
test.afterAll(async () => {
  await fx?.api.dispose();
});
test.beforeEach(async ({ page }) => {
  await fx.clean();
  const list: string[] = [];
  faults.set(page, list);
  trackFaults(page, list);
  await fx.login(page);
});
test.afterEach(async ({ page }) => {
  await fx.clean();
  expect(faults.get(page)).toEqual([]);
});

test("real 3-second ContinueTracking reaches target once, keeps actual/overtime and task open; pause/reload/resume exclude the gap", async ({
  page,
}, info) => {
  const task = await fx.task();
  await page.goto("/focus");
  await page.getByRole("button", { name: "Özel ritim" }).click();
  const presetForm = page.getByRole("region", { name: "Özel ritim", exact: true });
  const name = `Kısa döngü ${info.project.name}`;
  await presetForm.getByLabel("Ritmin adı").fill(name);
  await presetForm.getByRole("radio", { name: "Saniye", exact: true }).check();
  await presetForm.getByLabel("Çalışma süresi", { exact: true }).fill("3");
  await presetForm.getByLabel("Kısa mola süresi", { exact: true }).fill("1");
  await presetForm.getByLabel("Uzun mola süresi", { exact: true }).fill("2");
  await presetForm.getByLabel("Kaç döngüde bir uzun mola?").fill("2");
  await presetForm.getByRole("button", { name: "Kaydet ve seç", exact: true }).click();
  // Kaydedilen ritim seçili geliyor; başlatma aynı yerde.
  const start = page.getByRole("region", { name: "Pomodoro başlat", exact: true });
  await expect(start.getByRole("status")).toContainText("kaydedildi");
  await expect(start.getByRole("heading", { name, exact: true })).toBeVisible();
  await start.getByRole("radio", { name: "Bir görev seç", exact: true }).check();
  await start.getByRole("radio", { name: task.title, exact: true }).check();
  await start.getByRole("button", { name: "Pomodoroyu başlat", exact: true }).click();
  await expect(start).toBeHidden();
  const f = (await fx.current())!;
  expect(f.settings.workSeconds).toBe(3);
  expect(f.settings.shortBreakSeconds).toBe(1);
  await expect.poll(async () => (await fx.current())!.effectiveTargetReached).toBe(true);
  const reached = (await fx.current())!;
  await refresh(page);
  await expect(stage(page).locator(".focus-state")).toContainText("Hedefe ulaştın");
  const controls = stage(page).getByRole("group", { name: "Odak denetimleri" });
  await expect(controls.locator("button.primary")).toHaveText("Molaya geç");
  await expect(controls.getByRole("button", { name: "Odağı duraklat", exact: true })).not.toHaveClass(/primary/);
  await auditTask(page, "break-primary", "focus");
  await page.screenshot({ path: `${EVIDENCE}/focus-break-primary-${info.project.name}.png`, fullPage: true });
  await expect.poll(async () => Number((await fx.current())!.overtimeSeconds)).toBeGreaterThan(0);
  expect((await fx.work(f.workSessionId)).state).toBe("Running");
  expect((await (await fx.api.get(`/api/tasks/${task.id}`)).json()).state).toBe("InProgress");
  expect((await fx.current())!.targetEventId).toBe(reached.targetEventId);
  await command(page, "pause");
  const paused = (await fx.current())!;
  const frozen = Number((await fx.work(f.workSessionId)).activeSeconds);
  const text = await stage(page).locator("[data-focus-active]").textContent();
  await page.waitForTimeout(1100);
  expect(Number((await fx.work(f.workSessionId)).activeSeconds)).toBe(frozen);
  await expect(stage(page).locator("[data-focus-active]")).toHaveText(text!);
  await page.reload();
  await expect(stage(page).locator(".focus-state")).toHaveText("Odak duraklatıldı");
  await expect(stage(page).locator(".focus-notice")).toHaveText(
    "Hedefe ulaştın. Görev tamamlanmadı; hazır olduğunda molaya geç.",
  );
  expect((await fx.current())!.id).toBe(f.id);
  await expect(controls.locator("button.primary")).toHaveText("Molaya geç");
  await command(page, "resume");
  expect((await fx.current())!.workSessionId).toBe(f.workSessionId);
  await command(page, "break");
  expect((await fx.current())!.state).toMatch(/^(Break|AwaitingNext)$/);
  writeFileSync(
    `${EVIDENCE}/real-cycle-continue-${info.project.name}.json`,
    JSON.stringify(
      {
        settings: reached.settings,
        reached,
        paused,
        pausedWorkActiveSeconds: frozen,
        clock:
          "real server wall time; no browser clock manipulation; hosted workers disabled by existing Testing environment",
      },
      null,
      2,
    ),
  );
});
test("real 3/1 AutoBreak closes at server observation and waits for explicit next; same work owns the long second-cycle break", async ({
  page,
}, info) => {
  const task = await fx.task();
  const started = await fx.start(
    {
      ...steady,
      workSeconds: 3,
      shortBreakSeconds: 1,
      longBreakSeconds: 2,
      longBreakEvery: 2,
      targetBehavior: "AutoBreak",
    },
    task.id,
  );
  await visit(page);
  await expect.poll(async () => (await fx.current())!.state).toMatch(/Break|AwaitingNext/);
  const observed = (await fx.current())!;
  expect(Date.parse(observed.breakStartedAt!)).toBeGreaterThanOrEqual(Date.parse(observed.targetReachedAt!));
  expect((await fx.work(started.workSessionId)).state).toBe("Paused");
  const before = Number((await fx.work(started.workSessionId)).activeSeconds);
  await expect.poll(async () => (await fx.current())!.state).toBe("AwaitingNext");
  const awaiting = (await fx.current())!;
  expect(Number((await fx.work(started.workSessionId)).activeSeconds)).toBe(before);
  await refresh(page);
  await expect(stage(page).locator(".focus-state")).toContainText("Mola bitti");
  await page.reload();
  await expect(stage(page).locator(".focus-state")).toContainText("Mola bitti");
  await command(page, "next");
  const next = (await fx.current())!;
  expect(next.id).not.toBe(started.id);
  expect(next.previousFocusId).toBe(started.id);
  expect(next.workSessionId).toBe(started.workSessionId);
  expect(next.cycleNumber).toBe(2);
  expect(next.breakTargetSeconds).toBe(2);
  writeFileSync(
    `${EVIDENCE}/real-cycle-auto-${info.project.name}.json`,
    JSON.stringify(
      {
        started,
        observed,
        awaiting,
        next,
        breakExcludedActual: before,
        clock: "real backend evaluation via HTTP; not hosted worker acceptance",
      },
      null,
      2,
    ),
  );
});
test("next click directly skips the break; one work and actual are counted once", async ({ page }) => {
  const task = await fx.task(),
    f = await fx.start(steady, task.id);
  await visit(page);
  await command(page, "break");
  const old = (await fx.current())!;
  await command(page, "next");
  const next = (await fx.current())!;
  expect(next.workSessionId).toBe(f.workSessionId);
  expect(next.previousFocusId).toBe(f.id);
  expect(Number((await fx.detail(f.id)).activeSeconds)).toBe(Number(old.activeSeconds));
  await command(page, "finish");
  const work = await fx.work(f.workSessionId),
    time = await (await fx.api.get(`/api/tasks/${task.id}/time`)).json();
  expect(Number(time.directActualSeconds)).toBe(Number(work.activeSeconds));
  expect((await (await fx.api.get(`/api/tasks/${task.id}`)).json()).state).not.toBe("Completed");
});

test("finish and cancel act immediately and their ACK survives a held current GET", async ({ page }) => {
  for (const action of ["finish", "cancel"] as const) {
    const task = await fx.task(),
      f = await fx.start(steady, task.id);
    await visit(page);
    await expect.poll(async () => Number((await fx.work(f.workSessionId)).activeSeconds)).toBeGreaterThan(0);
    let hold = false,
      release!: () => void;
    const gate = new Promise<void>(r => {
      release = r;
    });
    await page.route(`**/api/focus-sessions/${f.id}/${action}`, async route => {
      hold = true;
      await route.continue();
    });
    await page.route("**/api/focus-sessions/current", async route => {
      if (hold) await gate;
      await route.continue();
    });
    try {
      await command(page, action);
      await expect(page.getByRole("heading", { name: "Ritmini seç", exact: true })).toBeVisible();
    } finally {
      release();
    }
    await page.unroute("**/api/focus-sessions/current");
    await page.unroute(`**/api/focus-sessions/${f.id}/${action}`);
    expect((await fx.detail(f.id)).state).toBe(action === "finish" ? "Finished" : "Interrupted");
    expect(Number((await fx.work(f.workSessionId)).activeSeconds)).toBeGreaterThan(0);
    expect((await (await fx.api.get(`/api/tasks/${task.id}`)).json()).state).not.toBe("Completed");
  }
});

test("stale focus and work versions independently return 409; no new command is silently prepared", async ({
  page,
}) => {
  await fx.start();
  await visit(page);
  for (const key of ["version", "workSessionVersion"] as const) {
    let posts = 0;
    await page.route("**/api/focus-sessions/*/pause", route => {
      posts++;
      const body = route.request().postDataJSON();
      return route.continue({ postData: JSON.stringify({ ...body, [key]: Number(body[key]) + 1 }) });
    });
    await act(page, "pause");
    await expect(feedback(page, "pause").getByRole("alert")).toContainText("başka bir sekmede");
    await expect(stage(page).getByRole("button", { name: actionLabels.pause, exact: true })).toBeDisabled();
    expect(posts).toBe(1);
    expect((await fx.current())!.state).toBe("Working");
    await feedback(page, "pause").getByRole("button", { name: "Geçiş sonucunu kontrol et" }).click();
    await expect(feedback(page, "pause")).toHaveCount(0);
    await page.unroute("**/api/focus-sessions/*/pause");
  }
  await page.route("**/api/focus-sessions/*/pause", async route => {
    await fx.change((await fx.current())!, "pause");
    await route.continue();
  });
  await act(page, "pause");
  await expect(feedback(page, "pause").getByRole("alert")).toContainText("başka bir sekmede");
  await feedback(page, "pause").getByRole("button", { name: "Geçiş sonucunu kontrol et" }).click();
  await expect(feedback(page, "pause")).toHaveCount(0);
  await expect(stage(page).locator(".focus-state")).toContainText("duraklatıldı");
});

test("two tabs converge on focus pause/resume; reload preserves a break and plain work resume interrupts it without a hidden next", async ({
  page,
  context,
}) => {
  const f = await fx.start();
  await visit(page);
  const second = await context.newPage();
  const errors: string[] = [];
  trackFaults(second, errors);
  await visit(second);
  // Her komut kullanıcının o sekmeye geçmesini temsil eder. Edge örtülü sekmeyi yavaşlatabilir;
  // diğer sekmenin arkadayken güncellenmesi ayrıca kontrol ediliyor.
  await page.bringToFront();
  await command(page, "pause");
  await expect(stage(second).locator(".focus-state")).toContainText("duraklatıldı");
  await second.bringToFront();
  await command(second, "resume");
  await expect(stage(page).locator(".focus-state")).toContainText("Odaklanılıyor");
  await page.bringToFront();
  await command(page, "break");
  await page.reload();
  await expect(stage(page).locator(".focus-state")).toContainText("Moladasın");
  await expect(stage(second).locator(".focus-state")).toContainText("Moladasın");
  await second.bringToFront();
  await second
    .getByRole("region", { name: "Çalışma denetimleri" })
    .getByRole("button", { name: "Devam et", exact: true })
    .click();
  await expect.poll(async () => (await fx.detail(f.id)).state).toBe("Interrupted");
  expect(
    (await (await fx.api.get("/api/focus-sessions?limit=100")).json()).items.filter(
      (x: { workSessionId: string }) => x.workSessionId === f.workSessionId,
    ),
  ).toHaveLength(1);
  expect(errors).toEqual([]);
  await second.close();
});
test("unknown direct next replays its original key/body only on an explicit retry", async ({ page }) => {
  await fx.start();
  await visit(page);
  await command(page, "break");
  let lose = true;
  const keys: string[] = [],
    bodies: string[] = [];
  await page.route("**/api/focus-sessions/*/next", async route => {
    keys.push(route.request().headers()["idempotency-key"]);
    bodies.push(route.request().postData()!);
    if (lose) {
      lose = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await act(page, "next");
  const result = feedback(page, "next");
  await expect(result.getByRole("alert")).toContainText("sonucu alınamadı");
  await page.keyboard.press("Escape");
  await expect(result).toBeVisible();
  expect(keys).toHaveLength(1);
  await result.getByRole("button", { name: "Aynı odak geçişini güvenle yeniden dene" }).click();
  await expect(result).toHaveCount(0);
  expect(keys).toHaveLength(2);
  expect(new Set(keys).size).toBe(1);
  expect(new Set(bodies).size).toBe(1);
  expect((await fx.current())!.cycleNumber).toBe(2);
});

test("unknown direct result and malformed receipt are reconciled by GET without a second write", async ({ page }) => {
  for (const action of ["finish", "pause"] as const) {
    await fx.clean();
    const f = await fx.start();
    await visit(page);
    let posts = 0;
    await page.route(`**/api/focus-sessions/${f.id}/${action}`, async route => {
      posts++;
      await route.fetch();
      if (action === "finish") await route.abort("failed");
      else await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await act(page, action);
    const result = feedback(page, action);
    await expect(result.getByRole("alert")).toBeVisible();
    await result.getByRole("button", { name: "Geçiş sonucunu kontrol et" }).click();
    await expect(result).toHaveCount(0);
    expect(posts).toBe(1);
    await page.unroute(`**/api/focus-sessions/${f.id}/${action}`);
    expect((await fx.detail(f.id)).state).toBe(action === "finish" ? "Finished" : "Paused");
  }
});

test("malformed committed start is recoverable by reading current; no new start or task is fabricated", async ({
  page,
}) => {
  await page.goto("/focus");
  await page.locator("button.focus-rhythm").filter({ hasText: "Klasik" }).click();
  let posts = 0;
  await page.route("**/api/focus-sessions", async route => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    await route.fetch();
    await route.fulfill({ status: 201, contentType: "application/json", body: "{}" });
  });
  const dialog = page.getByRole("region", { name: "Pomodoro başlat", exact: true });
  await dialog.getByRole("button", { name: "Pomodoroyu başlat", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("eksik veya geçersiz");
  await dialog.getByRole("button", { name: "Başlatma sonucunu kontrol et" }).click();
  // Okunan güncel odak sayaçta görünüyor; başlatma tekrarlanmıyor.
  await expect(stage(page).getByRole("timer")).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(posts).toBe(1);
  expect((await fx.current())!.taskId).toBeNull();
  await expect(stage(page)).toContainText("Genel odak");
});
test("offline command is not queued; task completion is a separate panel action that closes focus and actual", async ({
  page,
  context,
}) => {
  const task = await fx.task();
  const f = await fx.start(steady, task.id);
  await visit(page);
  let posts = 0;
  page.on("request", r => {
    if (r.method() === "POST" && r.url().includes("/api/focus-sessions/")) posts++;
  });
  await context.setOffline(true);
  await act(page, "pause");
  await expect(feedback(page, "pause").getByRole("alert")).toContainText("Bağlantı yok");
  expect(posts).toBe(0);
  await context.setOffline(false);
  await feedback(page, "pause").getByRole("button", { name: "Mesajı kapat" }).click();
  expect(posts).toBe(0);
  await act(page, "Görevi aç / tamamla…");
  await expect(page.getByLabel("Görev başlığı", { exact: true })).toHaveValue(task.title);
  await page.getByRole("button", { name: "Görevi bitir", exact: true }).click();
  await expect(page.getByRole("button", { name: "Yeniden aç", exact: true })).toBeVisible();
  expect((await fx.work(f.workSessionId)).state).toBe("Finished");
  expect((await fx.detail(f.id)).state).toBe("Finished");
  expect((await (await fx.api.get(`/api/tasks/${task.id}`)).json()).state).toBe("Completed");
});
test("timer stays silent between state changes; reduced motion, keyboard, fullscreen and accessible mobile controls", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fx.start({ ...steady, workSeconds: 60 });
  await visit(page);
  await expect(stage(page).getByRole("timer").first()).toHaveAttribute("aria-live", "off");
  await stage(page)
    .locator(".focus-state")
    .evaluate(el => {
      (window as unknown as { focusAnnouncements: number }).focusAnnouncements = 0;
      new MutationObserver(() => {
        (window as unknown as { focusAnnouncements: number }).focusAnnouncements++;
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
  const old = await stage(page).locator("[data-focus-active]").textContent();
  await expect(stage(page).locator("[data-focus-active]")).not.toHaveText(old!);
  const tick = await stage(page).locator("[data-focus-active]").textContent();
  await expect(stage(page).locator("[data-focus-active]")).not.toHaveText(tick!);
  expect(await page.evaluate(() => (window as unknown as { focusAnnouncements: number }).focusAnnouncements)).toBe(0);
  const pause = stage(page).getByRole("button", { name: actionLabels.pause, exact: true });
  await pause.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: actionLabels.pause, exact: true })).toHaveCount(0);
  await expect(stage(page).getByRole("button", { name: actionLabels.resume, exact: true })).toBeFocused();
  await auditTask(page, "working-controls", "focus-controls");
  await page.screenshot({ path: `${EVIDENCE}/focus-controls-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await act(page, "Tam ekran odak");
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => !!document.fullscreenElement)) ||
        (await stage(page)
          .getByRole("status")
          .filter({ hasText: /Tam ekran açılamadı|tam ekran desteklenmiyor/ })
          .count()) > 0,
    )
    .toBe(true);
  const capability = await page.evaluate(() => ({
    apiAvailable: typeof HTMLElement.prototype.requestFullscreen === "function",
    entered: !!document.fullscreenElement,
  }));
  writeFileSync(`${EVIDENCE}/fullscreen-capability-${info.project.name}.json`, JSON.stringify(capability, null, 2));
  if (capability.entered) {
    // Tam ekranda denetimler kalır. Çıkış aynı Odak işlemleri menüsünde.
    await expect(stage(page).getByRole("button", { name: "Odak işlemleri", exact: true })).toBeVisible();
    await page.screenshot({ path: `${EVIDENCE}/focus-fullscreen-${info.project.name}.png` });
    await act(page, "Tam ekrandan çık");
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  } else
    await expect(
      stage(page)
        .getByRole("status")
        .filter({ hasText: /Tam ekran açılamadı|tam ekran desteklenmiyor/ }),
    ).toBeVisible();
  await command(page, "break");
  await auditTask(page, "break-controls", "focus-controls");
});
test("pomodoro stage omits target audio and note/detail entries even when sound is enabled", async ({ page }) => {
  await fx.start({ ...steady, soundEnabled: true });
  await visit(page);
  await expect(
    stage(page).getByRole("button", { name: /hedef sesini etkinleştir|Dikkat notu|Notları aç/ }),
  ).toHaveCount(0);
  await expect(stage(page).getByText("Ayrıntı", { exact: true })).toHaveCount(0);
});

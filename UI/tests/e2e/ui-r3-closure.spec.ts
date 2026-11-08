import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { EVIDENCE } from "./helpers/evidence";
import { auditTask } from "./helpers/task-audit";
import { trackFaults } from "./helpers/faults";
import { assertR3Reflow } from "./helpers/r3-reflow";

const date = (n = 7) => new Date(Date.now() + n * 86400000 + 10800000).toISOString().slice(0, 10);
function ownedSql(owner: string, work: string, sql: string) {
  const run = readFileSync(".local/e2e-run.lock", "utf8").trim();
  expect(run).toMatch(/^[a-f0-9]{32}$/);
  expect(process.env.PGDATABASE).toBe(`adhd_ui_test_${run}`);
  expect(owner).toMatch(/^[a-f0-9-]{36}$/);
  expect(work).toMatch(/^[a-f0-9-]{36}$/);
  execFileSync(
    process.env.ADHD_UI_TEST_PSQL!,
    ["--no-psqlrc", "--set=ON_ERROR_STOP=1", `--set=owner=${owner}`, `--set=work=${work}`],
    { input: sql, stdio: "pipe", windowsHide: true },
  );
}

{
  let fx: FocusFixture;
  const faults = new WeakMap<Page, string[]>();
  test.beforeEach(async ({ page }) => {
    fx = await FocusFixture.create();
    const list: string[] = [];
    faults.set(page, list);
    trackFaults(page, list);
  });
  test.afterEach(async ({ page }) => {
    try {
      await fx.clean();
      await fx.api.dispose();
    } finally {
      expect(faults.get(page)).toEqual([]);
    }
  });

  test("parallel Today reads still use the day's frozen zone after the preference changes", async ({ page }) => {
    const t = await fx.task();
    const d = await (await fx.api.get(`/api/daily-plans/${date()}`)).json();
    expect(
      (
        await fx.api.post("/api/schedules", {
          headers: { "Idempotency-Key": randomUUID() },
          data: {
            localDate: date(),
            taskId: t.id,
            kind: "Work",
            startsAt: `${date()}T00:30:00+03:00`,
            endsAt: `${date()}T00:55:00+03:00`,
            expectedPlanningVersion: d.planningVersion,
          },
        })
      ).status(),
    ).toBe(201);
    const prefs = await (await fx.api.get("/api/preferences")).json();
    expect(
      (
        await fx.api.put("/api/preferences", {
          data: { version: prefs.version, values: { ...prefs.values, timeZoneId: "America/New_York" } },
        })
      ).status(),
    ).toBe(200);
    expect((await (await fx.api.get(`/api/daily-plans/${date()}`)).json()).timeZoneId).toBe("Europe/Istanbul");
    await fx.login(page);
    await page.goto(`/planning?date=${date()}`);
    const row = page.locator(".r2-plan-row").filter({ hasText: t.title });
    await expect(row).toBeVisible();
    await expect(row).toContainText("00:30");
  });

  for (const choice of ["continue", "finish"] as const)
    test(`five real minutes asks once, ${choice} is explicit and never completes the task`, async ({ page }) => {
      const t = await fx.task();
      const response = await fx.api.post("/api/support/quick-start", {
        headers: { "Idempotency-Key": randomUUID() },
        data: { taskId: t.id },
      });
      expect(response.status()).toBe(201);
      const f = await response.json();
      const owner = (await (await fx.api.get("/api/auth/me")).json()).id;
      ownedSql(
        owner,
        f.workSessionId,
        `BEGIN;
      UPDATE work_sessions SET "StartedAt"=NOW()-interval '302 seconds' WHERE "UserId"=:'owner'::uuid AND "Id"=:'work'::uuid;
      UPDATE work_session_segments SET "StartedAt"=NOW()-interval '302 seconds' WHERE "UserId"=:'owner'::uuid AND "SessionId"=:'work'::uuid AND "EndedAt" IS NULL;
      UPDATE focus_sessions SET "StartedAt"=NOW()-interval '302 seconds' WHERE "UserId"=:'owner'::uuid AND "WorkSessionId"=:'work'::uuid; COMMIT;`,
      );
      expect((await fx.current())!.effectiveTargetReached).toBe(true);
      expect((await fx.work(f.workSessionId)).state).toBe("Running");
      await fx.login(page);
      await page.goto("/focus");
      const question = page.getByRole("region", { name: "Beş dakikadan sonra", exact: true });
      await expect(question).toContainText("Beş dakikalık hedefe ulaştın.");
      if (choice === "continue") {
        await question.getByRole("button", { name: "Devam et", exact: true }).click();
        await expect(question).toHaveCount(0);
        await page.getByRole("button", { name: "Odak işlemleri", exact: true }).click();
        await page.getByRole("menuitem", { name: "Güncel odağı kontrol et", exact: true }).click();
        await expect(question).toHaveCount(0);
        expect((await fx.work(f.workSessionId)).state).toBe("Running");
      } else {
        await question.getByRole("button", { name: "Burada bırakalım", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Odak oturumunu bitir", exact: true })).toHaveCount(0);
        await expect.poll(async () => (await fx.work(f.workSessionId)).state).toBe("Finished");
      }
      expect((await (await fx.api.get(`/api/tasks/${t.id}`)).json()).state).not.toBe("Completed");
    });

  test("a real Ready ReturnToTask is represented by its resume card, with no second foreground push toast", async ({
    page,
  }, info) => {
    await page.addInitScript(() => {
      const calls = { subscriptions: 0, notices: 0, permission: 0 };
      Object.assign(window, { __r3NativeCalls: calls });
      if (typeof PushManager !== "undefined") {
        const original = PushManager.prototype.getSubscription;
        PushManager.prototype.getSubscription = function () {
          calls.subscriptions++;
          return original.call(this);
        };
      }
      if (
        typeof ServiceWorkerRegistration !== "undefined" &&
        typeof ServiceWorkerRegistration.prototype.getNotifications === "function"
      ) {
        const original = ServiceWorkerRegistration.prototype.getNotifications;
        ServiceWorkerRegistration.prototype.getNotifications = function (options) {
          calls.notices++;
          return original.call(this, options);
        };
      }
      if (typeof Notification !== "undefined") {
        const original = Notification.requestPermission;
        Notification.requestPermission = function () {
          calls.permission++;
          return original.call(this);
        };
      }
    });
    const t = await fx.task();
    const prefs = await (await fx.api.get("/api/notifications/preferences")).json();
    expect(
      (
        await fx.api.put("/api/notifications/preferences", {
          data: {
            version: prefs.version,
            settings: {
              ...prefs.settings,
              enabled: true,
              returnToTask: true,
              returnAfterSeconds: 1,
              quietStart: null,
              quietEnd: null,
            },
          },
        })
      ).status(),
    ).toBe(200);
    const start = await fx.api.post("/api/work-sessions/start", {
      headers: { "Idempotency-Key": randomUUID() },
      data: { taskId: t.id },
    });
    expect(start.status()).toBe(201);
    const work = await start.json();
    expect(
      (await fx.api.post(`/api/work-sessions/${work.id}/pause`, { data: { version: work.version } })).status(),
    ).toBe(200);
    let ready: { id: string; snoozeCount: number } | undefined;
    await expect
      .poll(
        async () => {
          ready = (await (await fx.api.get("/api/notifications?limit=100")).json()).items.find(
            (n: { kind: string; sourceId: string; state: string }) =>
              n.kind === "ReturnToTask" && n.sourceId === work.id && n.state === "Ready",
          );
          return !!ready;
        },
        { timeout: 15000 },
      )
      .toBe(true);
    await fx.login(page);
    await page.goto("/planning");
    await expect(page.getByRole("region", { name: "Nerede kalmıştım?", exact: true })).toHaveAttribute(
      "data-resume-work-id",
      work.id,
    );
    const owner = (await (await fx.api.get("/api/auth/me")).json()).id;
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/planner-sw.js", { type: "module" });
      await navigator.serviceWorker.ready;
      dispatchEvent(new Event("planner-push-registered"));
    });
    const moduleProbe = await page.evaluate(async () => {
      const path = "/recipient-store.js";
      return Promise.race([
        import(path).then(
          () => "loaded",
          () => "rejected",
        ),
        new Promise(resolve => setTimeout(() => resolve("pending"), 1000)),
      ]);
    });
    writeFileSync(`${EVIDENCE}/recipient-module-${test.info().project.name}.json`, JSON.stringify({ moduleProbe }));
    // Kalıcı işareti doğrudan okuyoruz. evaluate dinamik modül yüklemesine bağlı kalmasın.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<string | null>((resolve, reject) => {
              const request = indexedDB.open("adhd-push-recipient-v1");
              request.onupgradeneeded = () => {
                request.transaction?.abort();
                reject(new Error("Recipient store not initialized"));
              };
              request.onerror = () => reject(new Error("Recipient store unreadable"));
              request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction("context", "readonly");
                const read = tx.objectStore("context").get("owner");
                let owner: string | null = null;
                read.onsuccess = () => {
                  owner = read.result ?? null;
                };
                tx.oncomplete = () => {
                  db.close();
                  resolve(owner);
                };
                tx.onabort = tx.onerror = () => {
                  db.close();
                  reject(new Error("Recipient read failed"));
                };
              };
            }),
        ),
      )
      .toBe(owner);
    // Sekme mesajı yanıtlamaz; yalnız bildirim ve gün sinyali okumalarını yeniler.
    const observed = page.waitForResponse(
      r => new URL(r.url()).pathname.endsWith("/signals") && r.request().method() === "GET",
    );
    await page.evaluate(
      async ({ owner, ready }) => {
        const reg = await navigator.serviceWorker.ready;
        const channel = new MessageChannel();
        navigator.serviceWorker.dispatchEvent(
          new MessageEvent("message", {
            source: reg.active,
            ports: [channel.port1],
            data: {
              kind: "PLANNER_NOTIFICATION",
              envelope: {
                notificationId: ready.id,
                recipientUserId: owner,
                snoozeCount: ready.snoozeCount,
                tag: `notification:${ready.id}`,
                title: "Navortal",
                body: "Bir hatırlatmanız var.",
                url: `/notifications/${ready.id}`,
                silent: true,
              },
            },
          }),
        );
      },
      { owner, ready: ready! },
    );
    expect((await observed).status()).toBe(200);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.getByText("Bir hatırlatman var.", { exact: true })).toHaveCount(0);
    const card = page.getByRole("region", { name: "Nerede kalmıştım?", exact: true });
    await expect(card).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __r3NativeCalls: object }).__r3NativeCalls)).toEqual({
      subscriptions: 0,
      notices: 0,
      permission: 0,
    });
    const theme = info.project.name === "webkit" ? "dark" : "light";
    await page.evaluate(value => document.documentElement.setAttribute("data-theme", value), theme);
    await assertR3Reflow(page, card.getByRole("button", { name: "Devam et", exact: true }), "resume", info);
    await auditTask(page, "resume-card", "r3-closure", theme);
  });
}

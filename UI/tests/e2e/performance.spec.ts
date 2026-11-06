import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { SESSION_MARKER_KEY } from "../../src/features/auth/session";
import { EVIDENCE } from "./helpers/evidence";

// Açıkça UI_PERFORMANCE_LAB=true ve --project chromium ile çalıştırılır.
if (process.env.UI_PERFORMANCE_LAB === "true") {
  test(
    process.env.UI_PERFORMANCE_LIGHTHOUSE_ONLY === "true"
      ? "production Lighthouse on the existing dense fixture"
      : process.env.UI_READ_API_READY_ONLY === "true"
        ? "read API real mobile readiness on the existing dense fixture"
        : "production performance, dense fixtures, SPA cleanup and isolated timer",
    async ({ page, context, browserName }) => {
      test.setTimeout(1_800_000); // Sekiz adres, iki profil, her birinde üç gerçek Lighthouse ölçümü.
      expect(browserName).toBe("chromium");
      const fx = await FocusFixture.create();
      async function measureReady(date: string) {
        const readyChild = spawn(process.execPath, ["tools/application-ready.mjs"], {
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        });
        readyChild.stdin.end(JSON.stringify({ token: fx.token, date: date, expectedItems: 11 }));
        let readyLog = "";
        readyChild.stdout.on("data", chunk => {
          readyLog += String(chunk);
        });
        readyChild.stderr.on("data", chunk => {
          readyLog += String(chunk);
        });
        const readyCode = await new Promise<number | null>((resolve, reject) => {
          readyChild.once("error", reject);
          readyChild.once("close", resolve);
        });
        writeFileSync(".local/ui-r3-ready.log", readyLog.replaceAll(fx.token, "[redacted]"));
        expect(readyCode, "Owned application ready probe; see ignored log").toBe(0);
      }
      async function measureLighthouse(populatedToday: string | undefined) {
        const child = spawn(process.execPath, ["tools/workspace-lighthouse.mjs"], {
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        });
        child.stdin.end(
          JSON.stringify({
            token: fx.token,
            key: SESSION_MARKER_KEY,
            fixture: {
              bulkTasks: 1000,
              chainDepth: 128,
              plannedDays: 31,
              actualDays: 365,
              ownerScope: "random-owned-test-account",
              todayScenario: populatedToday ? "ten-untimed-one-timed-current-day" : "historical-only-current-day-empty",
            },
          }),
        );
        let stdout = "",
          stderr = "";
        child.stdout.on("data", chunk => {
          stdout += String(chunk);
        });
        child.stderr.on("data", chunk => {
          stderr += String(chunk);
        });
        const code = await new Promise<number | null>((resolve, reject) => {
          child.once("error", reject);
          child.once("close", resolve);
        });
        writeFileSync(".local/ui32-lab.log", (stdout + stderr).replaceAll(fx.token, "[redacted]"));
        expect(code, "See ignored .local/ui32-lab.log and performance-summary.json").toBe(0);
      }
      try {
        const history = await fx.task(),
          chain = await fx.task(),
          current = await fx.task();
        expect(
          (
            await fx.api.put(`/api/tasks/${history.id}/work-definition`, {
              data: {
                version: history.version,
                hasDirectWork: true,
                directEstimatedSeconds: 1_000_000,
                targetBudgetSeconds: null,
              },
            })
          ).status(),
        ).toBe(200);
        const me = await (await fx.api.get("/api/auth/me")).json();
        const run = readFileSync(".local/e2e-run.lock", "utf8").trim();
        if (
          !/^[a-f0-9]{32}$/.test(run) ||
          process.env.PGDATABASE !== `adhd_ui_test_${run}` ||
          process.env.PGHOST !== "127.0.0.1" ||
          !/^[a-f0-9-]{36}$/.test(me.id)
        )
          throw new Error("Owned fixture scope missing");
        const psql = process.env.ADHD_UI_TEST_PSQL;
        if (!psql) throw new Error("Owned psql missing");
        const sql = `INSERT INTO tasks SELECT (jsonb_populate_record(null::tasks,to_jsonb(seed)||jsonb_build_object('Id',gen_random_uuid(),'Title','Yoğun kök '||lpad(i::text,4,'0'),'SortOrder',(i+1000)*1024))).* FROM tasks seed CROSS JOIN generate_series(1,999) i WHERE seed."Id"=:'seed'::uuid AND seed."UserId"=:'owner'::uuid;
      WITH RECURSIVE chain(depth,id,parent) AS (SELECT 1,gen_random_uuid(),:'chain'::uuid UNION ALL SELECT depth+1,gen_random_uuid(),id FROM chain WHERE depth<127)
      INSERT INTO tasks SELECT (jsonb_populate_record(null::tasks,to_jsonb(seed)||jsonb_build_object('Id',chain.id,'ParentTaskId',chain.parent,'Title','Derin '||lpad(chain.depth::text,3,'0'),'SortOrder',1024))).* FROM chain CROSS JOIN tasks seed WHERE seed."Id"=:'chain'::uuid AND seed."UserId"=:'owner'::uuid;`;
        execFileSync(
          psql,
          [
            "--no-psqlrc",
            "--set=ON_ERROR_STOP=1",
            `--set=seed=${history.id}`,
            `--set=chain=${chain.id}`,
            `--set=owner=${me.id}`,
          ],
          { input: sql, stdio: "pipe", windowsHide: true },
        );
        const prefs = await (await fx.api.get("/api/preferences")).json();
        expect(
          (
            await fx.api.put("/api/preferences", {
              data: {
                version: prefs.version,
                values: {
                  ...prefs.values,
                  timeZoneId: "Europe/Istanbul",
                  weekly: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                    dayOfWeek,
                    startMinute: 540,
                    endMinute: 1020,
                  })),
                  exceptions: [],
                },
              },
            })
          ).status(),
        ).toBe(200);
        const firstActual = await fx.api.post("/api/work-sessions/manual", {
          headers: { "Idempotency-Key": randomUUID() },
          data: {
            taskId: history.id,
            startedAt: "2025-01-01T06:00:00Z",
            endedAt: "2025-01-01T06:30:00Z",
            reason: "UI32 owned yearly seed",
          },
        });
        expect(firstActual.status()).toBe(201);
        const session = await firstActual.json();
        const historySql = `WITH generated AS (SELECT n,gen_random_uuid() AS id FROM generate_series(1,364) n), inserted AS (
      INSERT INTO work_sessions SELECT (jsonb_populate_record(null::work_sessions,to_jsonb(seed)||jsonb_build_object('Id',g.id,'StartedAt',seed."StartedAt"+g.n*interval '1 day','EndedAt',seed."EndedAt"+g.n*interval '1 day'))).* FROM work_sessions seed CROSS JOIN generated g WHERE seed."Id"=:'session'::uuid AND seed."UserId"=:'owner'::uuid RETURNING "Id","StartedAt","EndedAt")
      INSERT INTO work_session_segments SELECT (jsonb_populate_record(null::work_session_segments,to_jsonb(seed)||jsonb_build_object('Id',gen_random_uuid(),'SessionId',i."Id",'StartedAt',i."StartedAt",'EndedAt',i."EndedAt"))).* FROM inserted i CROSS JOIN work_session_segments seed WHERE seed."SessionId"=:'session'::uuid AND seed."UserId"=:'owner'::uuid AND NOT seed."IsVoided";`;
        execFileSync(
          psql,
          ["--no-psqlrc", "--set=ON_ERROR_STOP=1", `--set=session=${session.id}`, `--set=owner=${me.id}`],
          { input: historySql, stdio: "pipe", windowsHide: true },
        );
        for (let index = 0; index < 31; index++) {
          const day = new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10);
          const daily = await (await fx.api.get(`/api/daily-plans/${day}`)).json();
          const plan = await fx.api.post("/api/schedules", {
            headers: { "Idempotency-Key": randomUUID() },
            data: {
              localDate: day,
              taskId: history.id,
              kind: "Work",
              startsAt: `${day}T06:00:00Z`,
              endsAt: `${day}T06:30:00Z`,
              isFixed: true,
              expectedPlanningVersion: daily.planningVersion,
            },
          });
          expect(plan.status()).toBe(201);
        }
        expect((await (await fx.api.get("/api/tasks?offset=0&limit=1")).json()).total).toBeGreaterThanOrEqual(1000);
        const year = await (await fx.api.get("/api/analytics/actual?fromDate=2025-01-01&toDate=2025-12-31")).json();
        expect(Number(year.totals.workSeconds)).toBe(365 * 1800);
        let populatedToday: string | undefined;
        if (process.env.UI_PERFORMANCE_TODAY_POPULATED === "true") {
          populatedToday = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Europe/Istanbul",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date());
          for (let index = 0; index < 10; index++) {
            const task = await fx.task();
            expect(
              (await fx.api.post(`/api/daily-plans/${populatedToday}/items`, { data: { taskId: task.id } })).status(),
            ).toBe(201);
          }
          const daily = await (await fx.api.get(`/api/daily-plans/${populatedToday}`)).json();
          expect(
            (
              await fx.api.post("/api/schedules", {
                headers: { "Idempotency-Key": randomUUID() },
                data: {
                  localDate: populatedToday,
                  taskId: history.id,
                  kind: "Work",
                  startsAt: `${populatedToday}T06:00:00Z`,
                  endsAt: `${populatedToday}T06:30:00Z`,
                  isFixed: true,
                  expectedPlanningVersion: daily.planningVersion,
                },
              })
            ).status(),
          ).toBe(201);
        }
        await fx.start(undefined, current.id);
        // Sayaç/ağ ayrımını ölçmeden bu yapay toplu veriyi sakinleştiriyoruz.
        await expect
          .poll(
            async () => {
              let count = 0;
              for (const state of ["Pending", "Processing"])
                count += Number((await (await fx.api.get(`/api/jobs/outbox?state=${state}&limit=1`)).json()).total);
              return count;
            },
            { timeout: 60_000 },
          )
          .toBe(0);
        if (process.env.UI_READ_API_READY_ONLY === "true") {
          if (!populatedToday) throw new Error("Readiness-only requires the populated Today fixture");
          await measureReady(populatedToday);
          return;
        }
        if (process.env.UI_PERFORMANCE_LIGHTHOUSE_ONLY === "true") {
          await measureLighthouse(populatedToday);
          expect((await fx.current())?.state).toBe("Working");
          return;
        }
        await fx.login(page);
        await page.setViewportSize({ width: 1440, height: 900 });
        const cdp = await context.newCDPSession(page);
        await page.goto("/tasks");
        await expect(page.locator("[data-work-timer]").first()).toBeVisible();
        await page.waitForLoadState("networkidle");
        await expect(page.locator("[data-task-row]")).toHaveCount(25);
        await page.evaluate(() => {
          const record = { ticks: 0, main: [] as number[], start: performance.now() };
          Object.assign(window, { __ui32: record });
          const main = document.querySelector("#main")!,
            timer = document.querySelector("[data-work-timer]")!;
          const a = new MutationObserver(() => record.main.push(Math.floor((performance.now() - record.start) / 1000))),
            b = new MutationObserver(() => record.ticks++);
          a.observe(main, { subtree: true, childList: true, characterData: true });
          b.observe(timer, { subtree: true, childList: true, characterData: true });
          Object.assign(window, {
            __ui32stop: () => {
              a.disconnect();
              b.disconnect();
            },
          });
        });
        const reads: string[] = [];
        const listener = (r: import("@playwright/test").Request) => {
          const u = new URL(r.url());
          if (
            r.method() === "GET" &&
            /^\/api\/(work-sessions|focus-sessions|workspace\/snapshot|sync)/.test(u.pathname)
          )
            reads.push(u.pathname);
        };
        page.on("request", listener);
        await page.waitForTimeout(6100);
        page.off("request", listener);
        const timer = await page.evaluate(() => {
          const w = window as unknown as { __ui32: { ticks: number; main: number[] }; __ui32stop: () => void };
          w.__ui32stop();
          return w.__ui32;
        });
        writeFileSync(`${EVIDENCE}/timer-isolation.json`, JSON.stringify({ ...timer, reads }, null, 2));
        expect(timer.ticks).toBeGreaterThanOrEqual(4);
        expect(new Set(timer.main).size).toBeLessThanOrEqual(2);
        expect(reads.length).toBeLessThanOrEqual(2);
        const visits = [
          ["/calendar", "Takvim"],
          ["/focus", "Odak"],
          ["/analytics", "Analiz"],
          ["/settings", "Ayarlar"],
          ["/tasks", "Görevler"],
        ];
        async function cycle() {
          for (const [path, heading] of visits) {
            await page.locator(`.workspace-sidebar a[href="${path}"]`).click();
            await expect(page).toHaveURL(new RegExp(`${path}$`));
            await expect(page.locator("#main h1").first()).toHaveText(heading);
            await page.waitForLoadState("networkidle");
          }
          await expect(page.locator("[data-task-row]")).toHaveCount(25);
          await page.evaluate(
            () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
          );
        }
        const cycles = [];
        for (let index = 0; index < 6; index++) {
          await cycle();
          await cdp.send("HeapProfiler.collectGarbage");
          const globals = await cdp.send("Runtime.evaluate", {
            expression:
              "JSON.stringify([window,document].map(target=>Object.fromEntries(Object.entries(getEventListeners(target)).map(([type,list])=>[type,list.length]))))",
            includeCommandLineAPI: true,
            returnByValue: true,
          });
          cycles.push({
            cycle: index + 1,
            ...(await cdp.send("Memory.getDOMCounters")),
            heap: await cdp.send("Runtime.getHeapUsage"),
            globals: JSON.parse(globals.result.value),
            liveNodes: await page.locator("*").count(),
          });
        }
        const before = cycles[0],
          after = cycles.at(-1)!;
        // Toplam JS dinleyicisine geçici AbortSignal/ağ dinleyicisi de girer. Tek tepe kalıcı sızıntı değildir.
        // Isınmadan sonra temel sayıya dönüş gerekir. Her turda belge/window dinleyicileri ve DOM ayrıca sabit kalmalı.
        const returnedListeners = Math.min(...cycles.slice(3).map(row => row.jsEventListeners));
        writeFileSync(
          `${EVIDENCE}/spa-dom-counters.json`,
          JSON.stringify({ before, after, cycles, returnedListeners, warmupCycles: 3 }, null, 2),
        );
        expect(returnedListeners).toBeLessThanOrEqual(before.jsEventListeners + 8);
        for (const row of cycles) {
          expect(row.globals).toEqual(before.globals);
          expect(row.documents).toBe(before.documents);
          expect(row.nodes).toBeLessThanOrEqual(before.nodes + 100);
          expect(row.liveNodes).toBe(before.liveNodes);
        }
        await page.goto("/planning?date=2025-01-15");
        await expect(page.getByRole("button", { name: "Plan menüsü", exact: true })).toBeEnabled();
        const feedback = [];
        for (let i = 0; i < 20; i++) {
          feedback.push(
            await page.evaluate(
              () =>
                new Promise<number>((resolve, reject) => {
                  const start = performance.now(),
                    observer = new MutationObserver(() => {
                      if (document.querySelector('[role="menu"][aria-label="Plan menüsü"]')) {
                        observer.disconnect();
                        clearTimeout(deadline);
                        requestAnimationFrame(() => resolve(performance.now() - start));
                      }
                    });
                  const deadline = setTimeout(() => {
                    observer.disconnect();
                    reject(new Error("Plan menüsü etkileşim ölçümünde açılmadı."));
                  }, 5000);
                  observer.observe(document.querySelector("#main")!, { subtree: true, childList: true });
                  document.querySelector<HTMLButtonElement>('button[aria-label="Plan menüsü"]')!.click();
                }),
            ),
          );
          await page.keyboard.press("Escape");
        }
        const p95Ms = [...feedback].sort((a, b) => a - b)[Math.ceil(feedback.length * 0.95) - 1];
        writeFileSync(
          `${EVIDENCE}/local-feedback.json`,
          JSON.stringify(
            { kind: "desktop-unthrottled-local-menu-render-not-field-INP", samples: feedback, p95Ms },
            null,
            2,
          ),
        );
        expect(p95Ms).toBeLessThanOrEqual(100);
        await cdp.send("Tracing.start", {
          categories: "devtools.timeline,v8,blink.user_timing",
          transferMode: "ReportEvents",
        });
        const events: unknown[] = [];
        cdp.on("Tracing.dataCollected", data => events.push(...data.value));
        const traceDone = new Promise<void>(resolve => cdp.once("Tracing.tracingComplete", () => resolve()));
        await cycle();
        await cdp.send("Tracing.end");
        await traceDone;
        const trace = JSON.stringify({ traceEvents: events }).replaceAll(fx.token, "[redacted]");
        writeFileSync(`${EVIDENCE}/devtools-navigation-trace.json`, trace);
        if (populatedToday) await measureReady(populatedToday);
        await measureLighthouse(populatedToday);
        expect((await fx.current())?.state).toBe("Working");
      } finally {
        await fx.clean();
        await fx.api.dispose();
      }
    },
  );
}

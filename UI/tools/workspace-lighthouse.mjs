// Bize ait profil ve test DB'sinde anonim/girişli production laboratuvarı.
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve, basename } from "node:path";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { chromium } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { summarizeCpu, summarizeReactTracks } from "./react-trace-summary.mjs";
const input = JSON.parse(readFileSync(0, "utf8"));
if (typeof input.token !== "string" || input.key !== "adhd.session.v1")
  throw new Error("Owned fixture credentials required via stdin.");
const evidence = process.env.UI_EVIDENCE_DIR,
  run = readFileSync(".local/e2e-run.lock", "utf8").trim();
if (!evidence || !/^[a-f0-9]{32}$/.test(run) || process.env.PGDATABASE !== `adhd_ui_test_${run}`)
  throw new Error("Owned runner required.");
const cachedCli = process.env.UI_LIGHTHOUSE_CLI ? resolve(process.env.UI_LIGHTHOUSE_CLI) : null;
if(cachedCli) {
  const pkg=JSON.parse(readFileSync(join(dirname(dirname(cachedCli)),"package.json"),"utf8"));
  if(pkg.name!=="lighthouse" || pkg.version!=="13.5.0") throw new Error("Explicit Lighthouse CLI must be version13.5.0");
}
const origin = "http://127.0.0.1:3400";
let port;
const local = resolve(".local"),
  profile = mkdtempSync(join(local, "performance-chrome-"));
const chromePath =
  process.env.CHROME_PATH ??
  (process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : chromium.executablePath());
const chrome = spawn(
  chromePath,
  [
    "--headless",
    "--remote-debugging-port=0",
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true },
);
let launchFailed = false;
chrome.on("error", () => {
  launchFailed = true;
});
const allRoutes = [
  { name: "public", path: "/", auth: false },
  { name: "auth", path: "/login", auth: false },
  { name: "today", path: process.env.UI_PERFORMANCE_CURRENT_DAY === "true" ? "/planning" : "/planning?date=2025-01-15", auth: true },
  { name: "tree", path: "/tasks", auth: true },
  { name: "calendar", path: "/calendar?date=2025-01-15", auth: true },
  { name: "focus", path: "/focus", auth: true },
  { name: "actual", path: "/analytics?fromDate=2025-01-01&toDate=2025-12-31&bucket=Day", auth: true },
  { name: "plan", path: "/analytics?period=custom&fromDate=2025-01-01&toDate=2025-01-31", auth: true },
];
const wanted = process.env.UI_PERFORMANCE_ROUTES?.split(",") ?? allRoutes.map(route => route.name);
const devices = process.env.UI_PERFORMANCE_DEVICES?.split(",") ?? ["mobile", "desktop"];
if (
  !wanted.length ||
  new Set(wanted).size !== wanted.length ||
  wanted.some(name => !allRoutes.some(route => route.name === name)) ||
  !devices.length ||
  new Set(devices).size !== devices.length ||
  devices.some(device => !["mobile", "desktop"].includes(device))
)
  throw new Error("Invalid explicit lab scope.");
const routes = allRoutes.filter(route => wanted.includes(route.name));
const samples = [],
  summary = {
    kind: "owned-production-cold-cache-lab",
    fieldCwv: false,
    domainAcceptance: false,
    fixture: input.fixture,
    routes: wanted,
    launcher: cachedCli ? "verified-local-lighthouse-13.5.0" : "npm-exec-pinned-13.5.0",
    devices,
    routePaths: Object.fromEntries(routes.map(route => [route.name, route.path])),
    fullMatrix: routes.length === allRoutes.length && devices.length === 2,
    samples,
  };
const save = () => writeFileSync(`${evidence}/performance-summary.json`, JSON.stringify(summary, null, 2) + "\n");
const traceDiagnostics = process.env.UI_PERFORMANCE_TRACE === "true";
const diagnosticTraces = [];
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (launchFailed || chrome.exitCode !== null) throw new Error("Owned Chrome exited.");
    try {
      port = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid owned debug port.");
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise(ok => setTimeout(ok, 100));
  }
  if (!ready) throw new Error("Owned Chrome did not become ready.");
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0],
    preparation = await context.newPage();
  await preparation.goto(origin);
  const cdp = await context.newCDPSession(preparation);
  const runtime = dirname(process.execPath),
    npmCli = join(runtime, "node_modules/npm/bin/npm-cli.js");
  for (const route of routes) {
    // Oturum HttpOnly cookie ve sırsız işaretle. Açık sayfalar çıkış yapılmış çalışır.
    if (route.auth)
      await context.addCookies([
        { name: "adhd_session", value: input.token, url: origin, httpOnly: true, sameSite: "Strict" },
      ]);
    else await context.clearCookies();
    await preparation.evaluate(
      ({ key, auth }) => {
        if (auth) localStorage.setItem(key, JSON.stringify({ version: 1 }));
        else localStorage.removeItem(key);
      },
      { key: input.key, auth: route.auth },
    );
    const probe = await context.newPage();
    await probe.goto(origin + route.path);
    await probe.locator("h1").first().waitFor();
    if (route.auth) {
      // Odak'ta gerçek görünür odak saatini kontrol ediyoruz, R3 çalışma oynatıcısını burada gizler.
      await probe.locator(route.name === "focus" ? '.focus-countdown[role="timer"]' : "[data-work-timer]").first().waitFor();
      if (route.name === "focus") {
        const response = await context.request.get(`${origin}/api/focus-sessions/current`);
        if (!response.ok() || (await response.json()).session?.state !== "Working")
          throw new Error("Owned performance focus is not Working.");
      }
    }
    if (new URL(probe.url()).pathname !== new URL(route.path, origin).pathname)
      throw new Error(`Unexpected lab route redirect: ${route.name}`);
    await probe.close();
    for (const device of devices) {
      for (let sample = 1; sample <= 3; sample++) {
        await cdp.send("Network.clearBrowserCache"); // Yalnız yapay oturum cookie'si korunur. Dosyalar her seferinde soğuk yüklenir.
        const output = `${evidence}/lighthouse-${route.name}-${device}-${sample}.json`;
        // Ham ağ/konsol tanılaması hub sorgu kimliği içerebilir. Yalnız bize ait ignored profilde tutulur.
        const rawOutput = join(profile, traceDiagnostics ? `raw-${route.name}-${device}-${sample}.json` : "raw-lighthouse.json");
        const args = [
          npmCli,
          "exec",
          "--yes",
          "--package=lighthouse@13.5.0",
          "--",
          "lighthouse",
          origin + route.path,
          `--port=${port}`,
          "--disable-storage-reset",
          "--quiet",
          "--output=json",
          `--output-path=${rawOutput}`,
          "--only-categories=performance,accessibility,best-practices,seo",
        ];
        if (device === "desktop") args.push("--preset=desktop");
        if (traceDiagnostics) args.push("--save-assets");
        // Profil derlemesi uzun işleri kaynağa bağlamak için V8 örneği de alır.
        if (traceDiagnostics && process.env.UI_E2E_PROFILE === "true") args.push("--additional-trace-categories=disabled-by-default-v8.cpu_profiler");
        // Playwright CDP dağıtıcısı çalışsın. Bloklayan spawn yeni hedefleri debugger el sıkışmasında bekletir.
        const result = await new Promise((resolveResult, reject) => {
          const child = spawn(process.execPath, cachedCli ? [cachedCli,...args.slice(6)] : args, {
            env: { ...process.env, PATH: `${runtime}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}` },
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          });
          let stdout = "",
            stderr = "";
          child.stdout.on("data", chunk => {
            stdout += chunk;
          });
          child.stderr.on("data", chunk => {
            stderr += chunk;
          });
          const timer = setTimeout(() => {
            stderr += "\nOwned Lighthouse timeout.";
            if (process.platform === "win32" && child.pid)
              spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
            else child.kill();
          }, process.env.UI_E2E_PROFILE === "true" ? 300_000 : 120_000); // CPU örneklemesi profil koşusunu yavaşlatır.
          child.once("error", error => {
            clearTimeout(timer);
            reject(error);
          });
          child.once("close", status => {
            clearTimeout(timer);
            resolveResult({ status, stdout, stderr });
          });
        });
        writeFileSync(
          `.local/ui32-${route.name}-${device}-${sample}.log`,
          ((result.stdout ?? "") + (result.stderr ?? "")).replaceAll(input.token, "[redacted]"),
        );
        if (result.status !== 0)
          throw new Error(`Lighthouse failed: ${route.name}/${device}/${sample}; ignored log retained.`);
        const raw = readFileSync(rawOutput, "utf8");
        const jwtRedactions = raw.split(input.token).length - 1;
        const text = raw.replaceAll(input.token, "[redacted]");
        writeFileSync(output, text);
        unlinkSync(rawOutput);
        const r = JSON.parse(text);
        if (traceDiagnostics) diagnosticTraces.push({ file: rawOutput.replace(/\.json$/, "-0.trace.json"), route: route.name, device, sample, navigationTs: r.audits.metrics?.details?.items?.[0]?.observedNavigationStartTs ?? null });
        if (
          r.runtimeError ||
          new URL(r.finalDisplayedUrl ?? r.finalUrl).pathname !== new URL(route.path, origin).pathname
        )
          throw new Error(`Invalid lab navigation: ${route.name}`);
        const scripts = [
          ...new Set(
            r.audits["network-requests"].details.items.filter(row => row.resourceType === "Script").map(row => row.url),
          ),
        ];
        let jsGzipBytes = 0;
        for (const url of scripts) {
          if (new URL(url).origin !== origin) throw new Error("Unexpected external lab script.");
          const response = await fetch(url);
          if (!response.ok) throw new Error("Measured script unavailable.");
          jsGzipBytes += gzipSync(Buffer.from(await response.arrayBuffer())).length;
        }
        const entry = {
          route: route.name,
          device,
          sample,
          version: r.lighthouseVersion,
          benchmarkIndex: r.environment?.benchmarkIndex ?? null,
          jwtRedactions,
          jsGzipBytes,
          jsBudgetBytes: (route.name === "calendar" ? 550 : route.auth ? 300 : 200) * 1024,
          scriptCount: scripts.length,
          scores: Object.fromEntries(Object.entries(r.categories).map(([key, value]) => [key, value.score])),
          lcpMs: r.audits["largest-contentful-paint"].numericValue,
          cls: r.audits["cumulative-layout-shift"].numericValue,
          tbtMs: r.audits["total-blocking-time"].numericValue,
        };
        samples.push(entry);
        save();
        console.log(JSON.stringify(entry));
      }
    }
  }
  // Çözümleme bütün ölçümlerden sonra. Tanılama ölçüm sırasında CDP dağıtıcısını
  // engellemesin. Ham iz ve kayıtlar bize ait ignored Chrome profilinde kalır,
  // onunla silinir. Olay argümanı dışarı çıkarılmaz.
  for (const diagnostic of diagnosticTraces) {
    try {
      const events = JSON.parse(readFileSync(diagnostic.file, "utf8")).traceEvents;
      const rendererThreads = new Set(events.filter(e => e.ph === "M" && e.name === "thread_name" && e.args?.name === "CrRendererMain").map(e => `${e.pid}:${e.tid}`));
      const taskNames = new Set(["RunTask", "ThreadControllerImpl::RunTask", "TaskQueueManager::ProcessTask"]);
      const safeName = name => /^[A-Za-z0-9_: .()/-]{1,100}$/.test(name) ? name : "other";
      const tasks = events.filter(e => e.ph === "X" && taskNames.has(e.name) && e.dur >= 50000 && rendererThreads.has(`${e.pid}:${e.tid}`)).sort((a, b) => b.dur - a.dur).slice(0, 8);
      const longest = tasks.map(task => ({
        name: safeName(task.name), durationMs: task.dur / 1000, cpuMs: typeof task.tdur === "number" ? task.tdur / 1000 : null,
        startRelativeToNavigationMs: typeof diagnostic.navigationTs === "number" ? (task.ts - diagnostic.navigationTs) / 1000 : null,
        nested: events.filter(e => e.ph === "X" && e !== task && e.pid === task.pid && e.tid === task.tid && e.ts >= task.ts && e.ts + (e.dur ?? 0) <= task.ts + task.dur && e.dur >= 1000).sort((a, b) => b.dur - a.dur).slice(0, 10).map(e => ({ name: safeName(e.name), durationMs: e.dur / 1000 })),
      }));
      writeFileSync(`${evidence}/trace-${diagnostic.route}-${diagnostic.device}-${diagnostic.sample}.json`, JSON.stringify({ kind: "sanitized-renderer-long-task-diagnostic", allRendererCandidates: true, nestedDurationsOverlap: true, rawTraceExported: false, rendererThreads: rendererThreads.size, longest }, null, 2) + "\n");
      // Yalnız profil derlemesinde React izi var. Bileşen adı ve süre çıkar, props asla çıkmaz.
      // Kaymanın anını ve alanını bulmak için yalnız süre ve dikdörtgen sayıları tutulur.
      const shifts = events
        .filter(e => e.name === "LayoutShift" && rendererThreads.has(`${e.pid}:${e.tid}`) && e.args?.data)
        .map(e => ({
          atMs: typeof diagnostic.navigationTs === "number" ? Math.round((e.ts - diagnostic.navigationTs) / 1000) : null,
          score: e.args.data.score,
          hadRecentInput: e.args.data.had_recent_input,
          moved: (e.args.data.impacted_nodes ?? []).map(n => ({ from: n.old_rect, to: n.new_rect })),
        }));
      writeFileSync(`${evidence}/shifts-${diagnostic.route}-${diagnostic.device}-${diagnostic.sample}.json`, JSON.stringify(shifts, null, 2) + "\n");
      if (process.env.UI_E2E_PROFILE === "true") {
        // Mobil Lighthouse CPU'yu yaklaşık 4 kat yavaşlatır. Buradaki 12,5ms üstü iş bile bloklar.
        const longTasks = events.filter(e => e.ph === "X" && taskNames.has(e.name) && e.dur >= 12000 && rendererThreads.has(`${e.pid}:${e.tid}`));
        let cpu;
        try {
          cpu = summarizeCpu(events, { buildDir: process.env.UI_E2E_BUILD_DIR, longTasks, threads: rendererThreads, origin });
          // Çevrimdışı inceleme için küçültülmüş kopya ignored .local'da kalır. Yalnız CPU örneği,
          // React zamanı ve işler var. URL yalnız yoluyla kalır, sorgu değeri yaşayamaz.
          const keep = new Set(["Profile", "ProfileChunk", "TimeStamp", "thread_name", "UpdateLayoutTree", "Layout", "ParseAuthorStyleSheet", "Paint", "EvaluateScript", "v8.compile", "FunctionCall", "TimerFire", "FireAnimationFrame", "ParseHTML", ...taskNames]);
          const reduced = events
            .filter(e => keep.has(e.name))
            .map(e => JSON.parse(JSON.stringify(e).replace(/"(https?:\/\/[^"?#]*)[?#][^"]*"/g, '"$1"')));
          writeFileSync(join(local, `cpu-trace-${diagnostic.route}-${diagnostic.sample}.json`), JSON.stringify({ traceEvents: reduced }));
        } catch (error) {
          cpu = { available: false, failure: String(error?.message ?? error).slice(0, 200) };
        }
        writeFileSync(`${evidence}/react-${diagnostic.route}-${diagnostic.device}-${diagnostic.sample}.json`, JSON.stringify({ kind: "react-tracks-and-cpu-in-long-tasks", longTasks: longTasks.length, react: summarizeReactTracks(events), cpu }, null, 2) + "\n");
      }
    } catch {
      writeFileSync(`${evidence}/trace-${diagnostic.route}-${diagnostic.device}-${diagnostic.sample}.json`, JSON.stringify({ kind: "sanitized-renderer-long-task-diagnostic", available: false, rawTraceExported: false }) + "\n");
    }
  }
  const budgets = routes.flatMap(route =>
    devices.map(device => {
      const rows = samples.filter(row => row.route === route.name && row.device === device),
        sorted = rows.map(row => row.scores.performance).sort((a, b) => a - b);
      return {
        route: route.name,
        device,
        median: sorted[1],
        floor: route.name === "public" ? 0.95 : 0.9,
        samples: rows.length,
        scoresPresent: rows.every(row => Number.isFinite(row.scores.performance)),
        jsPass: rows.every(row => row.jsGzipBytes > 0 && row.jsGzipBytes <= row.jsBudgetBytes),
        lcpPass: rows.every(row => Number.isFinite(row.lcpMs) && row.lcpMs <= 2500),
        clsPass: rows.every(row => Number.isFinite(row.cls) && row.cls <= 0.1),
        seoPass: route.name !== "public" || rows.every(row => row.scores.seo >= 0.95),
      };
    }),
  );
  summary.budgets = budgets;
  summary.complete = samples.length === routes.length * devices.length * 3;
  summary.scopeAccepted =
    summary.complete &&
    budgets.every(
      row =>
        row.samples === 3 &&
        row.scoresPresent &&
        row.median >= row.floor &&
        row.jsPass &&
        row.lcpPass &&
        row.clsPass &&
        row.seoPass,
    );
  summary.accepted = summary.fullMatrix && summary.scopeAccepted;
  save();
  if (!summary.scopeAccepted)
    throw new Error("Performance budget failed; preserve measurements and repair before acceptance.");
} finally {
  if (browser) {
    try {
      const session = await browser.newBrowserCDPSession();
      await session.send("Browser.close");
    } catch {}
  }
  await new Promise(ok => {
    if (chrome.exitCode !== null) return ok();
    const timer = setTimeout(() => {
      chrome.kill();
      ok();
    }, 5000);
    chrome.once("exit", () => {
      clearTimeout(timer);
      ok();
    });
  });
  if (dirname(profile) !== local || !basename(profile).startsWith("performance-chrome-"))
    throw new Error("Refusing profile cleanup outside the owned local directory.");
  rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}

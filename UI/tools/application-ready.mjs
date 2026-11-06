// Yalnız izole laboratuvar. Gerçek CDP yavaşlatması; bu süre Lighthouse'un benzetilmiş LCP'si değil.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const input = JSON.parse(readFileSync(0, 'utf8'));
const run = readFileSync('.local/e2e-run.lock', 'utf8').trim();
if (!/^[a-f0-9]{32}$/.test(run) || process.env.PGDATABASE !== `adhd_ui_test_${run}` || typeof input.token !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date))
  throw new Error('Owned readiness fixture required.');
const evidence = process.env.UI_EVIDENCE_DIR;
if (!evidence) throw new Error('Evidence directory required.');
const origin = 'http://127.0.0.1:3400';
const settings = { cpuRate: 4, latencyMs: 150, downloadBytesPerSecond: 184320, uploadBytesPerSecond: 84375, observationMs: 10000 };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const samples = [];
const save = () => writeFileSync(`${evidence}/application-ready.json`, JSON.stringify({ kind: 'owned-real-cdp-mobile-application-ready', fieldCwv: false, comparableToSimulatedLcp: false, routes: wanted, diagnosticEnabled, sampleCounts, browser: browser.version(), settings, expectedTodayItems: input.expectedItems, samples }, null, 2) + '\n');
const wanted = process.env.UI_APPLICATION_READY_ROUTES?.split(",") ?? ["today","focus","calendar"];
if (!wanted.length || new Set(wanted).size!==wanted.length || wanted.some(name=>!["today","focus","calendar"].includes(name))) throw new Error("Invalid explicit readiness scope");
const diagnosticEnabled=process.env.UI_APPLICATION_READY_DIAGNOSTIC!=="false";
const sampleCounts=JSON.parse(process.env.UI_APPLICATION_READY_SAMPLES??"{}");
if(Object.entries(sampleCounts).some(([name,count])=>!wanted.includes(name)||![1,3].includes(count))) throw new Error("Invalid explicit readiness samples");
try {
  for (const route of [
    { kind: 'today', path: '/planning' },
    { kind: 'focus', path: '/focus' },
    { kind: 'calendar', path: '/calendar?date=2025-01-15' },
  ].filter(route=>wanted.includes(route.kind))) {
    for (let sample = 1; sample <= ((sampleCounts[route.kind]??3)+(route.kind === 'today' && diagnosticEnabled ? 1 : 0)); sample++) {
      const diagnostic = route.kind === 'today' && diagnosticEnabled && sample === (sampleCounts.today??3)+1;
      const context = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
      try {
        await context.addCookies([{ name: 'adhd_session', value: input.token, url: origin, httpOnly: true, sameSite: 'Strict' }]);
        await context.addInitScript(() => localStorage.setItem('adhd.session.v1', JSON.stringify({ version: 1 })));
        const page = await context.newPage(), cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.clearBrowserCache');
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: settings.cpuRate });
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: settings.latencyMs, downloadThroughput: settings.downloadBytesPerSecond, uploadThroughput: settings.uploadBytesPerSecond, connectionType: 'cellular4g' });
        if (diagnostic) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
        const requests = {}, failures = [], failedRequests = [], canceledReads = [], successfulReads = new Map(), requestOrder = new WeakMap(); let sequence = 0, verified = false, privateBeforeMe = 0, pageErrors = 0;
        page.on('pageerror', () => pageErrors++);
        page.on('requestfailed', request => {
          const path = new URL(request.url()).pathname;
          if (!path.startsWith('/api/')) return;
          const reason = request.failure()?.errorText ?? '';
          const safe = path.replace(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/gi, '{id}');
          if (request.method() === 'GET' && reason === 'net::ERR_ABORTED') {
            canceledReads.push({ path: safe, key: request.url(), sequence: requestOrder.get(request) ?? Infinity });
          } else {
            failures.push(0);
            failedRequests.push({ path: safe, method: request.method(), reason: /^net::[A-Z_]+$/.test(reason) ? reason : 'network-failure' });
          }
        });
        page.on('request', request => {
          const path = new URL(request.url()).pathname;
          if (!path.startsWith('/api/')) return;
          requestOrder.set(request, ++sequence);
          if (path !== '/api/auth/me' && !verified) privateBeforeMe++;
          const safe = path.replace(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/gi, '{id}');
          requests[safe] = (requests[safe] ?? 0) + 1;
        });
        page.on('response', response => {
          const path = new URL(response.url()).pathname;
          if (path === '/api/auth/me' && response.status() === 200) verified = true;
          if (path.startsWith('/api/') && response.status() >= 400) failures.push(response.status());
          if (path.startsWith('/api/') && response.status() === 200 && response.request().method() === 'GET') {
            const safe = path.replace(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/gi, '{id}');
            const order = requestOrder.get(response.request()) ?? 0;
            void response.finished().then(error => {
              if (!error) successfulReads.set(response.url(), Math.max(order, successfulReads.get(response.url()) ?? 0));
            }).catch(() => {});
          }
        });
        await page.goto(origin + route.path, { waitUntil: 'domcontentloaded' });
        const value = await page.waitForFunction(({ kind, date, expectedItems }) => {
          if (kind === 'today') {
            const plan = document.querySelector(`.r2-dayplan[data-plan-date="${date}"]`);
            const count = plan?.querySelectorAll('.r2-plan-list > li').length ?? 0;
            const menu = document.querySelector('button[aria-label="Plan menüsü"]');
            const pending = [...(plan?.querySelectorAll('[role="status"]') ?? [])].some(el => el.textContent.includes('Gün planı okunuyor'));
            if (!plan || pending || count !== expectedItems || (expectedItems === 0 && !plan.querySelector('.r2-empty-day')) || !menu || menu.disabled) return false;
            return { readyMs: performance.now(), renderedRows: count };
          }
          if (kind === 'focus') {
            const clock = document.querySelector('.focus-countdown[role="timer"]');
            const pause = [...document.querySelectorAll('.focus-page button')].find(b => b.textContent.trim() === 'Odağı duraklat');
            if (!clock || !pause || pause.disabled) return false;
            return { readyMs: performance.now(), renderedRows: 1 };
          }
          const grid = document.querySelector('.r2-month[role="grid"]');
          const pending = [...document.querySelectorAll('[role="status"]')].some(el => el.textContent.includes('Takvim okunuyor'));
          const cells = grid?.querySelectorAll('[role="gridcell"]').length ?? 0;
          if (!grid || pending || cells < 28) return false;
          return { readyMs: performance.now(), renderedRows: cells };
        }, { kind: route.kind, date: input.date, expectedItems: input.expectedItems }, { polling: 'raf', timeout: 30000 });
        const ready = await value.jsonValue();
        // İlk uzlaştırma için sabit gözlem aralığı. Hazır olma beklemesi veya puan geciktirmesi değil.
        await new Promise(resolve => setTimeout(resolve, Math.max(0, settings.observationMs - ready.readyMs)));
        // İptal GET ancak aynı yola yeni başarılı yanıt tamamen geldiyse yerine geçmiş sayılır.
        // Kurtarılmamış iptal ve diğer ağ/HTTP hataları ölçümü yine başarısız yapar.
        const supersededReads = canceledReads.map(read => ({ path: read.path, recovered: (successfulReads.get(read.key) ?? 0) > read.sequence }));
        const unrecoveredCancels = supersededReads.filter(read => !read.recovered).length;
        if (!verified || privateBeforeMe || pageErrors || failures.length || unrecoveredCancels) {
          writeFileSync(`${evidence}/application-ready-failure.json`, JSON.stringify({ route: route.kind, sample, diagnostic, ...ready, verified, privateBeforeMe, pageErrors, failedHttpStatuses: failures, failedRequests, supersededReads, unrecoveredCancels, requests }, null, 2) + '\n');
          throw new Error(`Readiness invariant failed: ${route.kind}`);
        }
        if (diagnostic) {
          const { profile } = await cdp.send('Profiler.stop');
          const elapsed = new Map();
          (profile.samples ?? []).forEach((id, index) => elapsed.set(id, (elapsed.get(id) ?? 0) + (profile.timeDeltas?.[index] ?? 0)));
          const parents = new Map(), frames = new Map();
          const nativeLabels = new Set(['(idle)', '(program)', '(root)', '(garbage collector)']);
          for (const node of profile.nodes) {
            for (const child of node.children ?? []) parents.set(child, node.id);
            let file = 'native';
            try { const url = new URL(node.callFrame.url); if (url.origin === origin && url.pathname.startsWith('/_next/static/')) file = url.pathname.split('/').at(-1); } catch {}
            const name = node.callFrame.functionName;
            frames.set(node.id, { file, name: nativeLabels.has(name) || /^[A-Za-z_$][A-Za-z0-9_$ .<>]{0,80}$/.test(name) ? name : 'anonymous-or-internal', line: node.callFrame.lineNumber, column: node.callFrame.columnNumber });
          }
          const ordered = profile.nodes.filter(node => elapsed.has(node.id)).sort((a, b) => elapsed.get(b.id) - elapsed.get(a.id));
          const top = ordered.slice(0, 30).map(node => ({ ...frames.get(node.id), sampledSelfMs: elapsed.get(node.id) / 1000 }));
          const topStacks = ordered.filter(node => node.callFrame.functionName !== '(idle)').slice(0, 15).map(node => {
            const stack = []; let id = node.id;
            while (id !== undefined && stack.length < 32) { stack.push(frames.get(id)); id = parents.get(id); }
            return { sampledSelfMs: elapsed.get(node.id) / 1000, frames: stack.reverse(), truncated: id !== undefined };
          });
          writeFileSync(`${evidence}/application-cpu.json`, JSON.stringify({ kind: 'sanitized-separate-cpu-diagnostic-not-a-ready-sample', rawProfileExported: false, frameDepthLimit: 32, top, topStacks }, null, 2) + '\n');
        } else {
          const javascript = await page.evaluate(() => {
            const scripts = performance.getEntriesByType('resource').filter(r => r.name.includes('/_next/static/') && /\.js(?:[?]|$)/.test(r.name));
            return { chunks: scripts.map(r => ({ file: new URL(r.name).pathname.split("/").at(-1), encodedBodyBytes: r.encodedBodySize, decodedBodyBytes: r.decodedBodySize })).sort((a,b) => b.encodedBodyBytes-a.encodedBodyBytes), files: scripts.length, encodedBodyBytes: scripts.reduce((n,r) => n+r.encodedBodySize,0), decodedBodyBytes: scripts.reduce((n,r) => n+r.decodedBodySize,0), transferBytes: scripts.reduce((n,r) => n+r.transferSize,0) };
          });
          samples.push({ route: route.kind, sample, javascript, ...ready, requests, privateBeforeMe, pageErrors, failedHttpStatuses: failures, supersededReads, unrecoveredCancels });
          save();
        }
      } finally { await context.close(); }
    }
  }
} finally { await browser.close(); }

// Yalnız anonim açık production laboratuvarı. Örnek domain yayın/indeksleme kanıtı değildir.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const evidence = process.env.UI_EVIDENCE_DIR ?? readFileSync('tools/evidence-dir.txt', 'utf8').trim();
const origin = new URL(process.env.UI_E2E_BASE_URL ?? 'http://127.0.0.1:3400');
if (origin.hostname !== '127.0.0.1' || origin.protocol !== 'http:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('Lab requires an owned loopback server.');
const response = await fetch(origin);
const html = await response.text();
if (!response.ok || response.headers.get('x-robots-tag')?.includes('noindex') || !html.includes('name="robots" content="index, follow"')) throw new Error('Lab requires an explicitly indexable production fixture; no audit exclusions are allowed.');
const runtime = dirname(process.execPath);
mkdirSync(evidence, { recursive: true });
mkdirSync('.local', { recursive: true });
const samples = [];
for (const profile of ['mobile', 'desktop']) {
  for (let sample = 1; sample <= 3; sample++) {
    const output = `${evidence}/lighthouse-${profile}-${sample}.json`;
    const args = [join(runtime, 'node_modules/npm/bin/npm-cli.js'), 'exec', '--yes', '--package=lighthouse@13.5.0', '--', 'lighthouse', origin.href,
      '--quiet', '--chrome-flags=--headless --no-first-run --no-default-browser-check', '--output=json', `--output-path=${output}`, '--only-categories=performance,accessibility,best-practices,seo'];
    if (profile === 'desktop') args.push('--preset=desktop');
    const result = spawnSync(process.execPath, args, { env: { ...process.env, PATH: `${runtime}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`, ...(process.platform === 'win32' ? { CHROME_PATH: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' } : {}) }, encoding: 'utf8', timeout: 180_000, windowsHide: true });
    writeFileSync(`.local/ui30-lighthouse-${profile}-${sample}.log`, (result.stdout ?? '') + (result.stderr ?? ''));
    if (result.status !== 0) throw new Error(`Lighthouse ${profile}/${sample} failed; inspect ignored log.`);
    const report = JSON.parse(readFileSync(output, 'utf8'));
    if (report.runtimeError) throw new Error(`Lighthouse ${profile}/${sample} runtime failure.`);
    samples.push({ profile, sample, version: report.lighthouseVersion, scores: Object.fromEntries(Object.entries(report.categories).map(([key, value]) => [key, value.score])),
      lcpMs: report.audits['largest-contentful-paint'].numericValue, cls: report.audits['cumulative-layout-shift'].numericValue, tbtMs: report.audits['total-blocking-time'].numericValue });
  }
}
const summary = { kind: 'anonymous-loopback-production-lab', domainAcceptance: false, route: '/', samples };
writeFileSync(`${evidence}/lighthouse-summary.json`, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary));
if (samples.some(sample => !(sample.scores.seo >= .95 && sample.scores.performance >= .95))) throw new Error('Public lab budget failed (every sample must reach SEO/Performance >=95).');

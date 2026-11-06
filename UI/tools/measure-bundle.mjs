import { isWorkspacePath } from "../public/route-paths.js";
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
const EVIDENCE = process.env.UI_EVIDENCE_DIR ?? readFileSync('tools/evidence-dir.txt', 'utf8').trim();

const origin = process.env.UI_E2E_BASE_URL ?? 'http://127.0.0.1:3400';
if (process.version !== 'v' + (await readFile('.node-version', 'utf8')).trim()) throw new Error('Measurement requires the project pinned Node runtime');
const routes = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/planning', '/tasks', '/calendar', '/settings', '/bulunamayan-sayfa', '/internal-checks/calendar'];
const result = {
  kind: 'production-route-assets-gzip-estimate',
  measuredAtUtc: new Date().toISOString(),
  node: process.version,
  buildId: (await readFile(`${process.env.UI_E2E_BUILD_DIR ?? '.next'}/BUILD_ID`, 'utf8')).trim(),
  lockSha256: createHash('sha256').update(await readFile('package-lock.json')).digest('hex'),
  routes: [],
};
for (const path of routes) {
  const response = await fetch(origin + path);
  const html = await response.text();
  const assets = [...new Set([...html.matchAll(/(?:src|href)="([^"<>]+\.(?:js|css)(?:\?[^"<>]*)?)"/g)].map(match => match[1]))];
  const sizes = await Promise.all(assets.map(async asset => {
    const url = new URL(asset.replaceAll('&amp;', '&'), origin);
    if (url.origin !== origin) throw new Error('Unexpected third party in initial route');
    const reply = await fetch(url);
    if (!reply.ok) throw new Error(`Asset unavailable: ${url.pathname}`);
    const data = Buffer.from(await reply.arrayBuffer());
    return { path: url.pathname, bytes: data.length, gzipBytes: gzipSync(data).length };
  }));
  const budgetKiB = path === '/internal-checks/calendar' ? 550 : isWorkspacePath(path) ? 300 : 200;
  result.routes.push({ path, status: response.status, assets: sizes, jsBudgetBytes: budgetKiB * 1024,
    jsGzipBytes: sizes.filter(x => x.path.endsWith('.js')).reduce((sum, x) => sum + x.gzipBytes, 0),
    cssGzipBytes: sizes.filter(x => x.path.endsWith('.css')).reduce((sum, x) => sum + x.gzipBytes, 0) });
}
await mkdir(EVIDENCE, { recursive: true });
await writeFile(`${EVIDENCE}/bundle-baseline.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.routes.map(({ path, status, jsGzipBytes, cssGzipBytes }) => ({ path, status, jsGzipBytes, cssGzipBytes }))));
if (result.routes.some(route => route.jsGzipBytes > route.jsBudgetBytes)) throw new Error('Initial route JS exceeds its documented gzip estimate budget');

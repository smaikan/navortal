import { appendFileSync, readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';

/** Yalnız bilinen OpenAPI şablonu ve HTTP durumunu kaydeder. URL parametresi, kimlik, gövde ve başlık yazılmaz. */
export function operationRecorder(spec, write) {
  const operations = Object.entries(spec.paths).flatMap(([path, verbs]) => Object.keys(verbs).filter(method => /^(get|post|put|patch|delete)$/.test(method)).map(method => ({ path, method: method.toUpperCase(), pattern: new RegExp('^' + path.split(/(\{[^}]+\})/).map(part => part.startsWith('{') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + '$') }))).sort((a,b) => (a.path.match(/\{/g)?.length ?? 0) - (b.path.match(/\{/g)?.length ?? 0) || b.path.length - a.path.length);
  const seen = new Set();
  return (request, response) => {
    // Proxy'ye giden hazırlık/APIRequestContext trafiğini ayırıyoruz. Bu metadata başlıklarını tarayıcı sağlar.
    if (request.headers?.['sec-fetch-site'] !== 'same-origin' || request.headers?.['sec-fetch-dest'] !== 'empty') return;
    let path; try { path = new URL(request.url, 'http://127.0.0.1').pathname; } catch { return; }
    const op = operations.find(op => op.method === request.method && op.pattern.test(path)); if (!op) return;
    response.once('finish', () => {
      const entry = { method: op.method, path: op.path, status: response.statusCode }, key = JSON.stringify(entry);
      if (!seen.has(key)) { seen.add(key); write(key + '\n'); }
    });
  };
}

export function ownedOperationAudit() {
  if (process.env.UI_E2E_BUILD !== 'true' || process.env.UI_E2E_CHECKS !== 'true') return () => {};
  const run = readFileSync('.local/e2e-run.lock', 'utf8').trim();
  if (!/^[a-f0-9]{32}$/.test(run) || process.env.PGDATABASE !== `adhd_ui_test_${run}` || !process.env.UI_EVIDENCE_DIR) throw new Error('Operation audit requires the owned E2E runner.');
  const folder = resolve(process.env.UI_EVIDENCE_DIR), inside = relative(process.cwd(), folder);
  if (isAbsolute(inside) || inside.startsWith('..')) throw new Error('Operation evidence must stay in the workspace.');
  const file = resolve(folder, 'browser-api-operations.jsonl');
  return operationRecorder(JSON.parse(readFileSync('../docs/openapi-v1.json', 'utf8')), line => appendFileSync(file, line));
}

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const dir = process.env.UI_EVIDENCE_DIR ?? readFileSync('tools/evidence-dir.txt', 'utf8').trim();
async function walk(folder) { return (await Promise.all((await readdir(folder, { withFileTypes: true })).map(e => e.isDirectory() ? walk(path.join(folder, e.name)) : path.join(folder, e.name)))).flat(); }
const logs = (await readdir('.local')).filter(f => /^e2e-.*\.log$/.test(f)).map(f => path.join('.local', f));
const artifacts = (await walk(dir)).filter(f => /\.(json|log|md|txt)$/.test(f));
let matches = 0;
for (const file of [...logs, ...artifacts]) { const text = await readFile(file, 'utf8'); const clean = text.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, () => { matches++; return '<REDACTED-JWT>'; }); if (clean !== text) await writeFile(file, clean); }
await writeFile(path.join(dir, 'jwt-artifact-audit.json'), JSON.stringify({ kind: 'owned-e2e-logs-and-active-evidence-jwt-scan', logFilesScanned: logs.length, artifactFilesScanned: artifacts.length, detectedAndRedactedJwtLeaks: matches }, null, 2) + '\n');
process.exitCode = matches ? 1 : 0;

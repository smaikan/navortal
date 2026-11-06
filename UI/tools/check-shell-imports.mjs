import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const EVIDENCE = process.env.UI_EVIDENCE_DIR ?? readFileSync('tools/evidence-dir.txt', 'utf8').trim();

const files = new Set(); const packages = new Set(); const lazyBoundaries = new Set();
async function walk(file) {
  if (files.has(file)) return;
  files.add(file);
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/import\s*\((["'])([^"']+)\1/g)) lazyBoundaries.add(match[2]);
  const imports = [...source.matchAll(/from\s*(["'])([^"']+)\1/g)].map(match => match[2]);
  for (const name of imports) {
    if (!name.startsWith('.')) { packages.add(name); continue; }
    const base = path.resolve(path.dirname(file), name);
    let resolved;
    for (const suffix of ['', '.ts', '.tsx', '.d.ts', '/index.ts', '/index.tsx']) {
      try { await readFile(base + suffix); resolved = base + suffix; break; } catch {}
    }
    if (!resolved) throw new Error('Unresolved shell dependency: ' + name);
    await walk(resolved);
  }
}
await walk(path.resolve('src/components/layout/workspace-shell.tsx'));
const forbidden = [...packages].filter(name => /fullcalendar|recharts|motion|temporal-polyfill/.test(name));
await writeFile(`${EVIDENCE}/shell-import-graph.json`, JSON.stringify({
  kind: 'eager-static-import-graph-including-type-imports; dynamic-boundaries-recorded-separately',
  lazyBoundaries: [...lazyBoundaries].sort(),
  files: [...files].map(file => path.relative(process.cwd(), file).replaceAll('\\', '/')).sort(),
  packages: [...packages].sort(), forbidden,
}, null, 2) + '\n');
if (forbidden.length) throw new Error('Heavy feature dependency entered the shell graph');
console.log(`Shell import graph: ${files.size} files; no Calendar/Recharts/Motion/Temporal`);

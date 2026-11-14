import { parse } from "acorn";
import { readdir, readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";

// Parse every shipped browser chunk, including Next's runtime and dependencies.
// ES2021 deliberately rejects static blocks, class fields and top-level await.
const buildDir = resolve(process.argv[2] ?? (process.env.UI_E2E_BUILD === "true" ? ".local/next-e2e" : ".next"));
const staticDir = resolve(buildDir, "static");
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(entry => {
      const path = resolve(dir, entry.name);
      return entry.isDirectory() ? files(path) : entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
    }),
  );
  return nested.flat().sort();
}
const chunks = await files(staticDir);
if (!chunks.length) throw new Error(`No browser JavaScript found in ${staticDir}; run a production build first.`);
let bytes = 0;
const failures = [];
for (const file of chunks) {
  const source = await readFile(file, "utf8");
  bytes += Buffer.byteLength(source);
  try {
    parse(source, { ecmaVersion: 2021, sourceType: "module" });
  } catch (error) {
    // Report location only; never dump application code or embedded values.
    failures.push(`${relative(buildDir, file)}:${error.loc.line}:${error.loc.column + 1} ${error.message}`);
  }
}
console.log(`ES2021 browser syntax: ${chunks.length} files, ${bytes} bytes, ${failures.length} failures.`);
for (const failure of failures) console.error(failure);
if (failures.length) process.exitCode = 1;

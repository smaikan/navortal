import openapiTS, { astToString } from "openapi-typescript";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";
import { createHash } from "node:crypto";

const ui = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const candidates = [join(ui, "../UI-docs/openapi-v1.json"), resolve(ui, "../docs/openapi-v1.json")].filter(existsSync);
if (!candidates.length) throw new Error("Canonical OpenAPI document is missing");
const sha = input => createHash("sha256").update(input).digest("hex");
const hashes = await Promise.all(candidates.map(async path => sha(await readFile(path))));
if (new Set(hashes).size !== 1)
  throw new Error("Two different OpenAPI documents exist; resolve canonical ownership first");
const source = candidates[0];
const spec = JSON.parse(await readFile(source, "utf8"));
const policies = JSON.parse(await readFile(join(dirname(source), "operation-policies.json"), "utf8"));
if (policies.sourceSha256 !== hashes[0]) throw new Error("Operation policies do not match the canonical OpenAPI hash");
const operations = Object.values(spec.paths).flatMap(value =>
  Object.keys(value).filter(method => ["get", "post", "put", "patch", "delete"].includes(method)),
);
if (operations.length !== policies.openApiOperations || Object.keys(spec.components.schemas).length !== 306)
  throw new Error("API inventory changed; review the UI contract map before generating");
const types = astToString(await openapiTS(spec));
const table = Object.fromEntries(
  policies.operations
    .map(row => [
      `${row.method} ${row.path}`,
      {
        auth: row.authRequired,
        key: row.idempotencyKeyRequired,
        maxKeyLength: row.maxKeyLength,
        retry: row.retryPolicy,
        disabled: row.path.startsWith("/api/auth/google"),
      },
    ])
    .sort(([a], [b]) => a.localeCompare(b, "en")),
);
if (Object.keys(table).length !== policies.concreteOperations)
  throw new Error("Concrete operation policy inventory mismatch");
// Share identical immutable metadata across routes without changing any policy value.
const definitions = [];
const references = Object.entries(table).map(([path, policy]) => {
  const json = JSON.stringify(policy);
  let index = definitions.indexOf(json);
  if (index < 0) {
    index = definitions.length;
    definitions.push(json);
  }
  return `  ${JSON.stringify(path)}: policy${index},`;
});
const compactPolicies =
  definitions.map((value, index) => `const policy${index} = ${value} as const;`).join("\n") +
  `\nexport const operationPolicies = {\n${references.join("\n")}\n} as const;\n`;
const files = {
  "schema.d.ts": `// Generated from canonical OpenAPI SHA256 ${hashes[0]}. Do not edit.\n${types}`,
  "operation-policies.ts": `// Generated from canonical operation-policies.json. Do not edit.\n${compactPolicies}`,
};
const folder = join(ui, "src/lib/api/generated");
await mkdir(folder, { recursive: true });
for (const [name, content] of Object.entries(files)) {
  const path = join(folder, name);
  if (process.argv.includes("--check")) {
    if (!existsSync(path) || (await readFile(path, "utf8")) !== content) throw new Error(`Generated ${name} is stale`);
  } else await writeFile(path, content);
}
console.log(
  JSON.stringify({
    operations: operations.length,
    concrete: Object.keys(table).length,
    schemas: 306,
    sourceSha256: hashes[0],
    check: process.argv.includes("--check"),
  }),
);

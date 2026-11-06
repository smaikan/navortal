import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const sample = Number(process.argv[2] ?? 1);
const profile = process.argv[3] ?? "mobile";
if (![1, 2, 3].includes(sample) || !["mobile", "desktop"].includes(profile))
  throw new Error("Expected sample 1..3 and mobile/desktop");
const runtime = dirname(process.execPath);
const npmCli = join(runtime, "node_modules/npm/bin/npm-cli.js");
const output = `../UI-docs/verification/ui-01/lighthouse-${profile}-${sample}.json`;
const args = [
  npmCli,
  "exec",
  "--yes",
  "--package=lighthouse@13.5.0",
  "--",
  "lighthouse",
  "http://127.0.0.1:3100/planning",
  "--quiet",
  "--chrome-flags=--headless",
  "--output=json",
  `--output-path=${output}`,
  "--only-categories=performance,accessibility,best-practices,seo",
];
if (profile === "desktop") args.push("--preset=desktop");
mkdirSync(".local", { recursive: true });
const run = spawnSync(process.execPath, args, {
  env: {
    ...process.env,
    PATH: `${runtime};${process.env.PATH}`,
    CHROME_PATH: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  },
  encoding: "utf8",
  timeout: 180_000,
});
writeFileSync(`.local/lighthouse-${profile}-${sample}.log`, (run.stdout ?? "") + (run.stderr ?? ""));
if (run.status !== 0) {
  console.error(run.error?.message ?? `Lighthouse exited ${run.status}; inspect .local log.`);
  process.exit(1);
}
const report = JSON.parse(readFileSync(output, "utf8"));
console.log(
  JSON.stringify({
    profile,
    sample,
    version: report.lighthouseVersion,
    scores: Object.fromEntries(Object.entries(report.categories).map(([key, value]) => [key, value.score])),
    lcp: report.audits["largest-contentful-paint"].numericValue,
    cls: report.audits["cumulative-layout-shift"].numericValue,
    tbt: report.audits["total-blocking-time"].numericValue,
  }),
);

import { appendFileSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export function resolveEvidenceDirectory(workspace, ui, configured) {
  if (!configured?.trim() || /[\r\n]/.test(configured)) throw new Error("Evidence directory must be a single nonempty path.");
  const destination = resolve(ui, configured.trim());
  const within = relative(resolve(workspace), destination);
  if (!within || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) {
    throw new Error("Evidence directory must stay inside the checked-out workspace.");
  }
  return destination;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const configured = process.env.UI_EVIDENCE_DIR ?? readFileSync("tools/evidence-dir.txt", "utf8").trim();
  const destination = resolveEvidenceDirectory(process.env.GITHUB_WORKSPACE, process.cwd(), configured);
  appendFileSync(process.env.GITHUB_ENV, `EVIDENCE_DIR=${destination}\n`);
}

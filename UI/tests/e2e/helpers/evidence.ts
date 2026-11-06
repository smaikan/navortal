import { readFileSync } from "node:fs";

/** Aktif işin kanıt klasörü tools/evidence-dir.txt içinde, her işte yalnız orası değişir. */
export const EVIDENCE = process.env.UI_EVIDENCE_DIR ?? readFileSync("tools/evidence-dir.txt", "utf8").trim();

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

it("writes the Playwright report beside all other evidence when the directory is overridden", async () => {
  vi.stubEnv("UI_EVIDENCE_DIR", ".local/evidence-config-check");
  const config = (await import("../../playwright.config")).default;
  expect(config.reporter).toContainEqual([
    "json",
    { outputFile: ".local/evidence-config-check/playwright-results.json" },
  ]);
});

it("uses the single active-MVP file when no environment override is present", async () => {
  vi.stubEnv("UI_EVIDENCE_DIR", undefined);
  const config = (await import("../../playwright.config")).default;
  const directory = readFileSync("tools/evidence-dir.txt", "utf8").trim();
  expect(config.reporter).toContainEqual(["json", { outputFile: `${directory}/playwright-results.json` }]);
});

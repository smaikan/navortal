import { defineConfig, devices } from "@playwright/test";
import { EVIDENCE } from "./tests/e2e/helpers/evidence";

// Kapanış katmanında --cross-browser-focus ile seçilen testler Firefox/WebKit'te de koşar.
const crossBrowser = process.env.UI_E2E_CROSS ? new RegExp(`(?:${process.env.UI_E2E_CROSS.split(",").join("|")})\\.spec\\.ts`) : /(?:auth|matrix|recovery-form|shell|preferences|tasks|tree|task-work|task-lifecycle|task-relations|collections|classification|work-player|work-corrections|manual-planning|day-planning-simple|immediate-work|calendar|focus-start|focus-controls|pomodoro|notes|support|recurrence|realtime|notifications|reminders|pwa-panel)\.spec\.ts/;

export default defineConfig({
  testDir: "tests/e2e",
  testIgnore: process.env.UI_REAL_PUSH === "1" ? [] : ["**/native-push-provider.spec.ts"],
  fullyParallel: true,
  workers: process.env.UI_E2E_WORKERS === "1" ? 1 : 2,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"], ["json", { outputFile: `${EVIDENCE}/playwright-results.json` }]],
  use: { baseURL: process.env.UI_E2E_BASE_URL ?? "http://127.0.0.1:3400", trace: process.env.UI_E2E_TRACE ? "retain-on-failure" : "off", video: "off", screenshot: "only-on-failure", locale: "tr-TR", timezoneId: "Europe/Istanbul" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], ...(process.env.UI_E2E_EDGE === "1" ? { channel: "msedge", userAgent: undefined } : {}) } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "firefox", testMatch: crossBrowser, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", timeout: 60_000, testMatch: crossBrowser, use: { ...devices["Desktop Safari"] } },
  ],
});

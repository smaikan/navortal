import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { test, type BrowserContext, type BrowserContextOptions, type BrowserType, type Page } from "@playwright/test";
import { EVIDENCE } from "./evidence";
import { signIn } from "./session";

/** Bize ait tarayıcı süreci/profili, kalıcı depolama dahil. Token test dosyasına yazılmaz. */
export async function restartWorkspace(
  type: BrowserType,
  token: string,
  inspect: (page: Page) => Promise<void>,
  closed: () => Promise<void>,
  device: Pick<BrowserContextOptions, "viewport" | "isMobile" | "hasTouch" | "deviceScaleFactor">,
) {
  const run = readFileSync(".local/e2e-run.lock", "utf8").trim();
  if (!/^[a-f0-9]{32}$/.test(run) || process.env.PGDATABASE !== `adhd_ui_test_${run}`)
    throw new Error("Owned runner required for restart profile");
  const local = realpathSync(".local"),
    profile = mkdtempSync(join(local, "ui33-browser-restart-"));
  writeFileSync(join(profile, ".owned-ui-run"), run);
  let context: BrowserContext | null = null;
  const began = performance.now(),
    phases: { phase: string; elapsedMs: number }[] = [];
  const mark = (phase: string) => {
    phases.push({ phase, elapsedMs: Math.round(performance.now() - began) });
    writeFileSync(
      `${EVIDENCE}/browser-restart-${test.info().project.name}-${test.info().repeatEachIndex}.json`,
      JSON.stringify({ phases }, null, 2),
    );
  };
  try {
    for (const first of [true, false]) {
      mark(first ? "first-launch" : "second-launch");
      context = await type.launchPersistentContext(profile, {
        ...device,
        headless: true,
        baseURL: process.env.UI_E2E_BASE_URL ?? "http://127.0.0.1:3400",
        locale: "tr-TR",
        timezoneId: "Europe/Istanbul",
      });
      mark(first ? "first-launched" : "second-launched");
      const page = context.pages()[0] ?? (await context.newPage());
      let workCommands = 0;
      page.on("request", request => {
        if (request.method() === "POST" && /^\/api\/(?:work|focus)-sessions/.test(new URL(request.url()).pathname))
          workCommands++;
      });
      if (first) {
        await page.goto("/login");
        // Gerçek kalıcı profil yeniden açılışta Max-Age cookie'sini ve işareti korur.
        await signIn(context, token);
      }
      // İkinci açılışta script veya token eklemiyoruz. Kendi kaydıyla giriş yapmalı.
      mark(first ? "first-open" : "second-open");
      await page.goto("/planning");
      await inspect(page);
      mark(first ? "first-ready" : "second-ready");
      await context.close();
      context = null;
      mark(first ? "first-closed" : "second-closed");
      if (workCommands) throw new Error("Closing a read-only workspace sent a work/focus command");
      await closed();
    }
  } finally {
    if (context) await context.close();
    mark("profile-cleanup");
    const target = realpathSync(profile);
    if (
      dirname(target) !== local ||
      !basename(target).startsWith("ui33-browser-restart-") ||
      resolve(target) !== resolve(profile) ||
      readFileSync(join(target, ".owned-ui-run"), "utf8") !== run
    )
      throw new Error("Refusing unowned browser profile cleanup");
    rmSync(target, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    mark("profile-removed");
  }
}

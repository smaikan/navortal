import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ui = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? resolve(ui, '.local/playwright') };
// Gerçek push testinde tam Chromium yeni headless seçilir. Headless shell bildirim iznini reddeder.
const run = spawnSync(process.execPath, [resolve(ui, 'node_modules/@playwright/test/cli.js'), 'install', 'chromium', 'firefox', 'webkit', ...process.argv.slice(2)],
  { cwd: ui, env, stdio: 'inherit', windowsHide: true });
process.exit(run.status ?? 1);

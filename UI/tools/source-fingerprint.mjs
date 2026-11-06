import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const EVIDENCE = process.env.UI_EVIDENCE_DIR ?? readFileSync('tools/evidence-dir.txt', 'utf8').trim();

async function walk(folder) {
  return (await Promise.all((await readdir(folder, { withFileTypes: true })).filter(entry =>
    !entry.isDirectory() || !['bin', 'obj', '.local', 'node_modules', '__pycache__'].includes(entry.name)).map(entry => {
    const name = path.join(folder, entry.name);
    return entry.isDirectory() ? walk(name) : name;
  }))).flat();
}
const files = [...await walk('src'), ...await walk('tests'), ...await walk('public'), ...await walk('../API/src'),
  ...((await readdir('tools')).filter(name => /\.(mjs|py|ps1)$/.test(name)).map(name => `tools/${name}`)),
  'package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'eslint.config.mjs', 'postcss.config.mjs', '.node-version',
  'playwright.config.ts', 'vitest.config.ts', 'tools/api-types/generate.mjs', 'tools/api-types/package.json', 'tools/api-types/package-lock.json',
  '../API/src/Adhd.Api/Program.cs', '../API/src/Adhd.Api/Auth/AuthRegistration.cs', '../API/src/Adhd.Api/Auth/SmtpSettingsValidator.cs',
  '../API/src/Adhd.Infrastructure/Auth/SmtpResetMailSender.cs', '../API/src/Adhd.Api/Controllers/PreferencesController.cs',
  '../API/src/Adhd.Application/Preferences/PreferencesService.cs', '../API/src/Adhd.Domain/Preferences/PlanningPreferences.cs',
  '../API/src/Adhd.Infrastructure/Preferences/PreferencesStore.cs', '../API/global.json', '../.github/workflows/ui.yml'];
files.push('../API/src/Adhd.Api/Controllers/TaskTreeController.cs', '../API/src/Adhd.Application/Tasks/TaskTreeService.cs',
  '../API/src/Adhd.Infrastructure/Tasks/TaskTreeStore.cs', '../API/src/Adhd.Api/Controllers/TasksController.cs',
  '../API/src/Adhd.Application/Tasks/TaskService.cs', '../API/src/Adhd.Infrastructure/Tasks/TaskStore.cs');
files.push('../API/src/Adhd.Api/Controllers/TaskWorkloadController.cs', '../API/src/Adhd.Api/Controllers/TaskLifecycleController.cs',
  '../API/src/Adhd.Application/Tasks/TaskWorkloadService.cs', '../API/src/Adhd.Infrastructure/Tasks/TaskWorkloadStore.cs',
  '../API/src/Adhd.Infrastructure/Tasks/TaskLifecycleStore.cs', '../API/src/Adhd.Infrastructure/Work/WorkQueries.cs',
  '../API/src/Adhd.Domain/Tasks/WorkloadCalculator.cs', '../API/src/Adhd.Domain/Tasks/TaskProgressCalculator.cs');
files.push('../API/src/Adhd.Domain/Tasks/TaskLifecycle.cs', '../API/src/Adhd.Infrastructure/Planning/PlanningLifecycle.cs', '../API/src/Adhd.Infrastructure/Work/WorkLifecycle.cs', '../API/src/Adhd.Application/Tasks/TaskLifecycleService.cs');
files.push('../API/src/Adhd.Api/Controllers/TaskRelationsController.cs', '../API/src/Adhd.Application/Tasks/TaskRelationsService.cs',
  '../API/src/Adhd.Infrastructure/Tasks/TaskRelationsStore.cs', '../API/src/Adhd.Infrastructure/Tasks/TaskGraphAccess.cs', '../API/src/Adhd.Domain/Tasks/TaskRelations.cs');
files.push('../API/src/Adhd.Api/Controllers/NamedResourcesController.cs', '../API/src/Adhd.Application/Collections/NamedResourceService.cs', '../API/src/Adhd.Infrastructure/Collections/NamedResourceStore.cs',
  '../API/src/Adhd.Api/Controllers/TaskClassificationController.cs', '../API/src/Adhd.Application/Tasks/TaskClassificationService.cs', '../API/src/Adhd.Infrastructure/Collections/TaskClassificationStore.cs');
files.push('../API/src/Adhd.Infrastructure/Work/WorkStore.cs', '../API/src/Adhd.Api/Controllers/WorkController.cs', '../API/src/Adhd.Api/Controllers/SyncController.cs');
files.push('../API/src/Adhd.Api/Controllers/FocusController.cs', '../API/src/Adhd.Application/Focus/FocusService.cs', '../API/src/Adhd.Domain/Focus/FocusModels.cs',
  '../API/src/Adhd.Infrastructure/Work/WorkStore.Focus.cs', '../API/src/Adhd.Infrastructure/Work/WorkStore.FocusCommands.cs', '../API/src/Adhd.Infrastructure/Work/WorkStore.FocusQueries.cs',
  '../API/src/Adhd.Infrastructure/Focus/FocusLifecycle.cs', '../API/src/Adhd.Infrastructure/Jobs/PlannerJobsRegistration.cs');
files.push('../API/src/Adhd.Api/Controllers/SupportController.cs', '../API/src/Adhd.Application/Support/SupportService.cs', '../API/src/Adhd.Domain/Support/SupportModels.cs', '../API/src/Adhd.Infrastructure/Support/SupportStore.Notes.cs', '../API/src/Adhd.Infrastructure/Support/SupportStore.Context.cs');
files.push('../API/src/Adhd.Infrastructure/Support/SupportStore.Preferences.cs', '../API/src/Adhd.Infrastructure/Scheduling/SchedulingCoordinator.Support.cs');
files.push('../API/src/Adhd.Api/Controllers/RecurrenceController.cs', '../API/src/Adhd.Application/Recurrence/RecurrenceService.cs', '../API/src/Adhd.Domain/Recurrence/RecurrenceRules.cs', '../API/src/Adhd.Infrastructure/Recurrence/RecurrenceStore.cs', '../API/src/Adhd.Infrastructure/Recurrence/RecurrenceStore.Update.cs', '../API/src/Adhd.Infrastructure/Recurrence/RecurrenceStore.Materialize.cs', '../API/src/Adhd.Infrastructure/Recurrence/RecurrenceStore.Queries.cs');
files.push('../API/src/Adhd.Api/Realtime/PlannerHub.cs', '../API/src/Adhd.Api/Controllers/SyncController.cs', '../API/src/Adhd.Application/Sync/SyncService.cs', '../API/src/Adhd.Infrastructure/Notifications/SyncStore.cs');
files.push('../API/src/Adhd.Application/Notifications/NotificationService.cs', '../API/src/Adhd.Infrastructure/Notifications/NotificationJobs.cs', '../API/src/Adhd.Infrastructure/Notifications/PushTransport.cs');
const hashes = Object.fromEntries(await Promise.all(files.sort().map(async file => [file.replaceAll('\\', '/'), createHash('sha256').update(await readFile(file)).digest('hex')])));
const fingerprint = createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
await mkdir(EVIDENCE, { recursive: true });
await writeFile(`${EVIDENCE}/source-hashes.json`, JSON.stringify({ fingerprint, files: hashes }, null, 2) + '\n');
console.log(fingerprint);

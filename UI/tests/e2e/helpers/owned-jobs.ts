import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { validTaskId } from "../../../src/components/layout/task-panel-url";
/** Yalnız bu koşunun rastgele DB'sinde yapay başarısız iş. Çağıran DB veya SQL veremez. */
export function seedFailedJob(owner: string) {
  const database = process.env.PGDATABASE ?? "",
    run = readFileSync(".local/e2e-run.lock", "utf8").trim();
  if (
    !/^[a-f0-9]{32}$/.test(run) ||
    database !== `adhd_ui_test_${run}` ||
    process.env.PGHOST !== "127.0.0.1" ||
    !validTaskId(owner)
  )
    throw new Error("Refusing a job fixture outside the active owned test DB");
  const psql = process.env.ADHD_UI_TEST_PSQL;
  if (
    !psql ||
    (process.platform === "win32" && path.resolve(psql) !== path.resolve("../API/.local/pgsql/bin/psql.exe"))
  )
    throw new Error("Owned psql runtime missing");
  const id = randomUUID();
  const sql = `INSERT INTO outbox_messages ("Id","UserId","EventKey","Kind","SourceId","SourceVersion","Payload","OccurredAt","AvailableAt","State","Attempts","Version","LastErrorCode") VALUES ('${id}','${owner}','ui26:${id}','Unknown','${id}',0,'{"sentinel":"ui26-payload-must-not-render"}'::jsonb,now(),now(),'Failed',5,1,'unknown_outbox_kind')`;
  execFileSync(psql, ["--no-psqlrc", "--dbname", database, "--set=ON_ERROR_STOP=1", "--command", sql], {
    windowsHide: true,
    stdio: "pipe",
  });
  return id;
}

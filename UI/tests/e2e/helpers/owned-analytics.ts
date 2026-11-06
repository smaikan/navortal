import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { validTaskId } from "../../../src/components/layout/task-panel-url";
/** Yalnız aktif koşunun rastgele DB'si. Girdiler doğrulanmış kimlikler, dışarıdan SQL veya DB adı alınmaz. */
export function seedAnalytics(owner: string, session: string, kind: "legacy" | "dense") {
  const database = process.env.PGDATABASE ?? "",
    run = readFileSync(".local/e2e-run.lock", "utf8").trim();
  if (
    !/^[a-f0-9]{32}$/.test(run) ||
    database !== `adhd_ui_test_${run}` ||
    process.env.PGHOST !== "127.0.0.1" ||
    !validTaskId(owner) ||
    !validTaskId(session)
  )
    throw new Error("Refusing analytics fixture outside the owned random test DB");
  const psql = process.env.ADHD_UI_TEST_PSQL;
  if (
    !psql ||
    (process.platform === "win32" && path.resolve(psql) !== path.resolve("../API/.local/pgsql/bin/psql.exe"))
  )
    throw new Error("Owned psql runtime missing");
  const sql =
    kind === "legacy"
      ? `UPDATE work_sessions SET "TaskSnapshot"=NULL WHERE "UserId"='${owner}' AND "Id"='${session}'`
      : `BEGIN; UPDATE work_session_segments SET "IsVoided"=true WHERE "UserId"='${owner}' AND "SessionId"='${session}'; INSERT INTO work_session_segments ("Id","UserId","SessionId","StartedAt","EndedAt","IsVoided","Version") SELECT gen_random_uuid(),'${owner}','${session}',timestamptz '2026-01-15 06:00:00Z'+n*interval '2 microseconds',timestamptz '2026-01-15 06:00:00Z'+(n*2+1)*interval '1 microsecond',false,1 FROM generate_series(1,50001) n WHERE EXISTS(SELECT 1 FROM work_sessions WHERE "Id"='${session}' AND "UserId"='${owner}'); COMMIT;`;
  execFileSync(psql, ["--no-psqlrc", "--dbname", database, "--set=ON_ERROR_STOP=1", "--command", sql], {
    windowsHide: true,
    stdio: "pipe",
  });
}

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AuthGate } from "../../../features/auth/gate";
import { WorkspaceShell } from "../../../components/layout/workspace-shell";
import { JobsPanel } from "../../../features/reminders/jobs";
export default function JobsCheck() {
  if (process.env.UI_E2E_CHECKS !== "true") notFound();
  return (
    <Suspense fallback={<p role="status">Doğrulanıyor…</p>}>
      <AuthGate>
        <WorkspaceShell>
          <main id="main" className="workspace-main">
            <h1>Arka plan işleri · test</h1>
            <JobsPanel zone="Europe/Istanbul" />
          </main>
        </WorkspaceShell>
      </AuthGate>
    </Suspense>
  );
}

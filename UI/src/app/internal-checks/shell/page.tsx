import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AuthGate } from "../../../features/auth/gate";
import { WorkspaceShell } from "../../../components/layout/workspace-shell";
import { ShellProbe } from "./probe";

export default function ShellCheck() {
  if (process.env.UI_E2E_CHECKS !== "true") notFound();
  return (
    <Suspense
      fallback={
        <main id="main" className="page">
          <p role="status">Doğrulanıyor…</p>
        </main>
      }
    >
      <AuthGate>
        <WorkspaceShell player={<p>Yalnız test: player alanı, çalışan sayaç değil.</p>}>
          <ShellProbe />
        </WorkspaceShell>
      </AuthGate>
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "../../features/auth/gate";
import { WorkspaceShell } from "../../components/layout/workspace-shell";
import { ShellSkeleton } from "../../components/ui/skeleton";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={<ShellSkeleton label="Çalışma alanın açılıyor…" />}>
      <AuthGate>
        <WorkspaceShell>{children}</WorkspaceShell>
      </AuthGate>
    </Suspense>
  );
}

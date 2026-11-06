import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AuthGate } from "../../../features/auth/gate";
import { IsolationProbe } from "./probe";

export default function AuthIsolationCheck() {
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
        <IsolationProbe />
      </AuthGate>
    </Suspense>
  );
}

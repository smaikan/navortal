import type { Metadata } from "next";
import { RecurrencePage } from "../../../features/recurrence/page";
export const metadata: Metadata = { title: "Rutin", robots: { index: false, follow: false } };
export default function Page() {
  return (
    <main className="workspace-main" id="main" tabIndex={-1}>
      <header className="page-header">
        <h1 tabIndex={-1}>Rutin</h1>
      </header>
      <RecurrencePage />
    </main>
  );
}

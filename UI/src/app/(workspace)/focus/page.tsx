import type { Metadata } from "next";
import { FocusPage } from "../../../features/focus/page";
export const metadata: Metadata = { title: "Pomodoro", robots: { index: false, follow: false } };
export default function Page() {
  return (
    <main className="workspace-main" id="main" tabIndex={-1}>
      <header className="page-header">
        <h1 tabIndex={-1}>Pomodoro</h1>
      </header>
      <FocusPage />
    </main>
  );
}

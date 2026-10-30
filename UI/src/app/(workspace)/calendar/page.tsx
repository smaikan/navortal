import type { Metadata } from "next";
import { CalendarPage } from "../../../features/calendar/page";
export const metadata: Metadata = { title: "Takvim", robots: { index: false, follow: false } };
export default function Page() {
  return (
    <main className="workspace-main" id="main" tabIndex={-1}>
      <header className="page-header">
        <h1 tabIndex={-1}>Takvim</h1>
      </header>
      <CalendarPage />
    </main>
  );
}

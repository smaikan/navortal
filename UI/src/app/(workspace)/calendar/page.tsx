import type { Metadata } from "next";
import { CalendarPage } from "../../../features/calendar/page";
export const metadata: Metadata = { title: "Takvim", robots: { index: false, follow: false } };
export default function Page() {
  return (
    <main className="workspace-main" id="main" tabIndex={-1}>
      <CalendarPage />
    </main>
  );
}

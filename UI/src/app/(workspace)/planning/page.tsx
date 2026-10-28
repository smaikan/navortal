import type { Metadata } from "next";
import { TodayAgenda } from "../../../features/planning/page";

export const metadata: Metadata = { title: "Gün Planlama" };

export default function TodayPage() {
  return (
    <main className="workspace-main wide-scale" id="main" tabIndex={-1}>
      <header className="page-header">
        <h1 tabIndex={-1}>Gün Planlama</h1>
      </header>
      <TodayAgenda />
    </main>
  );
}

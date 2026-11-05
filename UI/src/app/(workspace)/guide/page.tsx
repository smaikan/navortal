import type { Metadata } from "next";
import { HelpGuide } from "../../../features/help/guide";

export const metadata: Metadata = { title: "Kullanım rehberi" };

export default function HelpPage() {
  return (
    <main className="workspace-main" id="main" tabIndex={-1}>
      <header className="page-header">
        <h1 tabIndex={-1}>Kullanım rehberi</h1>
      </header>
      <HelpGuide />
    </main>
  );
}

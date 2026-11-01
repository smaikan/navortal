import type { Metadata } from "next";
import { NotesPage } from "../../../features/notes/page";
export const metadata: Metadata = { title: "Notlar", robots: { index: false, follow: false } };
export default function Page() {
  return <NotesPage />;
}

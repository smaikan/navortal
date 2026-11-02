import type { Metadata } from "next";
import { RemindersPage } from "../../../features/reminders/page";
export const metadata: Metadata = { title: "Hatırlatmalar", robots: { index: false, follow: false } };
export default function Page() {
  return <RemindersPage />;
}

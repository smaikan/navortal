import type { Metadata } from "next";
import { SpecialDaysPage } from "../../../../features/special-days/page";
export const metadata: Metadata = { title: "Özel günler", robots: { index: false, follow: false } };
export default function Page() {
  return <SpecialDaysPage />;
}

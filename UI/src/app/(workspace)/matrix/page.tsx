import type { Metadata } from "next";
import { MatrixPage } from "../../../features/matrix/page";
export const metadata: Metadata = { title: "Eisenhower Matrisi", robots: { index: false, follow: false } };
export default function Page() {
  return <MatrixPage />;
}

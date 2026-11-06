import { notFound } from "next/navigation";
import { ErrorProbe } from "./probe";

export const dynamic = "force-dynamic";

export default function ErrorCheckPage() {
  if (process.env.UI_E2E_CHECKS !== "true") notFound();
  return (
    <main className="page" id="main">
      <h1>Hata sınırı kontrolü</h1>
      <ErrorProbe />
    </main>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsRedirect } from "../../../features/preferences/settings-redirect";

export const metadata: Metadata = { title: "Ayarlar" };
export default function Page() {
  return (
    <Suspense fallback={null}>
      <SettingsRedirect />
    </Suspense>
  );
}

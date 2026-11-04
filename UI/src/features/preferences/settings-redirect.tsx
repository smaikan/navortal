"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { readSettingsView } from "./settings-url";

/** /settings eski ve paylaşılan bağlantılar için kalır; Ayarlar artık Gün Planlama üstünde açılan penceredir. */
export function SettingsRedirect() {
  const params = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/planning?settings=${readSettingsView(params.get("section") ?? "profile")}`);
  }, [params, router]);
  return (
    <main id="main" className="workspace-main" tabIndex={-1}>
      <header className="page-header">
        <h1 tabIndex={-1}>Ayarlar</h1>
      </header>
      <p role="status">Ayarlar açılıyor…</p>
    </main>
  );
}

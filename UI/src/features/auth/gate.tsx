"use client";

import { startTransition, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "./provider";
import { safeReturnPath } from "./return-path";
import { WorkspaceQueries } from "./workspace-queries";
import { ShellSkeleton } from "../../components/ui/skeleton";

/** Oturum beklenirken görünen başlıklar gerçek sayfa başlıklarıyla aynı. */
const titles: [string, string][] = [
  ["/planning", "Gün Planlama"],
  ["/tasks/completed", "Biten görevler"],
  ["/tasks", "Görevler"],
  ["/matrix", "Eisenhower Matrisi"],
  ["/calendar", "Takvim"],
  ["/focus", "Pomodoro"],
  ["/pool", "Havuz"],
  ["/projects", "Projeler"],
  ["/notes", "Notlar"],
  ["/recurrences", "Rutin"],
  ["/analytics", "Analiz"],
  ["/reminders", "Hatırlatmalar"],
  ["/settings", "Ayarlar"],
  ["/work", "Çalışma kayıtları"],
  ["/categories", "Kategoriler"],
  ["/guide", "Kullanım rehberi"],
];
const titleOf = (path: string) => titles.find(([p]) => path === p || path.startsWith(p + "/"))?.[1];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { state, session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  // Sorguyu yalnız yönlendirirken okuyoruz. Böylece sunucu kabuğu ve başlığı çizebiliyor.
  useEffect(() => {
    if (state.phase === "anonymous") {
      const next = safeReturnPath(pathname + window.location.search);
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [state.phase, pathname, router]);
  // Diğer aşamalarda sunucuda ve ilk tarayıcı çiziminde aynı öğe kalıyor;
  // çalışma alanı arkada hazır olana kadar kabuk yeniden kurulmadan yerinde duruyor.
  if (state.phase !== "unavailable") {
    const authenticated = state.phase === "authenticated";
    return (
      <Staged
        ready={authenticated}
        fallback={<ShellSkeleton label="Çalışma alanın açılıyor…" title={titleOf(pathname)} />}
      >
        {authenticated && <WorkspaceQueries key={session.getIdentity().epoch}>{children}</WorkspaceQueries>}
      </Staged>
    );
  }
  return (
    <main id="main" className="page" tabIndex={-1}>
      <section className="empty-state">
        <h1>Çalışma alanına bağlanılamadı</h1>
        <p className="muted">Girişin bu tarayıcıda duruyor. Bağlantını kontrol edip yeniden deneyebilirsin.</p>
        <div className="actions">
          <button className="primary" onClick={() => void session.verify()}>
            Yeniden dene
          </button>
          <button onClick={() => session.forget()}>Giriş ekranına dön</button>
        </div>
      </section>
    </main>
  );
}

/** Oturum hemen güncelleniyor, çalışma alanı transition içinde kısa parçalarla çiziliyor. Oturum giderse kabuk hemen görünür, dönerse alan doğrudan açılır. shown değerini çizim sırasında sıfırlamıyoruz; tamamlanmayan çizim kabuğu kalıcı bırakabiliyordu. */
function Staged({
  ready,
  children,
  fallback,
}: {
  ready: boolean;
  children: React.ReactNode;
  fallback: React.ReactNode;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!ready) return;
    startTransition(() => setShown(true));
    // Yoğun cihaz veya kesintiler transition'ı geciktirebilir. Çalışma alanı bundan fazla beklemesin.
    const timer = setTimeout(() => setShown(true), 1000);
    return () => clearTimeout(timer);
  }, [ready]);
  return ready && shown ? children : fallback;
}

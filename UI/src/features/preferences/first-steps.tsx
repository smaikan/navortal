"use client";
import Link from "next/link";
import { useDisplayPreferences } from "../workspace/queries";

export function FirstSteps() {
  const preferences = useDisplayPreferences();
  return (
    <section className="empty-state" aria-label="Çalışma alanının durumu">
      <h2>{preferences.data?.values.hasWorkingWindows ? "Çalışma saatlerin hazır" : "Günün için bir alan"}</h2>
      {preferences.isPending ? (
        <p role="status">Çalışma tercihlerin okunuyor…</p>
      ) : preferences.isError ? (
        <div role="alert">
          <p>Çalışma tercihlerin alınamadı.</p>
          <button onClick={() => void preferences.refetch()}>Yeniden yükle</button>
        </div>
      ) : (
        <p className="muted">
          {preferences.data.values.hasWorkingWindows
            ? "Saatlerini ve tarih istisnalarını Ayarlar'da değiştirebilirsin."
            : "Haftalık çalışma saati belirlemediğin için günün tamamı kullanılabilir. İstersen Ayarlar'dan saatlerini sınırlayabilirsin."}
        </p>
      )}
      <p className="muted">
        Görev eklemek takvimine zaman ayırmaz. Bugün ekranında mevcut bir görev seçip manuel plan bloğu ekleyebilirsin.
      </p>
      <div className="actions">
        <Link className="button" prefetch={false} href="/settings?section=hours">
          Çalışma saatlerini belirle
        </Link>
        <Link className="button" prefetch={false} href="/tasks">
          Görevler bölümüne git
        </Link>
      </div>
    </section>
  );
}

"use client";
import { useSearchParams } from "next/navigation";
import { useTaskPanel } from "../../../components/layout/task-panel";
import { InlineError } from "../../../components/ui/inline-error";

export function ShellProbe() {
  const open = useTaskPanel();
  const state = useSearchParams().get("state");
  return (
    <main className="workspace-main" id="main" tabIndex={-1}>
      <header className="page-header">
        <h1 tabIndex={-1}>
          {state === "long"
            ? "İstanbul'daki uzun vadeli araştırma ve çalışma planını küçük, uygulanabilir adımlara ayırırken bütün ayrıntıları ve kaynakları yeniden değerlendir ".repeat(
                2,
              )
            : "Kabuk denetimi"}
        </h1>
        <p className="muted">Yalnız test örneği; görev veya çalışma kaydı değildir.</p>
      </header>
      <section className="empty-state">
        {state === "loading" ? (
          <p role="status">Test içeriği yükleniyor…</p>
        ) : state === "error" ? (
          <InlineError
            retry={
              <button onClick={event => event.currentTarget.closest("main")?.querySelector("h1")?.focus()}>
                Test başlığına dön
              </button>
            }
          >
            Test kaynağı yüklenemedi. Gerçek bir API hatası oluşturulmadı.
          </InlineError>
        ) : (
          <p>Bu örnek URL, kaydırma ve odak davranışını denetler.</p>
        )}
        <div className="actions">
          <button onClick={event => open("00000000-0000-0000-0000-000000000001", event.currentTarget)}>
            Ayrıntı örneğini aç
          </button>
        </div>
      </section>
      <div style={{ minHeight: "110vh", paddingTop: "90vh" }}>
        <button>Son satır denetimi</button>
      </div>
    </main>
  );
}

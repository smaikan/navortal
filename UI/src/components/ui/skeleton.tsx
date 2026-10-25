/** Yükleme blokları gerçek yerleşimi koruyor, içerik gelince sayfa zıplamıyor. Ekran okuyucu tek durum satırını duyuyor, boş blokları duymuyor. */
export function ListSkeleton({
  label,
  rows = 4,
  className = "",
}: {
  label: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div className={`skeleton-list ${className}`}>
      <p role="status" className="sr-only">
        {label}
      </p>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row" aria-hidden="true">
          <span className="skeleton-box" />
          <span className="skeleton-line" style={{ width: `${[72, 54, 64, 46, 58][i % 5]}%` }} />
          <span className="skeleton-chip" />
        </div>
      ))}
    </div>
  );
}

/** Oturum doğrulanmadan aynı menü ve başlıkla kabuk çiziliyor ama özel veri yok. Bilinen sayfa başlığı hemen geliyor, en büyük öğe veri beklemeden boyanabiliyor. */
/** Gerçek sayfaların ölçek sınıfı; iskelet de aynı ölçekle çizilsin diye. */
function scaleClass(title?: string) {
  if (title === "Gün Planlama" || title === "Görevler") return " wide-scale";
  if (title === "Analiz" || title === "Hatırlatmalar") return " soft-scale";
  return "";
}

export function ShellSkeleton({ label, title }: { label: string; title?: string }) {
  return (
    <div className="workspace-shell boot-shell">
      <aside className="workspace-sidebar" aria-hidden="true">
        <span className="skeleton-line boot-brand" />
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="skeleton-line boot-nav" />
        ))}
      </aside>
      <div className="workspace-area">
        <header className="workspace-header" aria-hidden="true">
          <span className="skeleton-box boot-icon" />
          <span className="skeleton-box boot-icon" />
        </header>
        <main id="main" className={`workspace-main${scaleClass(title)}`} tabIndex={-1}>
          {title ? (
            <h1 tabIndex={-1} className="boot-heading">
              {title}
            </h1>
          ) : (
            <span className="skeleton-line boot-title" aria-hidden="true" />
          )}
          <ListSkeleton label={label} rows={5} />
        </main>
      </div>
      <nav className="mobile-navigation boot-bar" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i}>
            <span className="skeleton-box boot-icon" />
          </span>
        ))}
      </nav>
    </div>
  );
}

/** Oturum kontrol edilirken giriş formu kadar yer bırakıyoruz. */
export function FormSkeleton({ label }: { label: string }) {
  return (
    <div className="skeleton-form">
      <p role="status" className="sr-only">
        {label}
      </p>
      <span className="skeleton-line boot-title" aria-hidden="true" />
      {[0, 1].map(i => (
        <span key={i} className="skeleton-field" aria-hidden="true" />
      ))}
      <span className="skeleton-button" aria-hidden="true" />
    </div>
  );
}

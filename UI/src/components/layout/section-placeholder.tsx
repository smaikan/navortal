import Link from "next/link";

export function SectionPlaceholder({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="workspace-main" id="main" tabIndex={-1}>
      <header className="page-header">
        <h1 tabIndex={-1}>{title}</h1>
      </header>
      <section className="empty-state">
        <h2>Bu bölüm henüz kullanıma açılmadı</h2>
        <p className="muted">{children}</p>
        <div className="actions">
          <Link className="button" href="/planning">
            Bugüne dön
          </Link>
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page" id="main" tabIndex={-1}>
      <h1>Bu sayfa bulunamadı</h1>
      <div className="empty-state">
        <p className="muted">Bağlantı değişmiş veya sayfa kaldırılmış olabilir.</p>
        <div className="actions">
          <Link className="button" href="/">
            Başlangıca dön
          </Link>
        </div>
      </div>
    </main>
  );
}

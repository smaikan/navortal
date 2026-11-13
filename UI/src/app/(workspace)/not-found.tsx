import Link from "next/link";

export default function WorkspaceNotFound() {
  return (
    <main className="workspace-main workspace-not-found" id="main" tabIndex={-1}>
      <p className="workspace-not-found-code">404</p>
      <h1 tabIndex={-1}>Bu sayfa bulunamadı</h1>
      <p className="muted">
        Bağlantı değişmiş veya sayfa kaldırılmış olabilir. Soldaki menüden devam edebilir ya da bugününe dönebilirsin.
      </p>
      <div className="actions">
        <Link className="button primary" href="/planning" prefetch={false}>
          Gün Planlama’ya dön
        </Link>
        <Link className="button" href="/tasks" prefetch={false}>
          Görevler
        </Link>
      </div>
    </main>
  );
}

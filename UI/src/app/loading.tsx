export default function Loading() {
  return (
    <main className="page" id="main" tabIndex={-1} aria-busy="true">
      <h1>Çalışma alanın yükleniyor</h1>
      <div className="loading-lines" aria-hidden="true">
        <span />
        <span />
      </div>
    </main>
  );
}

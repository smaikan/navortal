"use client";

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="tr">
      <head>
        <title>Çalışma alanı açılamadı</title>
        <meta name="robots" content="noindex,nofollow" />
      </head>
      <body
        style={{
          margin: 0,
          padding: 24,
          background: "#F7F6F3",
          color: "#1F2933",
          /* Burada globals.css yok, UI-R1 açık tema renklerini kullanıyoruz. */ fontFamily: "system-ui",
          lineHeight: 1.6,
        }}
      >
        <main id="main">
          <h1>Çalışma alanı açılamadı</h1>
          <p>Yeniden deneyebilirsin.</p>
          <button onClick={retry} style={{ minHeight: 44, padding: "8px 16px", fontSize: 16, cursor: "pointer" }}>
            Yeniden dene
          </button>
        </main>
      </body>
    </html>
  );
}

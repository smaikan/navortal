"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSession } from "../features/auth/provider";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const { session } = useSession();
  useEffect(() => {
    heading.current?.focus();
  }, []);
  // Çizim hatasını yalnız doğrulanmış oturumda, kişisel bilgileri maskeleyerek bildiriyoruz. Açık sayfalarda bildirim yok.
  useEffect(() => {
    void import("../lib/errors/reporter").then(module => module.reportClientError(session, "React", error));
  }, [error, session]);
  return (
    <main className="page" id="main" tabIndex={-1}>
      <h1 ref={heading} tabIndex={-1}>
        Bu ekran açılamadı
      </h1>
      <div className="empty-state">
        <p>Yeniden deneyebilir veya başlangıca dönebilirsin.</p>
        <div className="actions">
          <button className="primary" onClick={retry}>
            Yeniden dene
          </button>
          <Link className="button" href="/">
            Başlangıca dön
          </Link>
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";
import { legalLinks } from "../legal/links";
import { BrandMark } from "../../components/ui/brand-mark";

/** Karşılama sunucuda kalıyor, yalnız mevcut form tarayıcıda bağlanıyor. */
export function AuthFrame({ children, welcome = false }: { children: React.ReactNode; welcome?: boolean }) {
  return (
    <div className={`auth-page${welcome ? " auth-page-arcs" : ""}`}>
      <header className="auth-topbar">
        <Link className="auth-brand" href="/">
          <BrandMark size={23} />
          Navortal
        </Link>
        {!welcome && <Link href="/help">Yardım</Link>}
      </header>
      <main
        id="main"
        className={`auth-welcome ${welcome ? "auth-welcome-full" : "auth-welcome-compact"}`}
        tabIndex={-1}
      >
        <div className="auth-form-panel">
          {!welcome && (
            <div className="auth-welcome-mark" aria-hidden="true">
              <BrandMark size={36} />
            </div>
          )}
          <div className="auth-form-section">{children}</div>
          {!welcome && <p className="auth-footnote">Kendine ait bir alan. Kendi hızında bir başlangıç.</p>}
          <nav className="auth-legal-links" aria-label="Gizlilik ve kullanım">
            {legalLinks.map(link => (
              <Link key={link.href} href={link.href} target="_blank" rel="noopener">
                {link.label}
                <span className="sr-only"> (yeni sekmede açılır)</span>
              </Link>
            ))}
          </nav>
        </div>
      </main>
    </div>
  );
}

/** Güneşi sabit çiziyoruz, süs simgesi için tarayıcıda ek bağlama işi olmasın. */

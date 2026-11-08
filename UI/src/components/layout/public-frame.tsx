import Link from "next/link";
import { Mail } from "lucide-react";
import { BrandMark } from "../ui/brand-mark";
import styles from "./public-frame.module.css";
import { legalLinks } from "../../features/legal/links";
import { legalProfile } from "../../features/legal/profile";

const contact = legalLinks.filter(link => link.href === "/contact");
const footerGroups = [
  {
    id: "footer-product",
    title: "Ürün",
    links: [
      { href: "/features", label: "Özellikler" },
      { href: "/how-it-works", label: "Nasıl çalışır?" },
      { href: "/help", label: "Kullanım yardımı" },
    ],
  },
  { id: "footer-legal", title: "Yasal", links: legalLinks.filter(link => link.href !== "/contact") },
  { id: "footer-support", title: "Destek", links: contact },
];

/** Ürünün güneş işareti. Uygulama kabuğunda da aynı şekil kullanılıyor. */

export function PublicFrame({
  title,
  intro,
  children,
  heroActions,
  landing = false,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
  heroActions?: React.ReactNode;
  landing?: boolean;
}) {
  const Intro = landing ? "section" : "header";
  const legal = legalProfile();
  return (
    <div className={styles.frame + (landing ? " landing-page " + styles.landing : "")}>
      <header className={styles.navigation}>
        <Link href="/" className="auth-brand">
          <BrandMark size={24} />
          Navortal
        </Link>
        <nav aria-label="Ürün">
          <Link href="/features">Özellikler</Link>
          <Link href="/how-it-works">Nasıl çalışır?</Link>
          <Link href="/help">Yardım</Link>
        </nav>
        <Link href="/login" className={styles.signIn}>
          Giriş yap
        </Link>
        {landing && (
          <Link href="/register" className={styles.startFree}>
            Ücretsiz başla
          </Link>
        )}
      </header>
      <main className={landing ? styles.landingContent : `page ${styles.content}`} id="main" tabIndex={-1}>
        <Intro className={landing ? styles.hero : "page-header"} aria-label={landing ? "Başlangıç" : undefined}>
          <h1>{title}</h1>
          <p>{intro}</p>
          {heroActions}
        </Intro>
        {children}
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerPanel}>
          <div className={styles.footerMain}>
            <div className={styles.footerBrand}>
              <strong>
                <BrandMark size={24} />
                Navortal
              </strong>
              <p>Kendine ait bir alan. Kendi hızında bir gün.</p>
              {legal.email && (
                <a className={styles.footerMail} href={`mailto:${legal.email}`}>
                  <Mail aria-hidden="true" size={15} />
                  {legal.email}
                </a>
              )}
            </div>
            <nav className={styles.footerNav} aria-label="Alt bilgi">
              {footerGroups.map(group => (
                <div key={group.id} className={styles.footerGroup} role="group" aria-labelledby={group.id}>
                  <p id={group.id}>{group.title}</p>
                  {group.links.map(link => (
                    <Link key={link.href} href={link.href}>
                      {link.label}
                    </Link>
                  ))}
                </div>
              ))}
            </nav>
          </div>
          <div className={styles.footerBottom}>
            <span>© {new Date().getFullYear()} Navortal</span>
            <span>Ücretsiz kişisel planlayıcı</span>
            {!legal.ready && <span>Yasal metinler taslaktır; işletmeci bilgileri tamamlanınca güncellenecek.</span>}
          </div>
        </div>
      </footer>
    </div>
  );
}

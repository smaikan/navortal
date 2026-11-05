import Link from "next/link";
import { PublicFrame } from "../../components/layout/public-frame";
import { publicMetadata } from "../../lib/seo";
import { legalLinks, type LegalPath } from "./links";
import { legalProfile } from "./profile";
import styles from "./legal.module.css";

export function legalMetadata(path: LegalPath, title: string, description: string) {
  return {
    ...publicMetadata(path, title, description),
    // Eksik işletmeci bilgili taslak, indekslenebilir son metin gibi sunulmamalı.
    ...(!legalProfile().ready ? { robots: { index: false, follow: false } } : {}),
  };
}

export function LegalFrame({
  path,
  title,
  intro,
  children,
}: {
  path: LegalPath;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <PublicFrame title={title} intro={intro}>
      <div className={styles.layout}>
        <nav className={styles.navigation} aria-label="Gizlilik ve kullanım">
          {legalLinks.map(link => (
            <Link key={link.href} href={link.href} aria-current={path === link.href ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>
        <article className={styles.article}>
          <p className={styles.version}>Son güncelleme: 7 Kasım 2026 · Sürüm 3</p>
          {!legalProfile().ready && (
            <aside className={styles.draft} aria-label="Metin durumu">
              <strong>Yayın öncesi taslak</strong>
              <p>
                İşletmeci, hizmet sağlayıcıları ve saklama bilgileri henüz tamamlanmadı. Bu metinler bu bilgiler
                doğrulanmadan nihai aydınlatma olarak kullanılamaz.
              </p>
            </aside>
          )}
          {children}
        </article>
      </div>
    </PublicFrame>
  );
}

export function ControllerDetails() {
  const profile = legalProfile();
  return (
    <dl className={styles.details}>
      <div>
        <dt>Veri sorumlusu</dt>
        <dd>{profile.name ?? "Henüz bildirilmedi."}</dd>
      </div>
      {profile.address !== profile.email && (
        <div>
          <dt>Başvuru adresi</dt>
          <dd>{profile.address ?? "Henüz bildirilmedi."}</dd>
        </div>
      )}
      <div>
        <dt>E-posta</dt>
        <dd>
          {profile.email ? (
            <a href={`mailto:${encodeURIComponent(profile.email)}`}>{profile.email}</a>
          ) : (
            "Henüz bildirilmedi. Başvuru kanalı yayın öncesinde tamamlanacak."
          )}
        </dd>
      </div>
    </dl>
  );
}

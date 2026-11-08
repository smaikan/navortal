import Link from "next/link";
import { Suspense } from "react";
import { PublicFrame } from "../components/layout/public-frame";
import { publicMetadata, structuredData, websiteData } from "../lib/seo";
import { ProductPreview } from "../features/landing/product-preview";
import styles from "../features/landing/landing.module.css";

const description =
  "Navortal, Türkçe kişisel görev ve gün planlayıcısı. Görevlerini toparla, gününe yer aç ve sıradaki işe kendi ritminde başla.";
export const metadata = publicMetadata("/", "Navortal", description);
export default function HomePage() {
  const data = structuredData(description);
  const website = websiteData();
  return (
    <PublicFrame
      landing
      title="Zihnin dağınık olabilir, planın olmasın."
      intro="Büyük işleri küçük, yapılabilir adımlara böl. Gününe gerçekçi bir yer aç ve dikkatini yalnızca sıradaki adıma ver."
      heroActions={
        <div className={styles.heroActions}>
          <Link className="button primary" href="/register">
            Ücretsiz başla
          </Link>
          <Link className={styles.secondaryAction} href="/how-it-works">
            Nasıl çalışır?
          </Link>
        </div>
      }
    >
      {data && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: data }} />}
      {website && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: website }} />}
      {/* Sayfa kaydıkça güneş yayda ilerler. Yalnız CSS; ek JavaScript yok. */}
      <div className={styles.sky} aria-hidden="true">
        <div>
          <i />
          <i />
          <i />
          <i />
          <span className={styles.sunPath}>
            <b />
          </span>
        </div>
      </div>
      <section className={styles.previewSection} aria-label="Uygulama önizlemesi">
        {/* Önizleme modülü ön çizimde bekleyebilir. Aynı boydaki kendi Suspense alanında kalsın, kök yükleniyor başlığı HTML'e girmesin. */}
        <Suspense fallback={<div className={styles.previewFallback} aria-hidden="true" />}>
          <ProductPreview />
        </Suspense>
      </section>
      <section className={styles.workflow} aria-labelledby="workflow-title">
        <h2 id="workflow-title">Görevden güne, üç adımda</h2>
        <ol className={styles.steps}>
          <li>
            <h3>Görevini ekle</h3>
            <p>Büyük işleri alt görevlere böl, ilerlemeyi takip et.</p>
            <div className={styles.stepBox} aria-hidden="true">
              <span className={styles.stepHead}>
                <strong>Tez bölüm 4</strong>
                <span>1/2</span>
                <i />
              </span>
              <s>Kaynakları topla</s>
              <span className={styles.stepChild}>Tabloları hazırla</span>
            </div>
          </li>
          <li>
            <h3>Gününe yerleştir</h3>
            <p>Saat ver ya da saatsiz bırak. Plan güne sığmıyorsa görürsün.</p>
            <div className={styles.stepBox} aria-hidden="true">
              <span className={styles.stepRow}>
                Tabloları hazırla<span>14:00</span>
              </span>
              <span className={styles.stepRow}>
                Dişçiyi ara<span>5 dk</span>
              </span>
              <span className={styles.stepRow}>
                Mutfağı topla<span>25 dk</span>
              </span>
            </div>
          </li>
          <li>
            <h3>Çalış ve takip et</h3>
            <p>Sayaç sayfalar arasında seninle gelir, gerçek süre kaydedilir.</p>
            <div className={styles.stepBox} aria-hidden="true">
              <span className={styles.stepTimer}>
                <i />
                Çalışılıyor
                <strong>24:12</strong>
                <span>Duraklat</span>
              </span>
            </div>
          </li>
        </ol>
      </section>
      <section className={styles.closing} aria-labelledby="closing-title">
        <h2 id="closing-title">Bugünün planını birkaç dakikada kur.</h2>
        <Link className="button primary" href="/register">
          Ücretsiz başla
        </Link>
      </section>
    </PublicFrame>
  );
}

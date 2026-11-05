import Link from "next/link";
import { PublicFrame } from "../../components/layout/public-frame";
import { publicMetadata } from "../../lib/seo";
export const metadata = publicMetadata(
  "/how-it-works",
  "Nasıl çalışır?",
  "İlk görevini oluştur, gününü planla, çalışmanı başlat ve gün sonunda plan ile gerçek çalışmayı karşılaştır.",
);
export default function PublicPage() {
  return (
    <PublicFrame title="Nasıl çalışır?" intro="Bütün ayarları bitirmen gerekmez. İlk küçük işten başlayabilirsin.">
      <section>
        <h2>İlk görevden gün sonuna</h2>
        <ol>
          <li>
            <strong>Hesabını oluştur.</strong> E-posta ve en az 6 karakter parola kullan. Çalışma alanın sana aittir;
            örnek görevler kendiliğinden eklenmez.
          </li>
          <li>
            <strong>Bir görev yaz.</strong> Görevler bölümünde başlık gir. Büyükse alt adımlara böl; süre tahminini
            hazır olduğunda ekle.
          </li>
          <li>
            <strong>Bugün için karar ver.</strong> Görevi gün planına ekle. Otomatik planlama kullanacaksan önce
            Ayarlar’dan çalışma saatlerini belirle. Varsayılan öneriyi inceleyip onaylarsın; sığmayan işler görünür
            kalır.
          </li>
          <li>
            <strong>Çalışmayı başlat.</strong> Planlı veya plansız görevin üzerinde çalışabilirsin. Ara vermek için
            duraklat, geri dönünce devam et. Oturumu bitirmek ve görevi tamamlamak ayrı kararlardır.
          </li>
          <li>
            <strong>Gün sonunda gözden geçir.</strong> Analiz bölümünde gerçek süreyi ve plan uyumunu incele. Bitmeyen
            işi yeniden planlamak önceki çalışmanı silmez.
          </li>
        </ol>
      </section>
      <section>
        <h2>Bir yerde takılırsan</h2>
        <p>
          <Link href="/help">Giriş, çalışma kaydı, planlama ve bildirimler için kullanım yardımını aç.</Link>
        </p>
      </section>
    </PublicFrame>
  );
}

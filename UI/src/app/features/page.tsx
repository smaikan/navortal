import { PublicFrame } from "../../components/layout/public-frame";
import { publicMetadata } from "../../lib/seo";
export const metadata = publicMetadata(
  "/features",
  "Özellikler",
  "Görev ve alt adımlar, saatli veya saatsiz gün planı, odak oturumları ve gerçek çalışma analizini tanı.",
);
export default function PublicPage() {
  return (
    <PublicFrame
      title="Özellikler"
      intro="Yapılacak iş, o iş için ayrılan plan ve gerçekten çalışılan süre ayrı ayrı görünür."
    >
      <section>
        <h2>Görevleri küçük adımlara ayır</h2>
        <p>
          Başlıkla görev oluştur, alt görevler ekle. Açıklama, tahmin, ön koşullar, proje ve havuz bağlarını ihtiyaç
          oldukça düzenle. Tahmin eklenmeyen süre sıfır kabul edilmez.
        </p>
      </section>
      <section>
        <h2>Gününü planla</h2>
        <p>
          Bugün ekranında saatli ve saatsiz plan öğelerini yönet. Çalışma saatlerini belirle; otomatik planlama
          önerisinde önce ve sonrayı, sabitleri ve sığmayan işleri inceleyip uygulama kararını ver.
        </p>
      </section>
      <section>
        <h2>Çalışmaya başla, ara ver, geri dön</h2>
        <p>
          Göreve bağlı gerçek çalışma kaydı başlat. Odak ve mola sürelerini tercihlerine göre kullan; duraklat ve devam
          et. Sayaç bitmesi görevi tamamlamaz. Tarayıcıyı kapatman da açık çalışmayı bitirmez.
        </p>
      </section>
      <section>
        <h2>Günün gerçeğini gör</h2>
        <p>
          Gerçek çalışma analizinde harcanan süreyi; plan analizinde ilk planı, güncel planı ve gerçekleşeni
          karşılaştır. Eksik verinin ve oranların kapsamı açıklanır. Tahmin önerisi tahminini kendiliğinden değiştirmez.
        </p>
      </section>
      <section>
        <h2>Destekleri kendin seç</h2>
        <p>
          Notlar, küçük sonraki adım ve hatırlatmaları ihtiyacına göre kullan. Tarayıcı bildirimi cihazın desteğine ve
          iznine bağlıdır; kurulum ve bildirimler için Yardım sayfasındaki koşulları incele.
        </p>
      </section>
    </PublicFrame>
  );
}

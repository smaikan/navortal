import Link from "next/link";
import { PublicFrame } from "../../components/layout/public-frame";
import { publicMetadata } from "../../lib/seo";
export const metadata = publicMetadata(
  "/help",
  "Kullanım yardımı",
  "Giriş ve parola, görev ve plan ayrımı, açık çalışma, eksik süreler ve tarayıcı bildirimleri için gerçek kullanım yardımı.",
);
export default function PublicPage() {
  return (
    <PublicFrame title="Kullanım yardımı" intro="Bir sonraki adımı bulmak için sık karşılaşılan durumlar.">
      <section>
        <h2>Hesap ve giriş</h2>
        <h3>Parolamı unuttum</h3>
        <p>
          <Link href="/forgot-password">Parola yenileme bağlantısı iste.</Link> E-posta teslimi hizmetin e-posta
          yapılandırmasına bağlıdır. İstek alındı mesajı e-postanın teslim edildiği anlamına gelmez.
        </p>
        <h3>Çıkış yaptığımda ne olur?</h3>
        <p>
          Bu tarayıcıdaki giriş ve kişisel önbellek temizlenir. Başka cihazlardaki girişler kapanmaz. Paylaşılan bir
          cihaz kullanıyorsan işin bitince çıkış yap.
        </p>
      </section>
      <section>
        <h2>Görev ve plan</h2>
        <h3>Görev oluşturdum, neden gün planında yok?</h3>
        <p>
          Görev tanımı ve gün planı ayrı kayıtlardır. Görevi Bugün ekranından ilgili güne planla. Plansız bir görevin
          üzerinde çalışmaya da başlayabilirsin.
        </p>
        <h3>Otomatik plan neden iş yerleştirmiyor?</h3>
        <p>
          Ayarlar’da çalışma saatlerini kontrol et. Süre tahmini, ön koşul, sabit blok veya kapasite eksikliği varsa
          önerideki nedenleri incele. Öneri, sen uygulamadan kaydedilmiş plan değildir.
        </p>
        <h3>Süre neden bilinmiyor görünüyor?</h3>
        <p>
          İşin bir bölümünün tahmini eksik olabilir. Bilinmeyen süre sıfır değildir; görev ayrıntısında hangi kendi
          işinin veya alt adımın tahmine ihtiyaç duyduğunu kontrol et.
        </p>
      </section>
      <section>
        <h2>Açık çalışma ve sayaç</h2>
        <h3>Sayaç bitti ama görev açık kaldı</h3>
        <p>
          Sayaç bir süreyi takip eder; tamamlandığına sen karar verirsin. Çalışmayı bitirip görevi ayrıca tamamlayabilir
          veya çalışmaya devam edebilirsin.
        </p>
        <h3>Tarayıcıyı kapattım, çalışma hâlâ açık</h3>
        <p>
          Tarayıcıyı kapatmak oturumu bitirmez. Tekrar giriş yaptığında aktif çalışmanı kontrol et; gerekiyorsa duraklat
          veya bitir. Yanlış kaydedilen çalışma için düzeltme seçeneklerini kullan.
        </p>
      </section>
      <section>
        <h2>Bağlantı, kurulum ve bildirimler</h2>
        <p>
          Bağlantın kesildiğinde yazma işlemi kaydedilmiş gibi gösterilmez ve sonradan sessizce gönderilmek üzere
          kuyruğa alınmaz. Sonucu belirsiz bir işlemde bağlantı gelince güncel kaydı kontrol et.
        </p>
        <p>
          Uygulamayı kurma ve tarayıcı bildirimi desteği cihaz ve tarayıcıya bağlıdır. Push için güvenli HTTPS
          bağlantısı, hizmet yapılandırması ve senin iznin gerekir. iPhone ve iPad’de desteklenen sürümlerde ana ekrana
          ekleme gerekebilir. Bildirim panelinden destek ve izin durumunu kontrol et; tüm cihazlarda teslim garantisi
          yoktur.
        </p>
      </section>
    </PublicFrame>
  );
}

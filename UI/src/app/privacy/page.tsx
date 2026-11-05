import Link from "next/link";
import { LegalFrame, legalMetadata } from "../../features/legal/frame";

export const metadata = legalMetadata(
  "/privacy",
  "Gizlilik",
  "Kişisel alanın, bildirimlerin ve hesap güvenliğin hakkında kısa açıklamalar.",
);
export default function Privacy() {
  return (
    <LegalFrame
      path="/privacy"
      title="Gizlilik"
      intro="Planın sana ait. Verilerinle ilgili temel bilgileri açıkça bulabilmelisin."
    >
      <section>
        <h2>Kişisel alanın</h2>
        <p>
          Hesap açmak için e-posta ve parola kullanılır. Görevlerin, notların, planların ve çalışma kayıtların sunucuda
          hesabınla ilişkilidir. Uygulama hesaplar arasındaki erişimi sınırlar; içeriklerin herkese açık bir profil veya
          akışta yayımlanmaz.
        </p>
      </section>
      <section>
        <h2>Hangi bilgiler kullanılır?</h2>
        <p>
          Uygulama kaydettiğin içerikleri, planlama tercihlerini, çalışma sürelerini ve oturum bilgilerini hizmeti
          sağlamak için kullanır. Kendi çalışma analizlerin, uygulamadaki kayıtlarından üretilir. Reklam çerezi veya
          üçüncü taraf ziyaretçi analitiği uygulama kodunda kullanılmaz. Verilerin satılmaz ve reklam için kullanılmaz.
        </p>
        <p>
          Veri kategorileri, hukuki sebepler, alıcılar ve hakların için{" "}
          <Link href="/privacy-notice">KVKK Aydınlatma Metni’ni</Link> inceleyebilirsin.
        </p>
      </section>
      <section>
        <h2>Bildirimler senin seçimin</h2>
        <p>
          Cihaz bildirimleri kendiliğinden açılmaz. Tercihler’den açıp tarayıcıya izin vermen gerekir. Bildirimler
          hatırlatma veya görev adını içerebilir; ortak cihazlarda ve kilit ekranında görünür olabileceğini dikkate al.
          Bildirim tercihlerini ve cihaz aboneliğini Hatırlatmalar › Tercihler’den değiştirebilirsin. Tarayıcı iznini de
          tarayıcı ayarlarından kaldırabilirsin.
        </p>
      </section>
      <section>
        <h2>Profil fotoğrafın</h2>
        <p>
          İstersen Ayarlar’dan ad soyadını ve fotoğrafını düzenleyebilirsin. Fotoğraflar Cloudinary’de korumalı
          saklanır; uygulama fotoğrafı yalnız hesabına giriş yapıldığında sunar. Fotoğrafını değiştirince veya
          kaldırınca eski dosya sağlayıcıdan silinmeye çalışılır. Sağlayıcı kesintisi veya sonucu belirsiz bir işlemde
          korumalı, hesaba bağlı olmayan dosya kalabilir. Ayrıntılar{" "}
          <Link href="/privacy-notice">KVKK Aydınlatma Metni’nde</Link> açıklanır.
        </p>
      </section>
      <section>
        <h2>Bu cihazda saklananlar</h2>
        <p>
          Giriş çerezi, oturumun bulunabileceğini belirten yerel işaret, görünüm tercihleri ve bildirim için teknik
          kayıtlar tarayıcıda saklanır. Ayrıntılar ve temizleme yolları{" "}
          <Link href="/cookies">Çerezler ve tarayıcı depolaması</Link> sayfasındadır.
        </p>
      </section>
      <section>
        <h2>Hesabını korumak</h2>
        <p>
          Parolalar doğrulama özeti olarak tutulur. Giriş çerezi uygulamanın JavaScript koduna açılmaz. Ayarlar ›
          Hesap’tan bütün cihazlardaki oturumlarını kapatabilirsin. Ortak cihazlarda işin bitince çıkış yap; görevlerine
          parola, kimlik belgesi veya sağlık raporu gibi hassas içerikler ekleme.
        </p>
        <p>
          Hiçbir internet hizmeti kesintisiz erişim veya mutlak güvenlik garantisi veremez. Önemli bilgilerin için
          ayrıca kendi kopyanı sakla.
        </p>
      </section>
      <section>
        <h2>Verilerin hakkında talep</h2>
        <p>
          Çıkış yapmak verilerini silmez. Erişim, düzeltme ve silme talepleri için{" "}
          <Link href="/contact">İletişim ve KVKK başvurusu</Link> sayfasını kullanabilirsin. Henüz uygulama içinde bir
          hesabı kalıcı olarak silme düğmesi bulunmuyor.
        </p>
      </section>
    </LegalFrame>
  );
}

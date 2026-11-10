import { LegalFrame, legalMetadata } from "../../features/legal/frame";

export const metadata = legalMetadata(
  "/cookies",
  "Çerezler ve tarayıcı depolaması",
  "Giriş çerezi, yerel tercihler ve cihaz bildirimi kayıtlarının amacı ve süresi.",
);
export default function Cookies() {
  return (
    <LegalFrame
      path="/cookies"
      title="Çerezler ve tarayıcı depolaması"
      intro="Bu tarayıcıda ne saklandığını ve nasıl yönetebileceğini öğren."
    >
      <section>
        <h2>Giriş çerezi</h2>
        <p>
          <code>__Host-adhd_session</code> hesabındaki oturumu doğrulamak için kullanılır. Yerel geliştirmede adı{" "}
          <code>adhd_session</code> olur. Birinci taraf çerezidir; HttpOnly ve SameSite=Strict kullanır, yayın ortamında
          Secure niteliği taşır. JavaScript tarafından okunamaz.
        </p>
        <p>
          Çerezin azami ömrü yaklaşık 400 gündür. Etkin kullanımda sunucu oturum kontrolüyle yenilenebilir. Çıkış,
          ilgili oturumu sunucuda kapatır ve cihazdaki çerezi temizler; tüm cihazlardan çıkış bütün oturumları kapatır.
          Çerezi engellersen giriş gerektiren özellikler çalışmaz.
        </p>
      </section>
      <section>
        <h2>Google ile giriş</h2>
        <p>
          Google girişi etkinse giriş ve hesap bağlama ekranlarında Google Identity Services yüklenir. Giriş isteğini
          doğrulayan birinci taraf çerezi <code>__Host-adhd_google_challenge</code> en fazla 10 dakika saklanır;
          HttpOnly, Secure ve SameSite=Strict kullanır ve başarılı işlemde temizlenir. Yerel geliştirmede adı{" "}
          <code>adhd_google_challenge</code> olur. Google’ın hesap seçimi ve oturum hizmetleri kendi alanında çalışır;
          e-posta ve parola girişimiz de kullanılabilir.
        </p>
      </section>
      <section>
        <h2>Yerel görünüm ve kullanım tercihleri</h2>
        <p>
          Tema seçimi, menü görünümü, kapattığın ipuçları ve bazı gün planı görünüm seçimleri localStorage’da saklanır.
          Bunlar reklam amacıyla kullanılmaz. localStorage kayıtları tarayıcının saklama kuralları veya senin temizlemen
          dışında kendiliğinden zaman aşımına uğramaz.
        </p>
        <p>
          <code>adhd.session.v1</code> yalnız “giriş olabilir” işaretidir; parola veya oturum anahtarı içermez. Çıkış
          sırasında temizlenir. Bazı tek seferlik arayüz mesajları sessionStorage’da tutulur ve sekme oturumu sona
          erdiğinde silinir.
        </p>
      </section>
      <section>
        <h2>Çevrimdışı ekran ve cihaz bildirimleri</h2>
        <p>
          Çevrimdışı ekran için service worker ve Cache Storage, bildirimlerin doğru hesaba ve bir kez gösterilmesi için
          IndexedDB kayıtları kullanılabilir. Çevrimdışı önbellek genel uygulama dosyaları içindir; görev ve notlarını
          çevrimdışı düzenlemek üzere kaydetmez.
        </p>
        <p>
          Bildirimleri açarsan tarayıcının push aboneliği ve cihazı ayırt eden yerel bir etiket de tutulur. Bu teknik
          kayıtlar tarayıcı tarafından veya site verilerini temizlediğinde kaldırılabilir. Aboneliği önce Hatırlatmalar
          › Tercihler’den kaldırman, sunucudaki cihaz kaydının da güncellenmesini sağlar.
        </p>
      </section>
      <section>
        <h2>Reklam ve izleme</h2>
        <p>
          Mevcut uygulama kodunda reklam çerezi, Google Analytics veya benzeri üçüncü taraf ziyaretçi izleme aracı
          bulunmaz. Uygulamadaki kişisel çalışma analizleri ziyaretçi takibi değildir. Bu nedenle sana işlevi olmayan
          bir “Tüm çerezleri kabul et” kutusu gösterilmez.
        </p>
        <p>
          Yeni isteğe bağlı izleme araçları eklenirse gerekli bilgilendirme ve izin mekanizması bu araçlar
          çalıştırılmadan önce ayrıca kurulmalıdır.
        </p>
      </section>
      <section>
        <h2>Nasıl temizleyebilirim?</h2>
        <p>
          Önce uygulamadan çıkış yap. Edge’de Ayarlar › Çerezler ve site izinleri, diğer tarayıcılarda site verileri
          bölümünden bu sitenin kayıtlarını silebilirsin. Menü adları tarayıcı sürümüne göre değişebilir. Site
          verilerini silmek tema ve cihaz tercihlerini sıfırlar; sunucudaki görevlerini veya hesabını silmez. Cihaz
          bildirimi izni tarayıcının site izinleri bölümünden ayrıca yönetilir.
        </p>
      </section>
    </LegalFrame>
  );
}

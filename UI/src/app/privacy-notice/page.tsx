import Link from "next/link";
import { ControllerDetails, LegalFrame, legalMetadata } from "../../features/legal/frame";
import { legalProfile } from "../../features/legal/profile";

export const metadata = legalMetadata(
  "/privacy-notice",
  "KVKK Aydınlatma Metni",
  "Hesap, görev, plan ve hatırlatma verilerinin işlenmesi hakkında bilgilendirme.",
);
export default function PrivacyNotice() {
  const profile = legalProfile();
  return (
    <LegalFrame
      path="/privacy-notice"
      title="KVKK Aydınlatma Metni"
      intro="Hangi verileri, hangi amaçla işlediğimizi ve haklarını burada bulabilirsin."
    >
      <section>
        <h2>1. Veri sorumlusu</h2>
        <ControllerDetails />
      </section>
      <section>
        <h2>2. Toplanan veriler ve amaçları</h2>
        <ul>
          <li>
            <strong>Hesap bilgileri:</strong> E-posta adresi, varsa görünen ad ve parolanın doğrulama özeti; hesap
            oluşturmak, girişini doğrulamak ve parola yenilemek için işlenir. Parolanın kendisi veritabanında açık metin
            tutulmaz.
          </li>
          <li>
            <strong>Girdiğin içerikler:</strong> Görevler, alt görevler, notlar, projeler, etiketler, gün planları,
            tekrarlar, hatırlatmalar ve özel günler; istediğin planlama ve hatırlatma işlevlerini sağlamak için
            saklanır.
          </li>
          <li>
            <strong>Çalışma ve tercih kayıtları:</strong> Sayaç oturumları, çalışma süreleri, düzenleme geçmişi, çalışma
            saatleri ve uygulama tercihleri; çalışmayı sürdürmek, planlama ve kendi analizlerini sunmak için kullanılır.
          </li>
          <li>
            <strong>Oturum ve güvenlik bilgileri:</strong> Oturum kimliği, tarayıcı ailesi, oluşturulma ve son kullanım
            zamanları; oturumları yönetmek ve yetkisiz erişimi önlemek için işlenir. Sunucuya yapılan bağlantı IP adresi
            ve teknik istek bilgilerini de içerir.
          </li>
          <li>
            <strong>Teknik hata kayıtları:</strong> Giriş yapmışken uygulama hatası oluşursa hata türü, gizli bilgi
            içermemesi için maskelenen kısa mesaj, sayfa yolu, tarayıcı ailesi ve zaman bilgisi kendi sunucumuza
            iletilebilir. Amaç hataları tespit edip hizmeti düzeltmektir; URL sorgusu ve parçası hata raporuna
            gönderilmez.
          </li>
          <li>
            <strong>Cihaz bildirimleri:</strong> Açmayı seçersen push abonelik adresi, aboneliğe ait teknik anahtarlar,
            cihaz etiketi ve bildirim teslim kayıtları; bildirimleri cihazına ulaştırmak için işlenir.
          </li>
          <li>
            <strong>Başvurular:</strong> İletişim kurduğunda gönderdiğin bilgiler, talebini değerlendirmek ve yanıtlamak
            için kullanılır.
          </li>
        </ul>
      </section>
      <section>
        <h2>3. Toplama yöntemi ve hukuki sebepler</h2>
        <p>
          Veriler kayıt ve giriş formları, uygulamadaki işlemlerin, tarayıcı depolaması, sunucu istekleri ve bildirim
          aboneliği üzerinden elektronik olarak toplanır.
        </p>
        <p>
          Hesabın ve istediğin planlama işlevleri için gerekli veriler, KVKK madde 5/2-c kapsamında sözleşmenin
          kurulması veya ifası; ölçülü oturum ve güvenlik işlemleri madde 5/2-f kapsamında meşru menfaat; mevzuattan
          doğan yükümlülükler varsa madde 5/2-ç; bir hakkın tesisi, kullanılması veya korunması için gerekli kayıtlar
          madde 5/2-e kapsamında değerlendirilir. Bu sebepler ilgili işlem için gerekli olan verilerle sınırlıdır.
        </p>
        <p>
          Bu metin bir açık rıza talebi değildir. Reklam veya pazarlama izni hesap açmanın koşulu değildir. Cihaz
          bildirimi isteğe bağlıdır ve tarayıcı izniyle ayrıca açılır.
        </p>
      </section>
      <section>
        <h2>4. Alıcılar ve yurt dışı aktarım</h2>
        <p>
          <strong>Profil fotoğrafı:</strong> Ayarlar’dan fotoğraf yüklemeyi seçersen resim Cloudinary hizmetine
          aktarılır ve hesabınla ilişkili bir klasörde saklanır. Dosya 256×256 JPEG’e dönüştürülür, gömülü profil/konum
          metadatası temizlenir. Fotoğraf uygulama üzerinden oturum denetimiyle sunulur; sağlayıcının imzalı adresi
          tarayıcıya verilmez. Cloudinary Türkiye dışında veri işleyebilir. Fotoğraf yüklemek hesabı kullanmanın koşulu
          değildir.
        </p>
        <p>
          <strong>Sunucu ve veritabanı:</strong>{" "}
          {profile.hosting ?? "Yayın sağlayıcısı ve veri konumu henüz belirlenmedi."}
        </p>
        <p>
          <strong>E-posta:</strong>{" "}
          {profile.mail ?? "Parola yenileme e-postalarının sağlayıcısı ve veri konumu henüz belirlenmedi."}
        </p>
        <p>
          İzin verdiğin cihaz bildirimleri, kullandığın tarayıcının push hizmeti üzerinden iletilir. Sağlayıcı
          tarayıcıya göre değişir; örneğin Edge Microsoft, Chrome Google hizmetlerini kullanabilir. Bildirim başlığı ve
          metni cihazında gösterilir. Tarayıcı ve cihaz ayarlarına göre kilit ekranında da görünebilir.
        </p>
        <p>
          Yetkili kamu kurumlarına ancak geçerli bir hukuki yükümlülük veya talep kapsamında bilgi verilebilir. Veriler
          reklam hedefleme veya satılmak amacıyla kullanılmaz.
        </p>
        <p>
          Profil fotoğrafı, parola yenileme e-postası ve cihaz bildirimi hizmetleri kullanıldığında verilerin Türkiye
          dışına aktarılabilir. Bu aktarımlar KVKK madde 9 kapsamındadır.
        </p>
      </section>
      <section>
        <h2>5. Saklama ve silme</h2>
        <p>
          {profile.retention ??
            "Mevcut uygulama hesabını ve kaydettiğin içerikleri sunucuda tutar; kullanılmayan hesapları belirli bir süre sonunda otomatik silen bir işlev yoktur. Veri kategorilerine ait saklama, silme ve yedek döngüsü yayın öncesinde belirlenip burada açıklanmalıdır."}
        </p>
        <p>
          Tarayıcıdan çıkış yapmak hesabını veya sunucudaki içeriklerini silmez. Çalışma geçmişi ve bazı bağlı kayıtlar
          uygulamanın tutarlılık kuralları nedeniyle doğrudan silinemeyebilir. Silme ve diğer hak taleplerin{" "}
          <Link href="/contact">KVKK başvuru kanalından</Link> değerlendirilir.
        </p>
      </section>
      <section>
        <h2>6. Hakların ve başvuru</h2>
        <p>
          KVKK madde 11 kapsamında verilerinin işlenip işlenmediğini öğrenebilir; işlenmişse bilgi, amaç ve amaca uygun
          kullanım hakkında açıklama isteyebilir; yurt içinde veya dışında aktarıldığı üçüncü kişileri öğrenebilirsin.
          Eksik veya yanlış verilerin düzeltilmesini, kanundaki şartlar oluştuğunda silinmesini ya da yok edilmesini ve
          bu işlemlerin alıcılara bildirilmesini isteyebilirsin. Yalnız otomatik sistemlerle analiz edilerek aleyhine
          bir sonuç ortaya çıkmasına itiraz edebilir; hukuka aykırı işleme nedeniyle zarar doğmuşsa giderilmesini talep
          edebilirsin.
        </p>
        <p>
          Başvuru yöntemi ve gerekli bilgiler <Link href="/contact">İletişim ve KVKK başvurusu</Link> sayfasında yer
          alır.
        </p>
      </section>
      <section>
        <h2>7. Sağlık verileri hakkında</h2>
        <p>
          Bu bir görev ve gün planlama aracıdır; tanı veya tedavi hizmeti sunmaz. Kayıtta tanı, ilaç veya sağlık raporu
          istenmez. Görev ve not alanlarına sağlık bilgisi veya başkalarının hassas bilgilerini yazmamanı öneririz. Bu
          uyarı, özel nitelikli veri işlemeye yönelik açık rıza yerine geçmez.
        </p>
      </section>
    </LegalFrame>
  );
}

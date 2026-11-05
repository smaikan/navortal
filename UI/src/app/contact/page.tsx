import { ControllerDetails, LegalFrame, legalMetadata } from "../../features/legal/frame";
import { legalProfile } from "../../features/legal/profile";

export const metadata = legalMetadata(
  "/contact",
  "İletişim ve KVKK başvurusu",
  "Destek, kişisel verilerin hakkında bilgi ve hak talepleri için başvuru yolları.",
);
export default function Contact() {
  const profile = legalProfile();
  return (
    <LegalFrame
      path="/contact"
      title="İletişim ve KVKK başvurusu"
      intro="Bir sorun bildirmek veya verilerinle ilgili talepte bulunmak için."
    >
      <section>
        <h2>İletişim bilgileri</h2>
        <ControllerDetails />
        {!profile.email && (
          <p>
            Bu kurulumda henüz bir destek veya KVKK e-posta adresi tanımlanmadı. Çalışır bir başvuru kanalı yayın
            öncesinde eklenecek.
          </p>
        )}
      </section>
      <section>
        <h2>Destek için</h2>
        <p>
          Sorunun hangi ekranda oluştuğunu, beklediğin davranışı ve kullandığın tarayıcıyı yazabilirsin. Parolanı,
          oturum bilgilerini veya hassas kişisel içeriklerini gönderme. Ekran görüntüsünde kişisel bilgileri gizle.
        </p>
      </section>
      <section>
        <h2>KVKK kapsamında başvuru</h2>
        <p>
          Verilerinin işlenmesi, erişim, düzeltme veya silme gibi taleplerini veri sorumlusuna iletebilirsin. Özel bir
          başvuru formu doldurman zorunlu değildir.
        </p>
        <p>
          Başvurunu, hesabında kayıtlı e-posta adresinden yukarıdaki adrese gönderebilirsin. Mevzuattaki diğer geçerli
          başvuru yöntemlerini de kullanabilirsin.
        </p>
        <ul>
          <li>Adını, soyadını ve hesabında kullandığın e-posta adresini belirt.</li>
          <li>Talebini açıkça yaz; hangi kayıt veya işlemle ilgili olduğunu anlat.</li>
          <li>
            Yanıtın iletileceği adresi ve ilgili başvuru yönteminin gerektirdiği kimlik, imza ve iletişim bilgilerini
            ekle.
          </li>
        </ul>
        <p>
          Kimliğini doğrulamak için gerekli ve ölçülü ek bilgi istenebilir. Bu sayfada kimlik belgesi yükleme alanı
          yoktur; ilk mesajında parola veya kimlik belgesi görseli gönderme.
        </p>
      </section>
      <section>
        <h2>Yanıt süresi</h2>
        <p>
          Geçerli başvurular, talebin niteliğine göre en kısa sürede ve en geç 30 gün içinde yanıtlanır. İşlem ayrıca
          maliyet gerektirirse yalnız Kurulun belirlediği tarifedeki ücret uygulanabilir. Ret halinde gerekçe
          bildirilir; kanundaki şikâyet hakların saklıdır.
        </p>
      </section>
    </LegalFrame>
  );
}

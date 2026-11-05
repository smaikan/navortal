import Link from "next/link";
import { ControllerDetails, LegalFrame, legalMetadata } from "../../features/legal/frame";

export const metadata = legalMetadata("/terms", "Kullanım Koşulları", "Navortal'ın kullanımı hakkında koşullar.");
export default function Terms() {
  return (
    <LegalFrame path="/terms" title="Kullanım Koşulları" intro="Ücretsiz planlayıcıyı kullanırken bilmen gerekenler.">
      <section>
        <h2>1. Hizmet ve işletmeci</h2>
        <p>
          Navortal; görev, gün planı, not, çalışma sayacı ve hatırlatmalarını yönetmeni sağlayan ücretsiz bir araçtır.
          Kullanım için ücret alınmaz; satış, ücretli abonelik, ödeme, otomatik yenileme ve reklam yoktur. Bu nedenle
          iade veya abonelik iptali gibi işlemler de bulunmaz.
        </p>
        <ControllerDetails />
      </section>
      <section>
        <h2>2. Hesabın</h2>
        <p>
          Ulaşabildiğin bir e-posta adresi ve kendine ait parola kullan. Hesabının ve ortak cihazlardaki girişinin
          güvenliğine dikkat et. Başkasının hesabına erişmeye, hizmetin güvenliğini aşmaya veya işleyişini bozmaya
          çalışma.
        </p>
      </section>
      <section>
        <h2>3. İçeriklerin</h2>
        <p>
          Eklediğin içeriklerin üzerindeki hakların sende kalır. İçerikler, istediğin saklama, planlama, analiz ve
          bildirim işlevlerini sağlamak için işlenir. Hukuka aykırı içerik veya başkalarının paylaşmaya yetkili
          olmadığın kişisel bilgilerini ekleme.
        </p>
        <p>
          Bu hizmet bir sağlık kaydı sistemi değildir. Tanı, tedavi, ilaç, kimlik belgesi veya hesap parolaları gibi
          hassas bilgileri görev ve not alanlarında saklama.
        </p>
      </section>
      <section>
        <h2>4. Sayaçlar ve hatırlatmalar</h2>
        <p>
          Sayaç süresinin dolması görevi tamamlamaz. Tarayıcının kapanması devam eden çalışmayı bitirmez. Bildirimlerin
          ulaşması bağlantı, tarayıcı izni, cihaz ayarları ve bildirim sağlayıcısına bağlıdır; zamanında teslim garanti
          edilmez. Kritik veya acil bir hatırlatma için tek başına bu uygulamaya güvenme.
        </p>
      </section>
      <section>
        <h2>5. Erişim ve değişiklikler</h2>
        <p>
          Hizmet ücretsiz sunulduğu için belirli bir erişim süresi veya bir özelliğin sürekliliği taahhüt edilmez. Bakım
          veya teknik sorunlar nedeniyle hizmete erişim kesilebilir. İşlevler ve bu koşullar değiştiğinde güncel
          açıklama bu sayfada yayımlanır; önemli değişiklikler uygun şekilde duyurulur. Kanunun koruduğu kullanıcı
          hakları bu koşullarla sınırlandırılmaz.
        </p>
      </section>
      <section>
        <h2>6. Gizlilik ve ayrılma</h2>
        <p>
          Verilerinin işlenmesi <Link href="/privacy-notice">KVKK Aydınlatma Metni’nde</Link>, tarayıcıdaki kayıtlar{" "}
          <Link href="/cookies">Çerezler</Link> sayfasında açıklanır. Koşulları kabul etmek, her türlü kişisel veri
          işleme veya yurt dışı aktarım için açık rıza vermek değildir.
        </p>
        <p>
          Uygulamayı kullanmayı bırakabilirsin. Hesap veya veri silme talepleri için{" "}
          <Link href="/contact">iletişim ve başvuru</Link> sayfasına bak. Yalnız çıkış yapmak sunucudaki verileri
          silmez.
        </p>
      </section>
    </LegalFrame>
  );
}

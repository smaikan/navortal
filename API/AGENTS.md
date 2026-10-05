# API çalışma kökü

Bu klasörde üst dizindeki [proje sözleşmesi](../AGENTS.md) geçerlidir. Backend çalışma kökü **API/**, frontend kökü **UI/** olarak kullanıcı tarafından belirlenmiştir.

- Solution, src/, tests/, scripts/ ve Docker dosyaları burada; kanonik belgeler repository ana **../docs/** altında. İkinci backend/, API/API/ veya API/docs kopyası açma.
- Yerel skill'ler `.codex/skills/`, ilerleme kaynağı [Uygulama Adımları.md](Uygulama%20Ad%C4%B1mlar%C4%B1.md).
- Backend MVP-00 başlangıç yetkisi tarihsel kayıttır. Güncel kök sözleşme geçerlidir: yeni ana MVP için açık kullanıcı talebi gerekir; yetkili MVP içindeki alt teslimler rutin onaysız tamamlanır. Test/kabul kanıtıyla kutuları güncelle.
- Aynı anda tek MVP aktif olsun. Gerçek dış provider kanıtı eksikse ilgili kutu açık kalsın; bağımsız ve önkoşulları sağlanan sonraki işlere devam edilebilir. Eksik kabulü sahte başarıyla kapatma.
- Production yayın ve gerçek harici hesap değişiklikleri bu devam yetkisinin dışında.
- JWT süresiz ve exp'siz; refresh veya Identity cookie yok. Kullanıcı veri izolasyonu ve gerçek çalışma geçmişi korunur.
- PostgreSQL'e özgü testler gerçek PostgreSQL kullanır. Docker yoksa projeye ait izole yerel PostgreSQL kullanılabilir; EF InMemory ile geçilmiş gösterilmez.
- Her uygulama tesliminde test ekleme/çalıştırma zorunludur; çalışmayan kontrolleri ve ortam gerekçesini yaz. Dokümantasyon MVP-00 tasarım senaryosu incelemesiyle doğrulanır, uygulama testi geçmiş sayılmaz.
- Sırlar ve geçici veritabanı/binary/log dosyaları `.local/` gibi ignore edilmiş alanda kalır; kaynak veya kanıt raporuna alınmaz.

## Güncel geliştirme kimlik kararı — 15 Ekim 2026

Yalnız e-posta/parola etkin. Şifrede yalnız en az 6 karakter şartı vardır; ek karmaşıklık, üst uzunluk politikası veya e-posta onayı yoktur. Register doğrudan JWT verir. Google varsayılan `Google:Enabled=false` ile kapalıdır; client ID eklemek tek başına etkinleştirmez. Google gerçek sağlayıcı smoke kabulü kullanıcı kararıyla ertelenmiştir; geliştirmeyi bloke etmez. Yeniden etkinleştirilirse Google proof doğrulama kuralları aynen geçerlidir. Parola kurtarma e-postası kayıt onayı değildir.

## Backend devir durumu — 16 Ekim 2026

MVP00/01/02/04–29 tamam; Google03 kapalı/ertelendi. Aktif backend MVP yok.154domain/298tam integration ve son schema1/1, Docker/TLS/restart/restore ve performans kabulü geçti. Ayrıntılı frontend devir sözleşmesi [Frontend API Rehberi](../docs/Frontend%20API%20Rehberi.md), [koşullu entegrasyon kuralları](../docs/frontend-api/Entegrasyon-Kurallari.md) ve [işlem politikaları](../docs/frontend-api/Islem-Politikalari.md) bütün yollar/örnekler/DTO/auth/concurrency/SignalR davranışlarını açıklar; makine sözleşmesi ../docs/openapi-v1.json. Sonraki UI işi UI/ altında; backend kodunu mock API ile değiştirme. İlerleme kaydı Uygulama Adımları.md, kanıt ../docs/verification/mvp-29.md.


## 17 Ekim JWT/SMTP güvenlik eki

SMTP enabled ayarları startup validation ile zorunlu TLS/HTTPS ve açık reset URL ister; None/HTTP yalnız Development/Testing loopback istisnasıdır. API env ignore `.env*`/nested Docker kapsaması ve whitespace JWT key reddi eklendi.69odaklı test gerçek PostgreSQL/SMTP/HTTP ile geçti; [kanıt](../docs/verification/auth-security.md). Bu tam backend regresyonu veya production/provider kabulü değildir. UI-00–03 tamam (4/34); tek frontend ilerleme kaydı ../UI/Uygulama Adımları.md. Süresiz JWT/localStorage ve logout/reset'in token kopyasını revoke etmemesi kararı korunur.

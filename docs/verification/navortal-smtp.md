# Navortal parola kurtarma e-postası — 8 Kasım 2026

Kullanıcının verdiği Gmail gönderici hesabı, yalnız ignore edilen `API/.local/smtp.env` içinde yapılandırıldı. Dosya erişimi mevcut Windows kullanıcısı ve SYSTEM ile sınırlandı. Sır kaynakta, frontend ortamında veya raporda tutulmaz. `API/scripts/run-api.ps1` yalnız izin verilen SMTP anahtarlarını çalıştırmadan okur; mevcut process ortamı önceliklidir ve çıkışta eski değerler geri yüklenir.

Gönderen görünen adı **Navortal**, sıfırlama konusu **Navortal · Parolanı sıfırla**. HTML düğmesi, yedek bağlantı ve düz metin alternatifi var; 30 dakika, tek kullanım ve istenmeyen talepte parolanın değişmeyeceği açıklanır. Reset URL sonunda `#` olmasa da kod daima fragment'a eklenir; HTTP query'ye girmez. HTML bağlantısı encode edilir.

## Doğrulama

- Gmail `smtp.gmail.com:587` STARTTLS bağlantısı ve uygulama parolasıyla kimlik doğrulama başarılı. [Google'ın SMTP belgesi](https://developers.google.com/workspace/gmail/imap/imap-smtp).
- Gönderenin kendi adresine bir adet **Navortal · E-posta gönderimi hazır** kontrol mesajı Gmail tarafından kabul edildi. Bu mesaj reset kodu içermez. Gelen kutusuna teslim/spam konumu kullanıcı tarafından doğrulanmadı.
- `ADHD_SECURITY_TEST_FILTER='FullyQualifiedName~PasswordResetTests|FullyQualifiedName~AuthConfigurationTests' python API/.local/ui-security/run.py`: gerçek, sahipliği doğrulanmış izole PostgreSQL üzerinde **35/35**. Markalı MIME alternatifleri, aynı bağlantı, query'de kod olmaması; mevcut tek kullanım, 30 dakika, oturum iptali, eşzamanlı tüketim, bilinmeyen hesap ve SMTP hata kontrolleri geçti. İlk derlemedeki nullable test erişimi düzeltildi; son koşu başarılı. Rastgele fixture DB'leri temizlendi, test PostgreSQL durduruldu.
- `UI_EVIDENCE_DIR=.local/smtp-activation-e2e python UI/tools/run-e2e.py --project chromium --project mobile-chromium --test-file auth-recovery.spec.ts`: **2/2**, üretim UI derlemesi ve gerçek yerel SMTP/PG ile. Kod gizliliği, parola yenileme, tek kullanım, süre ve eski JWT reddi doğrulandı. Kaynak fingerprint korundu, test DB silindi; artifact reset kodu/JWT denetimleri geçti.
- Launcher PowerShell sözdizimi ve değişen dosyaların `git diff --check` kontrolü geçti. Yerel API yeniden başlatıldı; `/health/live` ve UI `/login` 200.

## Ortam sınırı

Etkinleştirme **yerel geliştirme API'sinde** yapıldı. E-posta bağlantısı aynı yerel hesap DB'sine dönmek için `http://localhost:3100/reset-password#` kullanır. Canlı sunucuya yayın veya ortam değişikliği yapılmadı. Canlı kullanımda aynı SMTP anahtarları sunucunun gizli ortamına, reset URL ise `https://www.navortal.com.tr/reset-password#` olarak konmalıdır. Kullanıcı DB'sine test hesabı/migration eklenmedi. Tam ürün regresyonu ve gerçek mobil cihaz e-posta görünümü bu dar kapsamda koşulmadı. Ana kabul **29/34** değişmez.

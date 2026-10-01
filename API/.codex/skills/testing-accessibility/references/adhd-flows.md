# ADHD kullanıcı akışları ve JWT test matrisi

AGENTS.md ürün/auth sözleşmesidir; Uygulama Adımları.md güncel kabul durumudur. Gerçek OpenAPI/route/UI oluşmadan endpoint veya locator uydurma.

## Giriş ve yerel çıkış

- E-posta/parola login accessToken, Bearer ve kullanıcı özeti döndürür; refreshToken/expiresIn beklenmez.
- Token merkezi adaptörde localStorage'a kaydedilir; yeniden yükleme sonrası `/me` ile kullanıcı doğrulanır.
- İstekler Authorization Bearer taşır; JWT çözüp UI açmak tek başına server yetkisi kanıtı değildir.
- Yanlış parola, boş/geçersiz form ve eksik/bozuk token anlaşılır hata üretir; parola tutulmaz.
- Uygulama token'ında exp yoktur; ileri saatte token yenileme isteği yapılmaz. JWT zaman kaydırma asıl API integration testinin konusudur.
- 401 temiz login durumuna döner; refresh retry döngüsü yoktur. Network hatası 401 sayılmaz.
- Logout localStorage, kullanıcı query cache'i ve SignalR bağlantısını temizler; diğer sekme de haberdar olur. Açık gerçek work session logout nedeniyle bitmez.
- Eski token kopyasının server'da revoke edildiğini test etme. Birbirinden farklı kullanıcılar veri paylaşamaz.
- Google'ın süreli ID proof'u doğru audience/issuer/signature/expiry ile doğrulanır; yerel sonuç aynı süresiz access token'dır. Aynı e-posta otomatik merge değildir.
- Forgot/reset 30 dk ve tek kullanımlı ayrı koddur; reset eski access JWT'lerini revoke etmez.

Token'ın login yanıtı ve merkezi localStorage kaydı beklenendir. Gerçek JWT'yi screenshot/trace/console/artifact'e sızdırma; playback credential kayıtlarını gitignore'da tut. SignalR standart hub query aktarımında token redaksiyonunu kontrol et.

## Görev ve havuz

Başlık + Enter; iç içe görev oluşturma; menü/klavyeyle taşıma; cycle hatası; 90/60/115 dk toplamları; 240 bütçe/180 hesap farkı; unknown görünürlüğü; child complete/reopen; parent seçenekleri; pool'dan takvime aynı TaskId.

## Plan ve takvim

Sabit randevu; esnek yerleşim; split/non-split; capacity uyarısı; preview sırasında kalıcılığın değişmemesi; apply; eski proposal conflict; tekrar click idempotency; iki günlük atomik move; geçmiş actual'ı koruyan undo.

09:20 fixture: React actual 20; acil 30; React kalan 40; Backend 30+30; 11:00 sabit. Önizleme reddi başlamış acil çalışmayı silmez. Day/week/month, geçmiş panel ve gelecekte havuzdan ekleme; drag/drop dışında eşdeğer menü ve klavye yolu.

## Work ve focus

Start/pause/resume/finish; reload/iki sekme; 35/7; target'ta devam/overtime; break actual dışında; complete ile açık segment kapanması; manuel correction ve overlap hatası; son alt adım/notla dönüş; distraction note→task duplicate olmaması.

## Analitik ve erişilebilirlik

Baseline/current/actual ayrı; parent ve focus çift sayım yok; bilinmeyen tahmin coverage; boş payda; midnight ve correction. Klavye focus sırası, accessible isim/durum, checkbox, drawer/dialog, takvim alternatifleri, reduced motion, mobil reflow ve okunur hedefler.

Backend karşılığı geçen bir senaryoyu görsel/touch/screen-reader kanıtı yerine kullanma. Uygulama yokken bu matris plan niteliğindedir.

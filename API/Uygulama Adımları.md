# Uygulama Adımları

27 Ekim2026 — kullanıcı talebiyle Eisenhower Matrisi yerel teslim: beş owner/sürümlü API, iki additive tablo, bağımsız alan/sıra ve MatrixChanged. Gerçek PG5/5; owner filtresi bozma testi beklendiği gibi başarısız, restorasyon1/1. OpenAPI197/202somut/274şema eşliği ve docs denetimi geçti. UI'daki kalıcı seçim/sürükleme/klavye ve tarayıcı kanıtı [tek UI raporunda](../UI/docs/verification/matrix.md), backend [sözleşme/kanıt](../docs/verification/matrix.md). Dev DB yedeği sonrası yalnız bu migration uygulandı; kullanıcı DB'si test fixture'ı değildi. Yeni ana backend MVP sayılmaz; ana backend/UI sayaçları değişmez.

Backend durum tarihi: **17 Ekim 2026**; UI devir eşlemesi **24 Ekim 2026** — Europe/Istanbul.

Bu dosya ADHD planlayıcısının uygulanabilir backend iş listesi, kabul kapısı ve ilerleme kaydıdır. Ürün/mimari bağlamı [AGENTS.md](AGENTS.md) içindedir. Çelişkide güncel kullanıcı kararı üstündür; iki belge birlikte güncellenir.

## 1. Mevcut durum

17 Ekim güvenlik bakım eki: JWT/SMTP yapılandırma ve secret dosyası kapsaması düzeltildi;69/69odaklı test geçti. Yeni MVP kapanışı değildir; [ayrıntı](../docs/verification/auth-security.md).

- Aşama: MVP-00/01/02 tamamlandı; MVP-03 Google geliştirme aşamasında kapalı/ertelendi; MVP-04 tamam; MVP-05 tamam; MVP-06 tamam; MVP-07 tamam; MVP-08 tamam; MVP-09 tamam; MVP-10 tamam; MVP-11 tamam; MVP-12 tamam; MVP-13 tamam; MVP-14 tamam; MVP-15 tamam; MVP-16 tamam; MVP-17 tamam; MVP-18 tamam; MVP-19 tamam; MVP-20 tamam; MVP-21 tamam; MVP-22 tamam; MVP-23 tamam; MVP-24 tamam; MVP-25 tamam; MVP-26 tamam; MVP-27 tamam; MVP-28 tamam; MVP-29 tamam. Google03 ertelenmiş; uygulanabilir backend paketleri kapandı.
- Aktif backend MVP: **yok**; backend29/30 (Google03 ertelendi). Frontend tam kabul **29/34**; UI-33 yerel teslim/inceleme raporlandı ve ana çalışma durdu, tam kabul verilmedi. UI-27/30/31 dış ortam, UI-32 mobil performans, A/F/G ve tam API erişim kanıtı kapıları açık. Tek frontend sayaç/kutu kaynağı [UI ilerleme kaydı](../UI/Uygulama%20Adımları.md); güncel kanıt [UI-33 raporu](../UI/docs/verification/ui-33.md). Eski UI-08 kapanışı kendi tarihsel raporunda korunur.
- Sonraki kapsam: açık frontend kabulleri; ana çalışma durdu. Devir dokümanı [Frontend API Rehberi](../docs/Frontend%20API%20Rehberi.md).
- Tamamlanan backend MVP: **29 / 30** (Google03 kullanıcı kararıyla kapalı/ertelendi).
- Backend Release build başarılı (0 uyarı/0 hata). Tarihsel UI-08 kanıtı:118unit/240productionE2E, ../UI/docs/verification/ui-08.md. Güncel frontend durumu yukarıdadır. Tam backend regresyonu bu UI koşusunda yeniden çalıştırılmadı.
- PostgreSQL/HTTP: MVP29 **154/154 domain,298/298 tam HTTP/DB/JWT/SMTP/Quartz/SignalR/WebPush**, son enum metadata testi1/1 geçti; clean/verili upgrade, Docker/TLS/restart/backup/restore ve kalıcı JWT doğrulandı. Model drift yok.152işlem/157somut yol/200DTO dokümanı ve356JSON örneği validator geçti.
- Güncel auth regresyonu: 26 gerçek PostgreSQL/HTTP testi geçti; 6 karakter ve onaysız giriş, kapalı Google dahil.

### Tamamlanan hazırlıklar — uygulama MVP'si değildir

- [x] P01 — Ürün, domain ve backend sırası AGENTS.md içinde kalıcı hale getirildi.
- [x] P02 — Yedi backend skill'i ve ilgili UI auth/test yönlendirmeleri güncellendi.
- [x] P03 — Kullanıcının süresiz JWT ve refresh-token olmaması kararı plana işlendi.
- [x] P04 — MVP-00–MVP-29 için yapılacak işler, kabul kapıları ve ilerleme kuralı yazıldı.

## 2. Auth kararı — bütün uygulamalara uygulanır

- Yalnız e-posta/parola etkin; en az 6 karakter, başka şifre şartı ve e-posta onayı yok. Google kullanıcı kararıyla geliştirme aşamasında kapalı. Basit Users/ExternalLogins; hazır parola hasher'ı, tam Identity cookie/store/UI yok.
- Uygulama JWT'si imzalı HS256 Bearer; `sub`, `iss`, `aud`, `iat`; **exp yok ve süreyle sona ermez**. Refresh token/tablo/endpoint/rotation/denylist/token-version yok.
- İmza/issuer/audience/algoritma ve kullanıcı doğrulanır. Exp zorunlu değildir; framework'ün gizlice varsayılan exp üretmesi testle engellenir.
- Login/register/google: accessToken + tokenType Bearer + kullanıcı özeti. Sahte expiresIn veya refreshToken yok.
- Browser merkezi auth adaptörü localStorage ve Authorization başlığını yönetir. Cookie/BFF auth ve otomatik refresh retry yok.
- Logout token/cache/SignalR'ı yerel temizler. Eski kopya JWT sunucuda revoke olmaz; açık WorkSession logout nedeniyle kapanmaz.
- Google'ın süreli ID proof'u gerçekten doğrulanır. Reset kodu ayrı, hash'i saklanan, 30 dk ve tek kullanımlı koddur; access token değildir.
- İmza anahtarı restart'ta korunur; değişirse eski JWT'ler topluca geçersizdir. HTTPS, parola hash'i ve kullanıcı veri izolasyonu korunur.

## 3. İşaretleme, kapsam ve kanıt kuralı

1. Bir seferde bir aktif MVP. Backend kökü API/, skill'ler API/.codex/skills/. Bağımlılıkları okuyarak başla; kullanıcı test/kabul kapısı geçince sıradaki uygulanabilir MVP'ye yeniden onay istemeden devam edilmesini yetkilendirdi.
2. `İxx` kodları iş kalemidir; `Kxx` kodları doğrulanmış kabul koşuludur. Kod eklemek kabul kutusunu işaretlemek için yeterli değildir.
3. `[x]` yalnız gerçek teslim/kanıt varsa. Çalışmayan test boş kalır; engel ve nasıl doğrulanacağı yazılır.
4. Her çalışma sonunda bu dosyayı güncelle. Kanıt alanına gerçek dosya/test/komut/sonuç ve doğrulanmayan kapsamı ekle; secret ekleme.
5. MVP kapanışı, kendi bütün iş/kabul kutuları ve ortak DoD sağlanınca işaretlenir. Hazırlık belgeleri MVP-00 mimari teslimi sayılmaz.
6. Gereken yeni alt işleri mevcut ID'leri değiştirmeden ekle; başka MVP kapsamı gerekiyorsa değişikliği gerekçesiyle kaydet.
7. Gerilemede ilgili kabul/kapanış kutusunu yeniden aç; tarih/neden kaydet. Tamamlandı etiketini koruyup sorunu saklama.
8. Sayaç, aktif/sonraki paket ve değişiklik günlüğü aynı teslimde güncellenir. Bu bakım uygulama çalışmaları sırasındadır; arka plan otomasyonu değildir.

### Ortak MVP kapanış kapısı

Her paket için uygulanabilir maddelerin kanıtı kendi alanında bulunmalıdır:

- Tanımlı kapsam gerçek davranışla tamamlandı; sahte başarı/kalıcı mock yok.
- Sahiplik, domain invariant'ları ve ilgili concurrency korundu.
- Şema değiştiyse migration SQL etkisi, temiz kurulum ve önceki sürümden upgrade kontrol edildi. Değişmediyse uygulanmaz diye belirtildi.
- İlgili unit/HTTP/PostgreSQL testleri geçti. Tasarım MVP-00'da bunun yerine senaryo yürütme ve tutarlılık incelemesi belgelenir.
- Kod değiştiyse backend build geçti; frontend kapsamında ilgili lint/typecheck/build geçti. Yalnız belge işinde kod kontrolü yapılmış gibi gösterilmedi.
- OpenAPI ve etkilenen belgeler güncel; olmayan dosyaya link veya endpoint varsayımı yok.
- Kalan işler, doğrulanmayanlar ve sonraki somut adım raporlandı.

### Kanıt alanının biçimi

Her MVP altında mevcut `Kanıt/engel` satırı gerçek sonuçla değiştirilir. Örnek alanlar: tarih; değişen dosyalar; çalıştırılan komut/test; sonuç; ortama bağlı kontrol; kalan iş. Komutlar proje oluştuktan sonra gerçek solution/test adlarıyla yazılır.

## 4. Tasarım, altyapı ve kimlik

### MVP-00 — Ortak domain ve işlem sözleşmesi

Önkoşul: yok. Skill: görev/planlama/work/DB/JWT becerilerinden ilgili bölümler. Durum: Tamamlandı.

İşler:

- [x] M00-İ01 — Tasks, TaskSchedules, WorkSessions/Segments, DailyPlans, PlanRevisions/Items/Changes ve kullanıcı ilişkilerini ER/alan sözlüğüyle tasarla.
- [x] M00-İ02 — Durum geçişleri, direct/budget/actual/remaining, baseline, fixed/lock, tarihsel snapshot ve silme davranışını kesinleştir.
- [x] M00-İ03 — Preview/apply/emergency/undo/multi-day transaction, concurrency/idempotency, JWT ve API DTO sınırlarını ilgili dört tasarım belgesine yaz.

Kabul:

- [x] M00-K01 — 09:20 örneğinde 20 dk gerçek React, 40 dk kalan ve sabit toplantı bütün ilişkiler üzerinde kayıpsız açıklanabiliyor.
- [x] M00-K02 — Çok günlük move, arada tamamlanmış iş varken undo ve manual correction hiçbir gerçek kaydı silmeden adım adım çözümlendi.
- [x] M00-K03 — Enum/alan/FK kaynakları ve kritik state/transaction kuralları çelişmiyor; auth exp'siz JWT; uygulama/tasarım ayrımı ve T01–T20 eşleştirmesi yazılı.

Kanıt: docs/verification/mvp-00.md; dört ortak tasarım belgesi ve senaryo yürütmeleri tamam. Uygulama testi değildir.

- [x] MVP-00 tamamlandı — Tasarım belgeleri ve kabul incelemesi tamam.

### MVP-01 — API ve PostgreSQL temeli

Önkoşul: 00. Skill: JWT API, PostgreSQL/test, aspnet-core. Durum: Tamamlandı.

İşler:

- [x] M01-İ01 — Backend solution/katmanları, DI ve ortam ayarlarını kur; henüz bütün domain tablolarını oluşturma.
- [x] M01-İ02 — PostgreSQL/EF/migration yolu, Docker Compose, logging/ProblemDetails/validation, health/readiness ve clock adaptörünü kur.
- [x] M01-İ03 — WebApplicationFactory + izole gerçek PostgreSQL test fixture'ı ve build/test CI temelini kur.

Kabul:

- [x] M01-K01 — Belgelenen komutlarla temiz ortam açılıyor; DB bağlantısı ve başlangıç migration yolu çalışıyor.
- [x] M01-K02 — Readiness DB yokken başarısız, DB varken başarılı; liveness ayrı; güvenli problem yanıtı HTTP testinden geçiyor.
- [x] M01-K03 — Build ve gerçek PostgreSQL integration testi çalışıyor; eksik Docker gibi ortam engeli fake test başarısıyla örtülmüyor.

Kanıt: docs/verification/mvp-01.md; 4 gerçek PostgreSQL/HTTP testi geçti; Release build 0 uyarı/0 hata. Docker runtime/uzak CI çalıştırılmadı; native PG yolu kullanıldı.

- [x] MVP-01 tamamlandı — Altyapı ve ortak kapı doğrulandı.

### MVP-02 — E-posta/parola ve süresiz JWT

Önkoşul: 01. Skill: adhd-api-contracts-jwt, PostgreSQL/test. Durum: Tamamlandı.

İşler:

- [x] M02-İ01 — Users/benzersiz normalize email, hazır PasswordHasher ve kullanıcı koordinasyon kaydıyla register/login'i oluştur.
- [x] M02-İ02 — Exp'siz HS256 JWT üretimi, JwtBearer doğrulama, current-user, me/stateless logout ve OpenAPI bearer şemasını kur.
- [x] M02-İ03 — İmza anahtarını ortamdan al; basit validation/giriş limiti; refresh/cookie altyapısı olmadan auth HTTP testlerini ekle.

Kabul:

- [x] M02-K01 — Son imzalanmış JWT'de exp yok; ileri test saatinde aynı JWT geçerli; yanıt accessToken/Bearer/user içeriyor, refreshToken/expiresIn içermiyor.
- [x] M02-K02 — Eksik JWT, değiştirilmiş imza, yanlış issuer/audience/algoritma ve olmayan sub kullanıcı 401; me doğru kullanıcı; duplicate email ve yanlış parola doğru hata veriyor.
- [x] M02-K03 — Logout revoke iddia etmeyen 204 sözleşmesine sahip; aynı JWT kopyası geçerli kalabiliyor; UserId body'den otorite alınmıyor; Identity/refresh tabloları yok.

Kanıt: docs/verification/mvp-02.md; 19 integration testi geçti; temiz Release build; exp yok ve +20 yıl geçerli. Frontend localStorage/logout UI doğrulaması frontend aşamasındadır.

- [x] MVP-02 tamamlandı — Gerçek JWT middleware ve DB ile auth kapısı geçti.

### MVP-03 — Google girişi ve hesap bağlama

Önkoşul: 02. Skill: JWT API. Durum: Kullanıcı kararıyla kapalı/ertelendi.

İşler:

- [ ] M03-İ01 — Google ID credential doğrulama adaptörü ve ExternalLogins benzersiz provider/subject ilişkisini kur.
- [ ] M03-İ02 — İlk kayıt/tekrar girişte yerel süresiz JWT; mevcut JWT'li hesaba Google link kullanım senaryolarını oluştur.
- [ ] M03-İ03 — Yanlış/expired proof, yanlış audience ve mevcut e-posta/başka hesaba bağlı subject sonuçlarını test et; provider ayarını belgele.

Kabul:

- [ ] M03-K01 — Geçerli Google subject tekrarında aynı yerel kullanıcıya giriş; uygulama JWT'si yine exp'siz; eşzamanlı link duplicate oluşturmuyor.
- [ ] M03-K02 — Aynı e-posta hesapları otomatik birleştirmiyor; link yerel JWT + Google kanıtı gerektiriyor; invalid/expired Google kanıtı reddediliyor.
- [ ] M03-K03 — Test double kapsamı ile gerçek yapılandırılmış geliştirme hesabı smoke sonucu ayrı kaydedildi; gerçek provider doğrulanmadan bu kontrol işaretlenmedi.

Kanıt: docs/verification/mvp-03.md. Google adaptörü/şeması hazırlanmış; kapalı uçlar hesap oluşturmaz/bağlamaz. 26 integration testi geçti. Kullanıcı geliştirmede yalnız e-posta/parola istedi; sağlayıcı ve etkin hesap eşleme kabulü yeniden etkinleştirmeye ertelendi. Bu MVP tamamlandı sayılmadı; bağımsız MVP-04 devam eder.

- [ ] MVP-03 tamamlandı — Provider entegrasyonu ve hesap eşleme kapısı geçti.

### MVP-04 — Parola kurtarma

Önkoşul: 02. Skill: JWT API, PostgreSQL/test. Durum: Tamamlandı.

İşler:

- [x] M04-İ01 — CSPRNG reset kodu/hash kaydı, 30 dk süre, tek kullanım ve forgot/reset endpointlerini oluştur.
- [x] M04-İ02 — Ortam ayarlı mail adaptörü/test mail sunucusu ve PasswordHasher ile parola güncellemesini bağla.
- [x] M04-İ03 — Genel yanıt, Google-only kullanıcı, expired/invalid/reused kod ve eşzamanlı kullanım testlerini ekle.

Kabul:

- [x] M04-K01 — Geçerli kodla yeni parola login olur; eski parola olmaz; aynı kod ikinci kez veya 30 dk sonrasında çalışmaz.
- [x] M04-K02 — DB/log ham reset kodu tutmuyor; unknown/Google-only hesaba sessiz parola hesabı açılmıyor; maildeki beklenen link çalışıyor.
- [x] M04-K03 — Reset kodu access/refresh JWT değildir; reset sonrası eski access JWT'nin revoke edilmediği sözleşme/testte açık.

Kanıt: docs/verification/mvp-04.md; 32 gerçek HTTP/PostgreSQL/SMTP testi geçti; Release build 0 uyarı/0 hata; temiz ve önceki auth şemasından upgrade veri korudu. Gerçek posta sağlayıcısı kullanılmadı.

- [x] MVP-04 tamamlandı — Kurtarma ve token ayrımı doğrulandı.

### MVP-05 — Tercihler ve çalışma takvimi

Önkoşul: 02. Skill: JWT API, PostgreSQL/test. Durum: Tamamlandı.

İşler:

- [x] M05-İ01 — Zone/dil/saat/hafta tercihlerini ve kullanıcı kapsamlı get/update'i kur.
- [x] M05-İ02 — Haftalık çoklu çalışma aralığı ve tarihli istisnaları modelle; timezone/gece sınırı kurallarını belgele.
- [x] M05-İ03 — Preview/auto, tampon ve minimum parça ayarlarını validation/concurrency ile ekle.

Kabul:

- [x] M05-K01 — Farklı gün farklı ve aynı günde birden fazla aralık saklanıyor; istisna sonucu hesaplanabiliyor.
- [x] M05-K02 — Geçersiz aralık/zone ve çelişen aynı günlük girişler açık hata; başka kullanıcı ayarı okunamıyor/yazılamıyor.
- [x] M05-K03 — Kullanıcı saat vermediğinde gizli 09–17 üretmiyor; 15 dk minimum/0 tampon ve preview varsayılanları açık ve değiştirilebilir.

Kanıt: docs/verification/mvp-05.md; 5 domain +36 HTTP/DB testi geçti; Release0 uyarı/hata; temiz/önceki schema upgrade. Aralıklar typed ayar bütünü olarak jsonb, version ve PlanningVersion atomik.

- [x] MVP-05 tamamlandı — Planlama girdileri güvenilir.

## 5. Görev ve iş yükü

### MVP-06 — Temel görev işlemleri

Önkoşul: 02. Skill: görev/iş yükü, JWT API. Durum: Tamamlandı.

İşler:

- [x] M06-İ01 — Yalnız başlıkla create; list/detail/update/archive ve temel alanları ekle.
- [x] M06-İ02 — Pagination/filter, concurrency, server alanı koruması ve created/updated olaylarını bağla.
- [x] M06-İ03 — Gerçek JWT'li iki kullanıcıyla CRUD/izolasyon ve invalid/stale input testlerini ekle.

Kabul:

- [x] M06-K01 — Başlık yeterli; tahminsiz süre unknown kalıyor; listeler bounded; güncelleme ve arşiv kalıcı.
- [x] M06-K02 — A, B görevini list/detail/update/archive üzerinden erişemiyor; istemci actual/completion/UserId alanlarını keyfi yazamıyor.
- [x] M06-K03 — Eski concurrency sürümü sessiz overwrite yapmıyor; olay zamanı/kullanıcı tutarlı; açık hata sözleşmesi var.

Kanıt: docs/verification/mvp-06.md; 44 gerçek PostgreSQL/HTTP +5 domain testi geçti; Release0 uyarı/hata; iki kullanıcı, race, FK/history, rollback ve verili upgrade doğrulandı.

- [x] MVP-06 tamamlandı — Task CRUD gerçek uçlarla çalışıyor.

### MVP-07 — Görev ağacı ve taşıma

Önkoşul: 06. Skill: görev/iş yükü, PostgreSQL/test. Durum: Tamamlandı.

İşler:

- [x] M07-İ01 — Parent/children/subtree ve çok seviyeli listelemeyi ekle.
- [x] M07-İ02 — Reparent ve kararlı sibling order komutlarını concurrency/transaction ile oluştur.
- [x] M07-İ03 — Self/descendant döngü, çapraz kullanıcı parent ve derin ağaç sorgu testlerini ekle.

Kabul:

- [x] M07-K01 — Ağaç root→child→grandchild olarak oluşup yeniden yüklenebiliyor; sabit seviye kolonları yok.
- [x] M07-K02 — Kendi altına taşıma/cycle/başka kullanıcının parent'ı reddediliyor; başarısız move yarım ağaç bırakmıyor.
- [x] M07-K03 — Sıra kararlı; temsilî derin ağaçta düğüm başına query yapılmadığı kanıtlı.

Kanıt: docs/verification/mvp-07.md; 50 gerçek PostgreSQL/HTTP testi geçti; Release0 uyarı/hata; 250 derinlikte query sayısı<=4; verili upgrade, cycle/race/sibling doğrulandı. Dependency birleşik kontrol10, work history convert engeli12.

- [x] MVP-07 tamamlandı — Hiyerarşi ve taşıma doğru.

### MVP-08 — Tahmin, hedef bütçe ve iş yükü

Önkoşul: 07. Skill: görev/iş yükü. Durum: Tamamlandı.

İşler:

- [x] M08-İ01 — Direct work/tahmin, konteyner ve TargetBudget ayrımını ekle.
- [x] M08-İ02 — Recursive bilinen toplam/unknown sayısı ve planlanabilir iş bileşeni çözümleyicisini oluştur.
- [x] M08-İ03 — İşi alt görevlere ayırma ve direct/budget değişimi kurallarını API/testlere bağla.

Kabul:

- [x] M08-K01 — 20+40+30=90; (15+20)+25=60; 30+(15+20+25)+25=115; hiçbir ara toplam yeniden eklenmiyor.
- [x] M08-K02 — 240 hedef/180 çocuk = ayrı hedef/hesap ve 60 fark; yeni 60 dk iş oluşmuyor; 90 bilinen+2 unknown açık gösteriliyor.
- [x] M08-K03 — Parent kendi işi+çocuklar tekilleşiyor; konteyner plan bileşeni üretmiyor; değişen ağaç hesabı güncel ve testli.

Kanıt: docs/verification/mvp-08.md; 14 domain +55 HTTP/DB testi geçti; Release0 uyarı/hata; 5000 seviye, bütçe/unknown/own work ve overflow rollback; yeni şema farkı yok.

- [x] MVP-08 tamamlandı — İş yükü hesaplayıcısı güvenilir.

### MVP-09 — Yaşam döngüsü ve ilerleme

Önkoşul: 08. Skill: görev/iş yükü. Durum: Tamamlandı.

İşler:

- [x] M09-İ01 — Complete/reopen/defer/skip/cancel state geçişleri, completion zamanı ve eventleri ekle.
- [x] M09-İ02 — Zorunlu çocuk/direct work üzerinden parent ilerleme ve auto completion kur.
- [x] M09-İ03 — Manuel parent seçeneklerini ve çocuk yeniden açılmasının auto/manual atalara etkisini ekle.

Kabul:

- [x] M09-K01 — Bütün zorunlu çocuk ve own work bitmeden auto parent completed değil; tamamlanma zamanı ve event doğru.
- [x] M09-K02 — Altları da tamamla/yalnız parent/iptal ayrı sonuç; açık çocuklar korunuyor; auto atalar yeniden değerlendiriliyor.
- [x] M09-K03 — Skip/cancel completed sayılmıyor; tahmin 0 diye görev bitmiyor; reopen/history kalıcı ve sahiplik korumalı.

Kanıt: docs/verification/mvp-09.md; 66 HTTP/DB +24 domain testi geçti; Release0 uyarı/hata; auto/manual/own/required/history/upgrade/rollback doğrulandı. WorkSession kapanışı12,plan revision etkisi14 kabulünde.

- [x] MVP-09 tamamlandı — Task durum sözleşmesi çalışıyor.

### MVP-10 — Bağımlılıklar ve sıralama

Önkoşul: 09. Skill: görev/iş yükü. Durum: Tamamlandı.

İşler:

- [x] M10-İ01 — Çoklu gerçek ön koşul ve ayrı soft-order ilişkilerini oluştur.
- [x] M10-İ02 — Başlatılabilirlik, iptal/erteleme ön koşulu ve parent ile birleşik döngü denetimini bağla.
- [x] M10-İ03 — İlişki CRUD ve reparent etkilerini HTTP/domain testleriyle doğrula.

Kabul:

- [x] M10-K01 — A açıkken B start izni yok; A completed olunca izin var; soft sıra aynı kilidi üretmiyor.
- [x] M10-K02 — Self, A→B→A, üç düğüm ve parent/descendant ile kendini bekleme reddediliyor.
- [x] M10-K03 — İptal ön koşulu sessiz serbest bırakmıyor; ilişki sahipliği ve reparent tutarlılığı korunuyor.

Kanıt: docs/verification/mvp-10.md; 73 HTTP/DB+36 domain geçti; Release0 uyarı/hata; hard/soft,inherited prereq,cycles,reparent,required,concurrency,upgrade.

- [x] MVP-10 tamamlandı — Graf ve gerçek başlatma koşulları hazır.

### MVP-11 — Projeler, havuzlar ve sınıflandırma

Önkoşul: 08. Skill: görev/iş yükü, JWT API. Durum: Tamamlandı.

İşler:

- [x] M11-İ01 — Project/pool ve task bağlantıları; category/tag modellerini kullanım ihtiyacı kadar kur.
- [x] M11-İ02 — Kullanıcı kapsamlı CRUD, arama/filter/order ve planlanmamış iş sorgu sözleşmesini ekle.
- [x] M11-İ03 — Proje roll-up'ını ortak hesaplayıcıya bağla; arşiv/ilişki durumlarını test et.

Kabul:

- [x] M11-K01 — Havuza/projeye alma TaskId'yi değiştirmiyor/kopyalamıyor; filtreler/pagination doğru.
- [x] M11-K02 — Proje toplamı parent ve child'ı çift saymıyor; unknown kapsam korunuyor.
- [x] M11-K03 — Başka kullanıcı grubuna task iliştirilemiyor; geçmiş task kimliği sınıflandırma değişince korunuyor.

Kanıt: docs/verification/mvp-11.md; Release0 uyarı/hata, 85 HTTP/DB +1 kilometre taşı ve39 domain testi geçti. Classification/subtree rollback, sahiplik, Türkçe ICU araması ve migration geri/ileri doğrulandı. Planlanmamış işin sorgu sözleşmesi yazılı; gerçek schedule filtresi M14-İ05 ile bağlanacak.

- [x] MVP-11 tamamlandı — Görev/havuz kilometre taşı geçti.

## 6. Gerçek çalışma ve manuel plan

### MVP-12 — Normal çalışma oturumları

Önkoşul: 09, 10. Skill: work/focus, PostgreSQL/test. Durum: Tamamlandı.

İşler:

- [x] M12-İ06 — Başlangıçtaki task/ata yolu, grup adları/kimlikleri ve zone snapshot'ını immutable sakla; arşivlenmiş gerçek süreyi koru.

- [x] M12-İ01 — WorkSessions/Segments, start/pause/resume/finish ve server clock hesaplarını kur.
- [x] M12-İ02 — Tek açık çalışma invariant'ı, beklenen session/sürüm ve gerçek dependency start kontrolünü bağla.
- [x] M12-İ05 — Task Complete/CompleteDirect/Subtree/Defer/Skip/Cancel komutları ilgili aktif segmenti tek server anında kapatsın; aktif işi reopen/required değişimi tutarsız bırakmasın; actual korunumu testli olsun.
- [x] M12-İ04 — Work history başladıktan sonra parent ConvertToContainer geçmiş direct work'ü gizleyemez; PreserveDirect zorunluluğunu child/move/work-edit komutlarına ve testlere bağla.
- [x] M12-İ03 — Actual/remaining ve task complete sırasında segment kapanışını mevcut task use-case'ine ekle.

Kabul:

- [x] M12-K01 — 09:00–09:20 ve 09:50–10:30 = 60 dk; 30 dk pause sayılmıyor; reload sorgusu server zamanından doğru.
- [x] M12-K02 — Gerçek paralel iki start/resume tek açık segment bırakıyor; eski sekme yeni çalışmayı istemeden kapatmıyor.
- [x] M12-K03 — Plansız başlangıç geçerli; finish task'ı bitirmiyor, task complete açık segmenti kapatıyor; logout work'ü bitirmiyor.

Kanıt: docs/verification/mvp-12.md; 107 HTTP/DB+42 domain geçti; son saat gerilemesi kontrolünden sonra ilgili6 test yeniden geçti. Gerçek iki host restart/JWT/sayaç/health/OpenAPI smoke başarılı. Clean/prior upgrade, kullanıcı kilidi+DB unique/exclusion, lifecycle kapanış ve rollback doğrulandı.

- [x] MVP-12 tamamlandı — Gerçek çalışma kaynağı doğrulandı.

### MVP-13 — Manuel ekleme ve düzeltme

Önkoşul: 12. Skill: work/focus, PostgreSQL/test. Durum: Tamamlandı.

İşler:

- [x] M13-İ01 — Manuel çalışma kaydı ve açık unutulmuş session düzeltmesini ekle.
- [x] M13-İ02 — Özgün/effective değer, neden, kaynak ve audit zincirini transaction içinde sakla.
- [x] M13-İ03 — Overlap, çoklu düzeltme, sahiplik ve actual/remaining etkilerini test et.

Kabul:

- [x] M13-K01 — İlk ve ikinci düzeltmelerde önceki değerler kaybolmuyor; hata halinde effective/audit birlikte rollback.
- [x] M13-K02 — Başka effective work ile çakışma reddediliyor; bitiş=sonraki başlangıç kabul ediliyor.
- [x] M13-K03 — Yeni effective actual ve kalan iş doğru; audit ek work olarak toplanmıyor; plan undo ile correction karışmıyor.

Kanıt: docs/verification/mvp-13.md; Release0 uyarı/hata, 116 HTTP/DB+46 domain geçti. Zincir, void/restore, overlap, paralel komutlar, rollback ve MVP12 verili schema upgrade doğrulandı.

- [x] MVP-13 tamamlandı — İzli gerçek süre düzeltmesi doğru.

### MVP-14 — Manuel plan blokları ve revizyonlar

Önkoşul: 05, 08, 12. Skill: planlama/revision, PostgreSQL/test. Durum: Tamamlandı.

İşler:

- [x] M14-İ01 — DailyPlans, TaskSchedules, Revisions/Items/Changes ve baseline/current bağlantısını kur.
- [x] M14-İ02 — Blok create/time-update/remove; fixed/flexible/lock ve break/buffer; manuel conflict uyarı/kabulü ekle.
- [x] M14-İ04 — Task lifecycle defer/skip/cancel/complete ile gelecekteki blok etkisini aynı transaction revizyonuna bağla; historical actual ve eski revision korunsun.
- [x] M14-İ05 — M11 planlı/plansız sorgu sözleşmesini gerçek TaskSchedules tahsislerine bağla; aynı TaskId ve seçilen tarih ufku esas olsun.
- [x] M14-İ03 — Planlı session başlangıcında schedule/revision-item bağlantısını ve tarihsel metadata'yı kaydet.

Kabul:

- [x] M14-K01 — Aynı task birden çok blokta; deadline block end'den ayrı; planlı mola actual değil.
- [x] M14-K02 — Her kabul değişikliğinde current+snapshot+changes atomik; eski sürüm okunur; hata kısmi revision bırakmaz.
- [x] M14-K03 — Schedule move/remove work'ü ve başlangıç bağlamını bozmuyor; hard delete geçmiş FK'yi koparmıyor.

Kanıt: docs/verification/mvp-14.md; Release0 uyarı/hata, 132 HTTP/DB+51 domain geçti. Son offset16 ve subtree1 testleri ayrıca geçti. Clean/13 verili upgrade; full snapshot/baseline/ChangeSet, FK, planned start, lifecycle ve rollback doğrulandı.

- [x] MVP-14 tamamlandı — Manuel plan ve tarihsel temel birlikte hazır.

## 7. Planlama motoru ve birleşik akış

### MVP-15 — Tek günlük temel motor

Önkoşul: 05, 08, 10, 14. Skill: planlama/revision. Durum: Tamamlandı.

İşler:

- [x] M15-İ01 — Saf snapshot/intent/proposal API'sini ve doğrudan iş çözümlemesini kur.
- [x] M15-İ02 — Non-split işleri çalışma saatleri/fixed/lock/dependency/deadline/priority ile yerleştir.
- [x] M15-İ03 — Kararlı tie-break, açıklama ve planlanamayan iş nedenlerini unit testlere bağla.

Kabul:

- [x] M15-K01 — Aynı input aynı output; motor DB/HTTP/sayaç çağırmıyor ve input'u değiştirmiyor.
- [x] M15-K02 — Fixed/lock korunuyor; non-split 60 dk iş iki 30 boşluğa zorlanmıyor; gerçek prerequisite sırası korunuyor.
- [x] M15-K03 — Unknown iş kaybolmuyor; yerleşmeyen dakika/neden açık; sezgisel başarısızlık ispatlanmış kapasite yokluğu gibi sunulmuyor.

Kanıt: docs/verification/mvp-15.md; Release0 uyarı/hata,79 domain+132 gerçek HTTP/DB geçti. Immutable snapshot/proposal, ortak marker DAG, non-split/unknown/deadline/forecast/protected ve5000 derinlik testli. Şema değişmedi; motor HTTP apply ve split bu pakette yok.

- [x] MVP-15 tamamlandı — Temel deterministik motor geçti.

### MVP-16 — Bölme, molalar ve planı koruma

Önkoşul: 15. Skill: planlama/revision. Durum: Tamamlandı.

İşler:

- [x] M16-İ01 — Split, minimum/son parça ve bölünme bağlarını ekle.
- [x] M16-İ02 — Break/buffer kapasitesi ve uygun eski yerleşimleri korumayı bağla.
- [x] M16-İ03 — İş miktarı/çakışma/unknown/sert kısıt invariant testlerini ve deadline/capacity açıklamalarını genişlet.

Kabul:

- [x] M16-K01 — Split 60=30+30; non-split aynı girdide bölünmüyor; kalan son küçük parça açık kurala uygun.
- [x] M16-K02 — Mola/tampon work değil; 90 iş/60 kota eksik 30 gösteriyor; fixed/lock ve geçmiş korunuyor.
- [x] M16-K03 — Uygun eski slot gereksiz taşınmıyor; toplam tahsis işi aşmıyor; günlük taşma kendiliğinden yarına gitmiyor.

Kanıt: docs/verification/mvp-16.md; Release0 uyarı/hata,101 domain geçti.30 deterministik varyasyonla iş korunumu, split/partial/minimum, deadline/old placement ve buffer/break testli. SQL/HTTP yüzeyi değişmedi; migration gerekmez, son tam HTTP132 MVP15'tedir.

- [x] MVP-16 tamamlandı — Gelişmiş tek gün motoru geçti.

### MVP-17 — Önizleme ve atomik uygulama

Önkoşul: 16. Skill: planlama/revision, JWT API, PostgreSQL/test. Durum: Tamamlandı.

İşler:

- [x] M17-İ01 — Server snapshot ile preview ve dayanak sürümlü proposal/diff oluştur.
- [x] M17-İ02 — Apply'da sürüm/zaman geçerliliği, idempotency ve kullanıcı koordinasyonunu bağla.
- [x] M17-İ03 — Atomik current/revision/items/changes ve preview-auto modunu HTTP/DB testlerine bağla.

Kabul:

- [x] M17-K01 — Preview accepted planı veya revision sayısını değiştirmiyor; öneri fark ve açıklamaları içeriyor.
- [x] M17-K02 — Aynı komut tekrarında tek etki; aynı key farklı payload reddi; stale görev/ayar/session/plan 409 ile açıklanıyor.
- [x] M17-K03 — Gerçek apply yarışı ve snapshot yazım hatasında tutarlılık korunuyor; diğer kullanıcı proposal'ı uygulanamıyor.

Kanıt: [MVP-17](docs/verification/mvp-17.md). Release build0 uyarı/hata;151 tam integration +101 domain, son aktif-blok düzeltmesi sonrası18 hedefli HTTP testi; clean/önceki schema migration ve model drift kontrolü geçti.

- [x] MVP-17 tamamlandı — Öneri gerçek plana güvenilir uygulanıyor.

### MVP-18 — Acil iş ve şimdi başlat

Önkoşul: 12, 17. Skill: planlama/revision, work/focus. Durum: Tamamlandı.

İşler:

- [x] M18-İ01 — Aynı server instant'ta eski work pause ve acil start kullanım senaryosunu kur.
- [x] M18-İ02 — Actual'dan remaining ile kalan gün proposal/auto apply ve overrun tetiklerini bağla.
- [x] M18-İ03 — 09:20 tam akışını gerçek HTTP/DB ile ve split/non-split varyantlarıyla test et.

Kabul:

- [x] M18-K01 — React actual 20; acil 30; React kalan 40; Backend 30+30; 11:00–11:30 sabit, tampon 0 fixture sonucu doğru.
- [x] M18-K02 — Preview reddi başlamış acil çalışmayı silmiyor; auto mod feasible planı uygulayıp kalanları görünür bırakıyor.
- [x] M18-K03 — Overtime task'ı otomatik bitirmiyor, gerçek süreyi kesmiyor ve sabiti taşımıyor; eski çalışma geçmişi değişmiyor.

Kanıt: [MVP-18](docs/verification/mvp-18.md).162 gerçek PG/HTTP +101 domain geçti;09:20 split/non-split/Preview/Auto, actual-switch rollback ve plan hatasında actual korunumu doğrulandı.

- [x] MVP-18 tamamlandı — Dört çekirdek yapı birleşik senaryoda geçti.

### MVP-19 — Güvenli geri alma

Önkoşul: 18. Skill: planlama/revision, PostgreSQL/test. Durum: Tamamlandı.

İşler:

- [x] M19-İ01 — Son ChangeSet için geleceğe dönük ters etki ve undo proposal üret.
- [x] M19-İ02 — Güncel work/completion/constraint'lerle yeniden doğrula; telafi revision'ı atomik uygula.
- [x] M19-İ03 — Tam telafi mümkün olmayan ve stale undo yarışlarını test et.

Kabul:

- [x] M19-K01 — Arada çalışılmış/complete olmuş task undo sonrası work kaybetmiyor veya yeniden açılmıyor.
- [x] M19-K02 — Eski revision silinmiyor; yeni telafi var; uygulanamayan kısımlar ve nedenler açık önizleniyor.
- [x] M19-K03 — Tekrar undo/apply ve değişen constraints tutarlı; eski DB snapshot'ı doğrudan geri basılmıyor.

Kanıt: [MVP-19](docs/verification/mvp-19.md).174 gerçek PG/HTTP +113 domain; immutable history/partial compensation/replay/rollback ve temiz/önceki schema upgrade doğrulandı.

- [x] MVP-19 tamamlandı — Günlük planlama çekirdeği ve undo hazır.

### MVP-20 — Çok günlük dağıtım ve taşıma

Önkoşul: 19. Skill: planlama/revision, PostgreSQL/test. Durum: Tamamlandı.

İşler:

- [x] M20-İ01 — Seçilen tarih aralığında iş dağıtımı ve diğer gün tahsislerini hesaba katmayı ekle.
- [x] M20-İ02 — Günler arası move, ortak ChangeSet ve kaynak/hedef revision transaction'ını kur.
- [x] M20-İ03 — Çok günlük undo, ikinci gün hatası ve paralel tahsis yarışını test et.

Kabul:

- [x] M20-K01 — Altı saat aynı TaskId ile üç güne yayılıyor; task kopyası ve aynı kalan işin çift tahsisi yok.
- [x] M20-K02 — Kaynak/hedef birlikte değişiyor; ikinci gün hata verirse ikisi de eski tutarlı halde.
- [x] M20-K03 — Çok günlük undo gerçek geçmişi koruyor; tarih aralığı açık; günlük taşma davranışı kullanıcı onayı olmadan genişlemiyor.

Kanıt: [MVP-20](docs/verification/mvp-20.md).197 gerçek PG/HTTP +121 domain; üç güne6saat/tek TaskId, paralel tahsis, move/undo, ikinci gün rollback, Preview/Auto ve migration upgrade doğrulandı.

- [x] MVP-20 tamamlandı — Çok gün atomikliği geçti.

## 8. Takvim, odak ve destekler

### MVP-21 — Takvim ve geçmiş gün API'leri

Önkoşul: 20. Skill: planlama/revision, PostgreSQL/test. Durum: Tamamlandı.

İşler:

- [x] M21-İ01 — Bounded day/week/month veya ortak aralık sorgusu ve gün detay DTO'sunu kur.
- [x] M21-İ02 — Historical task metadata, planned/actual/completion/revisions ve yerel gün kesişimlerini bağla.
- [x] M21-İ03 — Gün sonu carry/move/pool işlemlerini mevcut koordinatöre bağla; midnight/DST/zone testlerini ekle.

Kabul:

- [x] M21-K01 — İki hafta önceki gün bugünkü başlık/parent/status değişikliğinden yanlış etkilenmiyor; actual ve plan ayrı.
- [x] M21-K02 — 23:30–00:30 30+30 dk; DST instant süresi ve zone değişiminde tarihsel gün politikası doğru.
- [x] M21-K03 — Aralık dışı yıllık veri taşınmıyor; carry aynı task kimliğiyle çalışıyor, geçmiş work korunuyor.

Kanıt: [MVP-21](docs/verification/mvp-21.md).209 gerçek PG/HTTP +126 domain; bounded historical calendar, midnight/DST/zone, carry Preview/Auto, pool rollback ve migration doğrulandı. Görsel panel frontend aşamasındadır.

- [x] MVP-21 tamamlandı — Takvim verisi ve historical okuma hazır.

### MVP-22 — Özelleştirilebilir Pomodoro

Önkoşul: 12, 05. Skill: work/focus. Durum: Tamamlandı.

İşler:

- [x] M22-İ01 — Preset ve FocusSession state'lerini, kısa/uzun mola ve sıklığını oluştur.
- [x] M22-İ02 — Pause/resume, hedefe ulaşma/overtime, break segment kapanışı ve açık auto geçiş tercihini bağla.
- [x] M22-İ03 — Sahte server saatli hedef/aşım/reload testleriyle task-work-focus bağını doğrula.

Kabul:

- [x] M22-K01 — 35 dk çalışma/7 dk mola saklanıyor; pause hedefi tüketmiyor; hedefte task complete olmuyor.
- [x] M22-K02 — Varsayılan hedefte sayaç/actual devam ediyor ve overtime hesaplanıyor; break actual'a girmiyor.
- [x] M22-K03 — Hedefe ulaşma tek mantıksal olay; reload doğru; auto seçenekleri birbirini çürütmüyor; gizli döngü üretilmiyor.

Kanıt: [MVP-22](docs/verification/mvp-22.md).223 gerçek PG/HTTP +133 domain;35/7, pause/overtime, break/next, hedef tekilliği/restart, correction ve rollback doğrulandı. Kalıcı due25, push26'da bağlanır.

- [x] MVP-22 tamamlandı — Focus state ve süre doğruluğu geçti.

### MVP-23 — Notlar ve DEHB destek API'leri

Önkoşul: 09, 12, 22; rescue için 17–18. Skill: görev/iş yükü, work/focus, planlama. Durum: Tamamlandı.

İşler:

- [x] M23-İ01 — Task/distraction notes ve notu göreve/havuza dönüştürmeyi oluştur.
- [x] M23-İ02 — Son alt adım/work/not geri dönüş bağlamı, beş dakika başla, energy ve critical tercihlerini ekle.
- [x] M23-İ03 — Günü kurtar ve gün sonu hazırlık çağrılarını mevcut motor/verilere bağla; yeni motor yazma.

Kabul:

- [x] M23-K01 — Geri dönüş gerçek kayıtlardan; olmayan ilerleme uydurulmuyor; note conversion tekrarında task çoğalmıyor.
- [x] M23-K02 — Beş dk gerçek work/focus altyapısını kullanıyor; energy/critical isteğe bağlı ve sert kısıtları bozmuyor.
- [x] M23-K03 — Rescue yalnız geleceği planlıyor; fixed/work korunuyor; sığmayanlar açık; kullanıcı ayarı desteği kapatabiliyor.

Kanıt: [MVP-23](docs/verification/mvp-23.md).234 gerçek PG/HTTP +135 domain; not dönüşümü/rollback, geri dönüş,5dk focus, critical/energy ve rescue Preview/Auto doğrulandı.

- [x] MVP-23 tamamlandı — Destek araçları çekirdeğe bağlı.

### MVP-24 — Tekrarlayan görevler

Önkoşul: 09, 20. Skill: tekrar/bildirim, PostgreSQL/test. Durum: Tamamlandı.

İşler:

- [x] M24-İ01 — Template/instance, occurrence anahtarı ve daily/weekly/monthly/interval kurallarını oluştur.
- [x] M24-İ02 — Gerekli pencere üretimi; tek/gelecek seri düzenleme, skip ve ay sonu/DST politikasını bağla.
- [x] M24-İ03 — Tekrarlanan pencere ve paralel üretim DB testlerini ekle.

Kabul:

- [x] M24-K01 — Aynı pencere iki kez/iki worker ile üretildiğinde aynı occurrence tek kayıttır; sonsuz gelecek üretilmiyor.
- [x] M24-K02 — Şablon veya gelecek seri değişimi geçmiş completed instance'ı bozmuyor; tek örnek düzenlemesi seriyi değiştirmiyor.
- [x] M24-K03 — Yerel oluşum tarihi, ay sonu ve DST sonucu belgelenmiş/testli; gerçek talep üzerinde üretim var, worker henüz varmış gibi raporlanmıyor.

Kanıt: [MVP-24](docs/verification/mvp-24.md).246 gerçek PG/HTTP +142 domain; occurrence tekilliği, korumalı future refresh/rollback, skip/lifecycle, ay sonu/DST ve migration doğrulandı. Worker25'te.

- [x] MVP-24 tamamlandı — Tekrar modeli ve materialization doğru.

## 9. Kalıcı işler, bildirim ve analitik

### MVP-25 — Quartz ve outbox

Önkoşul: 17, 24. Skill: tekrar/bildirim, PostgreSQL/test. Durum: Tamamlandı.

İşler:

- [x] M25-İ01 — Quartz PostgreSQL job store ve transactional outbox'ı kur.
- [x] M25-İ02 — Claim/lease, bounded retry/backoff, başarısız iş görünürlüğü ve reminder/recurrence job'larını bağla.
- [x] M25-İ03 — Revision invalidation, restart/crash ve misfire politikalarını test et/belgele.

Kabul:

- [x] M25-K01 — Domain rollback'te outbox gönderilmiyor; commit sonrası restart işi kaybettirmiyor.
- [x] M25-K02 — Aynı job tekrarında duplicate domain etkisi yok; iki worker claim yarışında sahiplenme tutarlı.
- [x] M25-K03 — Eski revision işi geçersiz; retry sınırlı; başarısız job görülebilir; dış delivery için exactly-once iddiası yok.

Kanıt: docs/verification/mvp-25.md; temiz Release build,146 domain,257 tam regresyon ve son2 hedefli test geçti. Gerçek PostgreSQL Quartz restart/focus/recurrence/reminder, outbox lease/crash/rollback/retry doğrulandı.

- [x] MVP-25 tamamlandı — Kalıcı iş altyapısı geçti.

### MVP-26 — Reminder, Web Push ve SignalR

Önkoşul: 22, 25. Skill: tekrar/bildirim, JWT API. Durum: Tamamlandı.

İşler:

- [x] M26-İ01 — Push subscription, reminder türleri, ön süre/snooze/DND/ses tercihlerini bağla.
- [x] M26-İ02 — Stable notification kimliği, invalid abonelik temizliği ve plan değişiminde invalidation uygula.
- [x] M26-İ03 — SignalR JWT accessTokenFactory ve kullanıcı grupları; reconnect HTTP recovery ve redaksiyonu kur.

Kabul:

- [x] M26-K01 — Eski plan reminder'ı gönderilmiyor; snooze/DND uygulanıyor; geçersiz abonelik temizleniyor.
- [x] M26-K02 — Pomodoro hedefinde tek mantıksal bildirim oluşuyor, actual devam ediyor; retry/local/push duplicate davranışı açık.
- [x] M26-K03 — Aynı uygulama JWT'si hub'a yeterli; başka kullanıcı grubuna erişilemiyor; query token loglanmıyor; reconnect güncel durumu alabiliyor.

Kanıt: docs/verification/mvp-26.md;149 domain,270 tam integration ve son9 hedefli test (271 farklı test), temiz build/migration. Gerçek SignalR owner/JWT/log/reconnect; Web Push şifreleme/imza/429/410/source guard doğrulandı. Gerçek cihaz/browser teslimi frontend kabulünde, henüz doğrulanmadı; OS garantisi yok.

- [x] MVP-26 tamamlandı — Bildirim backend'i ve realtime akışı geçti.

### MVP-27 — Gerçek çalışma ve odak analitiği

Önkoşul: 13, 21, 22. Skill: analitik. Durum: Tamamlandı.

İşler:

- [x] M27-İ01 — Day/week/month actual; task/project/category dağılımı ve bounded rapor endpointlerini kur.
- [x] M27-İ02 — Focus sayı/ortalama/hedef/overtime ile corrected effective work ve yerel gün kesişimini bağla.
- [x] M27-İ03 — Elle hesaplanabilir rapor fixture'ı ve metrik tanımlarını ekle.

Kabul:

- [x] M27-K01 — Parent-child ve work-focus toplamları çift değil; molalar actual dışında.
- [x] M27-K02 — Midnight/DST/correction fixture sonuçları elle hesapla aynı; audit satırı süre eklemiyor.
- [x] M27-K03 — Boş dönem/bağımsız focus/category değişimi sözleşmeye uygun; kullanıcılar arası rapor verisi karışmıyor.

Kanıt: docs/verification/mvp-27.md;152 domain ve14 ilgili gerçek PG/HTTP/OpenAPI testi; doğrudan actual/focus, corrected/midnight/DST/snapshot/ownership doğrulandı. Şema değişmedi.

- [x] MVP-27 tamamlandı — Gerçek zaman metrikleri doğru.

### MVP-28 — Plan uyumu ve tahmin analitiği

Önkoşul: 19, 27. Skill: analitik, planlama/revision. Durum: Tamamlandı.

İşler:

- [x] M28-İ01 — Baseline/current/actual, task/süre ağırlıklı completion ve günlük kota karşılığını kur.
- [x] M28-İ02 — Fixed/flexible başlangıç, revision/defer nedenleri, tahmin sapması ve missing coverage ekle.
- [x] M28-İ03 — Basit geçmiş süre önerisi ve gün sonu özetini üret; formül/payda/kesim kurallarını belgele.

Kabul:

- [x] M28-K01 — Başlangıç 10 dk A+180 dk B fixture'ında completed A ve sonradan acil C, başlangıç/güncel paydalara doğru yansıyor.
- [x] M28-K02 — 12 saat projede 1 saat actual completion sayılmıyor; kota ayrı; unknown süre dışarıda ve kapsam gösteriliyor; boş payda hesaplanamaz.
- [x] M28-K03 — Parent eklemek sayıları şişirmiyor; geçmiş kesim olaylardan; öneri plan/tahmini onaysız değiştirmiyor.

Kanıt: docs/verification/mvp-28.md;154 domain ve290/290 tam gerçek integration regresyonu, temiz build, pending model yok. Baseline/current, quota/completion, unknown kapsamı, event cutoff, fixed/flexible gecikme, nedenler ve median öneri doğrulandı.

- [x] MVP-28 tamamlandı — Plan/actual karşılaştırması anlaşılır ve doğru.

### MVP-29 — Bütünleşik doğrulama ve yayın kapısı

Önkoşul: 00–28 (Google03 kullanıcı kararıyla hariç). Skill: ilgili backend becerileri ve aspnet-core. Durum: Tamamlandı.

İşler:

- [x] M29-İ01 — T01–T20 ve A–L backend karşılıklarını gerçek HTTP yolculuğuyla bağla; birikmiş eksikleri açıkça kapat.
- [x] M29-İ02 — Production Docker, kontrollü migration, kalıcı JWT imza anahtarı ve backup/restore işlemlerini belgele/doğrula.
- [x] M29-İ03 — 1000+ task/derin ağaç/yıllık geçmiş fixture'ıyla sorgu ve motor performansını ölç; operasyon belgelerini tamamla.
- [x] M29-İ04 — Backend MVP'leri sonrası frontend geliştiricileri için bütün endpoint'leri, örnek request/response body'lerini, yetki/hata/sürüm/idempotency şartlarını ve SignalR kullanımını içeren ayrıntılı API dokümanını çalışan OpenAPI ve kodla karşılaştırarak oluştur. Kullanıcı isteği:16 Ekim2026.

Kabul:

- [x] M29-K01 — Temiz kurulum, önceki sürümden upgrade, restart ve yedekten restore gerçek çalışıyor; aynı imza anahtarıyla eski JWT restart sonrası geçerli.
- [x] M29-K02 — Bütün backend test/kabul eşleştirmeleri ve ortak DoD geçmiş; frontend-only kanıtlar açık ayrı; secret/mock başarı yok.
- [x] M29-K03 — Referans ortam/sürüm/örnek sayısıyla performans raporu var; 1000 task/31 gün p95 2 sn hedefi değerlendirilmiş, sapma varsa çözüm veya açık kabul kararı kayıtlı.

Kanıt: [MVP29](docs/verification/mvp-29.md),154domain/298tam integration + son schema1/1; Release0uyarı/hata, locked restore ve model drift kontrolü; gerçek Linux Docker/TLS/PG/Quartz/restart/restore; motorp951670,42ms, derin ağaç/yıllık geçmiş HTTP ölçümü. [Frontend API rehberi](docs/Frontend%20API%20Rehberi.md):152işlem/157somut yol/200şema,155gerçek HTTP+2kapalı Google yapısal örnek;356JSON validator geçti. Production yayını ve görsel frontend kabulü yapılmadı.

- [x] MVP-29 tamamlandı — Backend yayın hazırlığı bütün kanıtlarıyla kapandı.

## 10. Kritik test izleme matrisi

Bu kutular yalnız ilgili gerçek regression testi çalışınca işaretlenir; MVP iş kutularıyla aynı şey değildir.

- [x] T01 — 20+40+30=90 dk. Sahip: 08.
- [x] T02 — (15+20)+25=60 dk, recursive çift sayım yok. Sahip: 08.
- [x] T03 — Child completion/parent ilerleme ve auto complete. Sahip: 09.
- [x] T04 — 09:20 acil, actual 20 ve kalan 40 korunur. Sahip: 18.
- [x] T05 — 11:00–11:30 fixed korunur. Sahip: 15–18.
- [x] T06 — Split 60=30+30. Sahip: 16.
- [x] T07 — Non-split aynı boşluklara zorlanmaz. Sahip: 15–16.
- [x] T08 — B start A completed gerektirir. Sahip: 10, 12.
- [x] T09 — Dependency/parent birleşik döngüler reddedilir. Sahip: 07, 10.
- [x] T10 — Replan/undo actual geçmişini değiştirmez. Sahip: 18–19.
- [x] T11 — Parent/child ve work/focus çift sayılmaz. Sahip: 08, 27–28.
- [x] T12 — Midnight 23:30–00:30 doğru günlere ayrılır. Sahip: 21, 27.
- [x] T13 — 6 saat üç güne aynı task ile yayılır. Sahip: 20.
- [x] T14 — 30 dk boşluk/90 dk iş eksik 60'ı gösterir. Sahip: 16.
- [ ] T15 — Reload server kayıtlarından süreyi toparlar. Sahip: 12, 22; browser kanıtı frontend.
- [x] T15-BE — HTTP/host ve gerçek Docker API/DB restart/restore server work/focus kaydını aynı JWT ile toparladı; browser bölümü açık.
- [x] T16 — Gereken recurrence instance, duplicate/geçmiş bozulması yok. Sahip: 24–25.
- [x] T17 — İki sekme/istemci çift aktif work üretmez. Sahip: 12.
- [x] T18 — Eski revision ve farklar okunabilir. Sahip: 14, 21.
- [x] T19 — A, B'nin ID/nested kaynaklarına erişemez. Sahip: bütün yazma/okuma MVP'leri; son kapı 29.
- [x] T20 — İki istemci planı aynı anda değiştirse DB tutarlı. Sahip: 17, 20.

Ek auth testleri:

- [x] J01 — Exp yok; ileri server saatiyle aynı imzalı JWT geçerli. Sahip: 02.
- [x] J02 — Yanlış imza/issuer/audience/algoritma ve eksik JWT reddi. Sahip: 02.
- [ ] J03 — Refresh/cookie oturumu yok; yerel logout ve eski token kopyasının davranışı doğru. Sahip: 02; browser kısmı frontend.
- [x] J03-BE — AuthTests stateless logout ve eski JWT kopyası; refresh/cookie yok. Gerçek localStorage/hub/cache temizliği frontend kabulünde.
- [ ] J04 — Google proof süre/audience ve link/aynı e-posta ayrımı doğru. Sahip: 03.
- [x] J05 — Reset kodu 30 dk/tek kullanım; eski JWT revoke edilmez. Sahip: 04.

## 11. A–L kabul izleme matrisi

24 Ekim UI-33 yerel eşleme: B/C/D/E/H/I/J/K/L browser kanıtıyla işaretlendi; A/F/G açık. Güncel yerleşim farkları ve kanıt sınırları [tek UI-33 raporundadır](../UI/docs/verification/ui-33.md); backend tamamlanması UI kabulü sayılmaz.

Her satırın backend ve frontend kutusu ayrıdır. Backend tamamlanınca görsel kullanıcı yolculuğu tamamlandı sayılmaz.

| Senaryo | Backend kabulü | Frontend kabulü | İlgili paketler |
| --- | --- | --- | --- |
| A İç içe görev/süre/ilerleme | Aşağıdaki A-BE | A-UI | 07–09 |
| B Yarın fixed/esnek beş görev | B-BE | B-UI | 14–17 |
| C Acil iş ve kalan work | C-BE | C-UI | 18 |
| D X'ten sonra/dependency | D-BE | D-UI | 10, 17 |
| E Havuzdaki 12 saat çok gün | E-BE | E-UI | 11, 20 |
| F 35/7 focus/bildirim/devam | F-BE | F-UI | 22, 26 |
| G Geçmiş gün aynı panelde | G-BE | G-UI | 21 |
| H Gelecek ay havuzdan ekleme | H-BE | H-UI | 20–21 |
| I Haftalık actual/tahmin | I-BE | I-UI | 27–28 |
| J Yarıda işin son adım/notu | J-BE | J-UI | 23 |
| K Kalan günü kurtarma | K-BE | K-UI | 18, 23 |
| L Kapanıp açılınca kalıcılık | L-BE | L-UI | 29 |

- [x] A-BE — Üç child, birinde iki alt; doğru hesap/ilerleme HTTP'den doğrulandı.
- [ ] A-UI — Aynı akış gerçek görev ağacı/checkbox üzerinden doğrulandı.
- [x] B-BE — Fixed/esnek yerleşim ve conflict sonucu doğru.
- [x] B-UI — Yarın ekranında doğru yerleşim ve uyarılar kullanılabilir.
- [x] C-BE — Acil start, eski pause ve remaining/actual korunumu doğru.
- [x] C-UI — Tek eylem ve preview/auto farkı gerçek kullanımda anlaşılır.
- [x] D-BE — Soft sıra ve gerçek prerequisite farklı; erteleme etkisi doğru.
- [x] D-UI — İki ilişki seçilebiliyor; gerekçe ve engel görünür.
- [x] E-BE — 12 saat proje günlere aynı TaskId ile; toplam/kalan doğru.
- [x] E-UI — Havuzdan seçilen dağıtım ve ilerleme kullanılabilir.
- [x] F-BE — 35/7, hedef bildirimi, overtime ve mola ayrımı doğru.
- [ ] F-UI — Bildirim/continue/break akışı gerçek browser/cihazda doğrulandı.
- [x] G-BE — Historical day task/work/revision verisi bugünkü değişiklikten bozulmuyor.
- [ ] G-UI — İki hafta önceki gün aynı takvim panelinde, ayrılmadan incelenebiliyor.
- [x] H-BE — Gelecek ay güne pool task ve blok düzenlemesi kalıcı.
- [x] H-UI — Takvim üzerinden seçme/saat/süre ve alternatif klavye yolu çalışıyor.
- [x] I-BE — Haftalık sayı/actual/sapma ve paydalar doğru.
- [x] I-UI — Grafik ve metrik kapsamları kullanıcıya anlaşılır gösteriliyor.
- [x] J-BE — Son gerçek alt adım, son çalışma ve not dönüyor; uydurma veri yok.
- [x] J-UI — Ertesi gün devam ekranında doğru bağlam görünüyor.
- [x] K-BE — Rescue future-only; actual/fixed korunuyor; yerleşmeyenler açık.
- [x] K-UI — Kullanıcı kalan gün önerisini inceleyip uygulayabiliyor.
- [x] L-BE — DB restart/restore sonrası plan/task/work/preferences tutarlı.
- [x] L-UI — Browser kapat/aç sonrası kayıtlar ve JWT bootstrap doğru; offline kaydedildi izlenimi yok.

## 12. Kilometre taşları

- [x] KM1 — MVP-00–11 (kullanıcı kararıyla kapalı Google03 hariç): hesap/task tree/süre/dependency/havuz doğrulandı.
- [x] KM2 — MVP-12–14: gerçek çalışma + manuel plan + revision birlikte doğrulandı.
- [x] KM3 — MVP-15–19: günlük motor + acil iş + undo doğrulandı.
- [x] KM4 — MVP-20–24: çok gün/calendar/focus/destek/tekrar doğrulandı.
- [x] KM5 — MVP-25–29: jobs/push/analytics/yayın hazırlığı doğrulandı.

## 13. Değişiklik ve devir günlüğü

| Tarih | Kapsam | Sonuç / sonraki adım |
| --- | --- | --- |
| 15.10.2026 | Auth planı | Identity/cookie yerine exp'siz JWT; refresh yok. Google ve reset korunur; logout yerel. |
| 15.10.2026 | Dokümantasyon | AGENTS/skill/plan güncellendi; bu takip dosyası oluşturuldu. Uygulama MVP kutuları boş; sonraki MVP-00. |

Her sonraki teslimde yeni satır ekle: MVP ve yapılan iş, gerçek kontroller, engel ve sıradaki adım. Bitmemiş işi silme; yeni gereksinimi kararıyla ekle. Ayrı roadmap belgesi oluşturulursa bu dosyaya bağlansın; çelişen ikinci ilerleme kaynağı olmasın.

| 15.10.2026 | MVP-00 | Ortak veri/state/HTTP/transaction tasarımı ve 4 senaryo incelemesi kabul edildi; kanıt docs/verification/mvp-00.md. MVP-01 başladı. |

| 15.10.2026 | MVP-01 | 4 gerçek PG/HTTP testi ve temiz Release build; doğrulama docs/verification/mvp-01.md. MVP-02 başladı. |

| 15.10.2026 | MVP-02 | 19 gerçek PG/JWT/HTTP testi ve temiz Release build; docs/verification/mvp-02.md. Google adaptörüne geçildi. |

15 Ekim 2026 — MVP-11 kapandı: sınıflandırma, grup roll-up, Türkçe arama ve üç çocuk/iki yaprak HTTP kilometre taşı doğrulandı. MVP-12 aktif. MVP-29 önkoşulunda kullanıcı kararıyla kapalı Google03 gerçek sağlayıcı kabulü, yeniden etkinleştirilene kadar hariçtir.

15 Ekim 2026 — MVP-12 kapandı. Start/pause/resume/finish, actual/remaining, immutable başlangıç bağlamı ve görev kapanışı; gerçek HTTP/DB/race/restart testleriyle doğrulandı. MVP-13 aktif.

15 Ekim 2026 — MVP-13 kapandı: geçmişe manuel ekleme, effective segment düzeltme, immutable before/after/why journal ve void/restore hazır. MVP-14 aktif; somut API/FK/transaction sözleşmesi docs/manual-planning.md içinde takip edilecek.

15 Ekim 2026 — MVP-14 kapandı: current/baseline/full revision/delta, manuel conflict, gece bölme, planlı work context ve task lifecycle aynı transaction içinde doğrulandı. Son subtree kontrolünde PG kapalıydı; proje DB yeniden başlatılıp test1/1 geçti. MVP-15 saf tek gün motoru aktif; HTTP preview/apply17'de.

15 Ekim 2026 — MVP-15 kapandı: heuristic-v1 saf tek gün non-split motoru;79 domain ve132 gerçek HTTP/DB regresyonu geçti. MVP-16 aktif.

15 Ekim 2026 — MVP-16 kapandı:101 domain, split/partial/minimum/stability/transition ve30 varyasyon property testleri geçti. MVP-17 HTTP preview/apply ve server snapshot aktif.

15 Ekim2026 — MVP-21 kapandı:209 gerçek PG/HTTP +126 domain, tarihsel gün/zone ve carry/pool kabulü geçti. Kanıt docs/verification/mvp-21.md. MVP-22 aktif.

15 Ekim2026 — MVP-22 kapandı:223 gerçek PG/HTTP +133 domain; focus/work bütünlüğü ve kabul kapısı geçti. Kanıt docs/verification/mvp-22.md. MVP-23 aktif.

15 Ekim2026 — MVP-23 kapandı:234 gerçek PG/HTTP +135 domain; notlar, geri dönüş ve destek kabulü geçti. Kanıt docs/verification/mvp-23.md. MVP-24 aktif.

16 Ekim2026 — MVP-24 kapandı:246 gerçek PG/HTTP +142 domain; recurrence kabulü ve KM4 geçti. Kanıt docs/verification/mvp-24.md. MVP-25 aktif.

16 Ekim2026 — MVP-25 kapandı:146 domain;257 tam integration ve son2 hedefli test (258 farklı test) geçti. Kanıt docs/verification/mvp-25.md. MVP-26 aktif.

16 Ekim2026 — MVP-26 kapandı:149 domain,270 tam integration ve son9 hedefli test (271 farklı test). Kanıt docs/verification/mvp-26.md. MVP-27 aktif. Frontend geliştirici API dokümanı tüm backend MVP'lerinden sonra M29-İ04 kapsamında hazırlanacak.

16 Ekim2026 — MVP-27 kapandı:152 domain,14 ilgili HTTP/PG/OpenAPI;281 farklı doğrulanmış integration testi. Formüller docs/statistics-definitions.md; kanıt docs/verification/mvp-27.md. MVP-28 aktif.

16 Ekim2026 — MVP-28 kapandı:154 domain,290/290 tam integration. Kanıt docs/verification/mvp-28.md. MVP-29 aktif; yayın/restore/performans ve sonrasında bütün endpoint örnekli frontend API dokümanı hazırlanacak.

16 Ekim2026 — MVP29 kapandı:298/298 integration,154/154domain, son schema1/1; Docker/TLS/Kestrel/PG18.6/Quartz/restart/custom backup-restore kabulü. Motor1000/31p951670,42ms; query1000task/128depth/365days ölçüldü. Frontend rehberi152işlem/157yol/200şema/356JSON doğrulandı. Backend29/30, Google03 ertelendi; aktif backend yok, UI henüz uygulanmadı. Kanıt docs/verification/mvp-29.md.

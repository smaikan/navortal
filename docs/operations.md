# Backend çalıştırma, migration ve geri dönüş

16 Ekim 2026. Bu belge yerel kabul ve yayın hazırlığı runbook'udur; gerçek production ortamına yayın yapıldığı anlamına gelmez. .NET10, PostgreSQL18 ve tek modüler monolit kullanılır. Kullanıcı verisi, outbox/Quartz tabloları ve plan geçmişi aynı PostgreSQL'dedir.

## Yerel geliştirme ve test

API kökünde README'deki PowerShell script'leri ve kilitli SDK/paketler kullanılır. Yerel PostgreSQL yalnız loopback55432'de projeye ait `.local/` verisiyle çalışır. Bu geliştirme DB'sinin trust ayarı production ayarı değildir. Gerçek PostgreSQL integration fixture'ları benzersiz `adhd_test_...` DB oluşturur ve yalnız kendi DB'sini siler. Başka proje veritabanı silinmez.

```powershell
dotnet restore AdhdPlanner.slnx --locked-mode
dotnet build AdhdPlanner.slnx -c Release --no-restore
dotnet test tests/Adhd.UnitTests -c Release --no-build --no-restore
dotnet test tests/Adhd.IntegrationTests -c Release --no-build --no-restore
```

Testler shared Windows DLL çıktısını kullanırken build/publish başlatmayın. Disk/CPU'yu yoğun kullanan Docker image build/restore doğrulamasını tam native DB regresyonundan ayrı çalıştırın. Yavaş ortamda Npgsql timeout'u business başarısı değildir; nedeni kaydedip sakin ortamda tekrar doğrulayın. Ortamın test sonuçlarını gizlemek için timeout/kuralları gevşetmeyin.

## Image ve kontrollü migration

`Dockerfile` çok aşamalıdır: SDK10.0.300 build ve ASP.NET10.0.13 runtime MCR SHA256 digest ile sabittir. Restore locked-mode, repo local `dotnet-ef10.0.13` manifest'i ile tool restore, Release publish yapılır. Runtime non-root APP_UID1654'tür. `.local`, test/tools/docs/script dosyaları ve build artıkları image context'inden çıkarılır. SDK migration target yalnız migration job'unda kullanılır.

`docker-compose.yml` PostgreSQL18.6 (SHA256 digest ile sabit), ayrı `migrate` servisi ve API içerir. DB ve API `restart: unless-stopped` ile sunucu yeniden başlayınca kendiliğinden açılır; migration job'u yeniden başlamaz. Kalıcı volume PostgreSQL18'in `/var/lib/postgresql` yoluna bağlıdır. DB health sonrası migration job tamamlanmadan API başlamaz. API startup `Migrate/EnsureCreated/EnsureDeleted` çalıştırmaz. Yeni schema ayrı kontrollü adımdır. PostgreSQL image tag'i bakım güncellemesinde bilinçli test edilerek yenilenmelidir.

İlk kurulum örneği, API kökünde Linux shell (secret değerlerini stdout'a basmadan sağlayın):

```bash
# Ortam/secret store bu iki değeri sağlamalı. Örnek gerçek bir parola içermez.
test -n "$POSTGRES_PASSWORD"
test -n "$JWT_SIGNING_KEY"
docker compose build
docker compose up -d db
docker compose run --rm migrate
docker compose up -d api
curl --fail http://127.0.0.1:5080/health/ready
```

Güncellemede önce doğrulanmış backup alın, API ve worker yazımlarını durdurun; yeni image'ı build/pull edin, `docker compose run --rm migrate` çalıştırın, başarılıysa API'yi yeniden oluşturun. Schema breaking değişiminde eski uygulama image'ına tek başına dönmeyin; uyumluluk veya DB restore planını birlikte kullanın. Otomatik migration downgrade, geçmiş actual/revision silme veya startup seed yoktur. Quartz upstream destructive DDL kullanılmaz; create-only schema EF migration içindedir.

Compose'un API8080 portu hostta yalnız `127.0.0.1:5080` yayınlanır; public uç HTTPS reverse proxy'dir.

Hosttaki proxy API'ye compose ağının geçidinden bağlanır; API bağlantıyı loopback'ten değil bu IP'den görür. Compose bu yüzden ağı sabit bir alt ağla kurar ve geçidi `ReverseProxy__KnownProxies__0` olarak verir. Bu ayar olmadan bütün istekler aynı IP'den gelmiş sayılır ve giriş hız sınırı (5 dakikada 30 istek) bütün kullanıcılar için tek kova olur.

| Değişken | Varsayılan | Ne zaman değişir |
| --- | --- | --- |
| `API_SUBNET` | `172.30.80.0/24` | Sunucudaki başka bir ağla çakışırsa. |
| `API_GATEWAY` | `172.30.80.1` | `API_SUBNET` değişirse, onun geçidi. |
| `REVERSE_PROXY_IP` | `API_GATEWAY` | Proxy API'ye geçitten değil başka bir IP'den bağlanıyorsa (ör. aynı ağdaki proxy konteyneri, Docker Desktop). |

Proxy `X-Forwarded-For` başlığını gelen değere eklemez, istemcinin kendi adresiyle (`$remote_addr`) yazar; `X-Forwarded-Proto` da proxy tarafından yazılır. API yalnız tek hop kabul eder: önünde ikinci bir vekil (ör. nginx → Next.js → API) varsa, API'ye bağlanan son vekil gerçek istemci adresini iletmelidir. Mevcut compose içinde Next.js servisi henüz yoktur. Frontend gelince `/` Next.js upstream'e, `/api` ve hub ASP.NET'e yönlenir.

## Kalıcı ayarlar

| Ayar | Sorumluluk |
| --- | --- |
| `ConnectionStrings__Planner` | Host/Database/Username/Password. DB18 uyumlu kalıcı veriye bağlanır. |
| `Jwt__SigningKey` | Kalıcı, yeterince uzun HS256 secret; restart'ta yeniden üretmeyin. Issuer/audience da uygulama ayarlarıyla aynı kalır. |
| `ReverseProxy__KnownProxies__0`, sonraki indeksler | API'nin doğrudan bağlandığı güvenilir proxy IP'leri. Tek-hop forwarded header limit1. Bütün interneti trusted network yapmayın. |
| `Jobs__Enabled` | Varsayılan kalıcı worker'ları açar; false yalnız hosted işleri kapatır, kayıtları silmez. |
| `Google__Enabled=false` | Başlangıçta Google girişi kapalıdır; Client ID ayarlandıktan sonra true yapılır. [Kurulum](google-auth-setup.md). |
| `Google__ClientId` | Google Auth Platform → Clients → Web application Client ID. API/.local/api.env içinde boş alan hazırdır; Client Secret gerekmez. |
| SMTP yapılandırması | İsteğe bağlı parola kurtarma; register email onayı içermez. Kesin alan adları `appsettings.json`/README'dedir. |
| `Push__Enabled=false` | Başlangıçta dış Web Push kapalı; in-app/SignalR bağımsız çalışır. |
| `Push__Subject`, `Push__PublicKey`, `Push__PrivateKey` | Açılırsa ayrı kalıcı P-256 VAPID keypair ve gerçek iletişim adresi gerekir. JWT secret'ı değildir. |

### Docker Compose ile kalıcı Web Push yapılandırması

Repo kökünde `node API/scripts/configure-web-push.mjs mailto:GERCEK-ILETISIM-ADRESI` çalıştırılır. Node 24 scripti ayrı P-256 anahtarı üretir, imzayı doğrular ve `API/.local/push.env` dosyasını yalnız yoksa `0600` izniyle oluşturur. Tekrar çalıştırma mevcut anahtar çiftini doğrular; değiştirmez. Geçersiz dosya sessizce yenilenmez. Dosyayı diğer üretim sırlarıyla birlikte koruyun; içeriğini terminale veya loga yazdırmayın.

Kök Compose yalnız API servisine bu isteğe bağlı dosyayı yükler. Yapılandırma değişince API konteyneri yeniden oluşturulmalıdır; salt `restart` yeni env değerlerini almaz. Dosya bulunmazsa varsayılan kapalı davranış korunur. Cihaz etkinleştirme için sunucunun açık olması, genel/tür tercihi, tarayıcı izni ve güncel tarayıcı aboneliği ayrı koşullardır; hizmetin açılması kullanıcıları otomatik abone yapmaz.

Yayın kabulünde oturum açılmış `/api/notifications/push-config` yanıtının `enabled=true` ve geçerli public key taşıdığını kontrol edin. Private key HTTP'ye dönmez. Abonelik oluşturma, kapatma ve gerçek yeni hatırlatma teslimini ayrı doğrulayın. Provider'ın HTTP 201 cevabı cihazda görünme veya sesin duyulma kanıtı değildir; işletim sistemi sessiz modu ve tarayıcı hizmetine ağ erişimi ayrıca etkiler.

Env, `.env`, JWT/VAPID private key, SMTP parola ve DB backup'larını repo/HTTP/loglara almayın. `.local` yalnız geliştirici geçici alanıdır; üretim secret store/backup saklaması ayrıca sağlanır. JWT exp'sizdir; signing key kaybı/değişimi eski token'ların doğrulanmasını etkiler. Logout ve parola reset eski kopyaları revoke etmez. VAPID key değişirse browser subscription yenilenir.

17 Ekim JWT/SMTP güvenlik düzeltmesi: API Git/Docker ignore `.env*` çeşitlerini kapsar; Docker ayrıca nested `**/.env*` dosyalarını dışlar. Ignore, önceden yayımlanmış sırrı geri almaz; harici credential/key değiştirilmedi. JWT anahtarı en az32byte ve boş olmayan değer olmalı; üretimde32rastgelebyte veya fazlasını güvenli kaynaktan sağlayın. SMTP açıkken startup validation Host/Port/From/ResetPageUrl/Security alanlarını kontrol eder. Zorunlu TLS StartTls/SslOnConnect; Auto/StartTlsWhenAvailable reddedilir. None ve HTTP reset URL yalnız Development/Testing loopback istisnasıdır; localhost benzeri uzak alan adları istisna sayılmaz. Production reset adresi HTTPS, user info/query içermeyen URL olmalı; güncel frontend için `https://<uygulama-origin>/parola-yenile#`. Sertifika doğrulamasını kapatan callback eklenmez. Ayar hataları değer/parola içermeyen alan adlarıyla bildirilir. [Odaklı test kanıtı](verification/auth-security.md).

## HTTPS ve SignalR proxy

Gerçek ortamın proxy ayarı depoda tutulmaz. `scripts/container-smoke.py` çalışırken kendi nginx ayarını `.local/container-smoke/<id>/nginx.conf` dosyasına yazar; aşağıdaki kurallar o test ayarına göredir ve gerçek proxy'de de uygulanır. Sertifikalar gerçek ortamda sertifika yönetiminden mount edilir. Lokal kabul testinde2günlük localhost sertifikası yalnız test istemcisi trust context'ine eklenir; OS trust store değiştirilmez.

Test ayarı 8443'te TLS1.2/1.3, HTTP1.1 Upgrade/Connection ve buffering kapalı SignalR/SSE proxy'si kullanır. Docker DNS resolver ile API recreate sonrasında upstream IP yenilenir. UI mevcut olmadığı için `/`404'tür. `X-Forwarded-For/Proto` proxy tarafından yazılır; uygulama yalnız KnownProxies'den kabul eder. Gerçek ortamda proxy IP'sini yukarıdaki `REVERSE_PROXY_IP` ile verin.

JWT browser WebSocket/SSE query'sinde bulunabildiğinden access log `$uri` kullanır, `$request_uri/$request` veya Authorization loglamaz. Nginx error satırları raw request/query içerebildiği için test ayarında `error_log /dev/null`; operasyon görünürlüğü access status/request-id, uygulama safe error/traceId ve health'ten sağlanır. Kuruma ait farklı error logger eklenecekse query redaction kanıtlanmalıdır. Uygulama Hosting.Diagnostics query logging Warning'e filtrelidir. SensitiveDataLogging açılmaz.

WebSocket middleware auth'tan önce etkinleştirilir: gerçek Kestrel upgrade feature'ı JWT taşıma seçicisinde hazır olmalıdır. Salt TestServer WebSocket başarısı bu sırayı tek başına kanıtlamadı; gerçek TLS/Nginx/Kestrel kabul script'i regresyon olarak tutulur. [Resmî WebSockets middleware belgesi](https://learn.microsoft.com/aspnet/core/fundamentals/websockets?view=aspnetcore-10.0).

## Backup ve ayrı DB'ye restore

Custom-format backup bütün schema/veriyi kapsar: users, preferences, tasks/notes, effective work/segments ve correction journal, plan/revision snapshot/delta, recurrence, outbox/intent/delivery, Quartz. İmza anahtarı DB dump'ın parçası değildir; aynı zamanda ayrı kalıcı secret olarak korunur. DB dump hassas kullanıcı verisidir.

Aşağıdaki örnekler **Linux shell** içindir; binary dump'ı eski Windows PowerShell text pipeline'ından geçirmeyin. Hedef DB yeni ve boş olmalıdır. `BACKUP_PATH` işletmecinin açık seçtiği dosya yoludur. Restore'un çalışan production DB'sinin üstüne yazılması bu komutlarda yoktur.

```bash
test -n "$BACKUP_PATH"
docker compose exec -T db pg_dump -U adhd -d adhd -Fc > "$BACKUP_PATH"
docker compose exec -T db createdb -U adhd adhd_restore
docker compose exec -T db pg_restore -U adhd -d adhd_restore \
  --exit-on-error --no-owner < "$BACKUP_PATH"
```

API/worker'ları durdurup hedef bağlantısını `adhd_restore` yapın; aynı JWT issuer/audience/signing key ile kontrollü migrate job çalıştırın, API'yi recreate edin. Eski JWT ile me/preferences/task/day/revision/current-work/focus/return-context okuyun; kaynak FK'leri ve segment actual'ını karşılaştırın. Restore sonrası mevcut açık work, normal sayaç kuralı gereği durmadan geçen süreyi içerir; sunucunun kapalı olması work finish değildir. Gerekiyorsa kullanıcı audit'li correction yapar.

Başarı kontrolü: `/health/ready`200, eski JWT me200, baseline revision değişmemiş, StartedRevisionItemId aynı, running work geri gelmiş, focus/not/preference aynı, yabancı owner404. Sadece pg_restore exit0 yeterli kabul değildir. Restore edilmiş outbox/worker lease'leri kalıcı retry/misfire kurallarıyla toparlanır; dış push'ta distributed exactly-once iddiası yoktur. Canlı sistemden bağımsız restore denemelerini düzenli işletim rutini olarak ayrıca planlayın; bu çalışma otomasyon yaratmaz.

## İşletim gözlemi

`/health/live` yalnız process; `/health/ready` gerçek PG kontrolüdür. DB yokken live200/ready503 beklenir. Production OpenAPI route kapalıdır; frontend sabit repo JSON'unu kullanır. API exception body güvenli `code/traceId`, field hataları `errors`; SQL değerleri/parolalar dökülmez.

Quartz qrtz_ job store cluster uyumludur. Outbox lease2dk/SKIP LOCKED, bounded5attempt ve backoff/receipt uygular. Misfire geçmiş bütün tick'leri patlatmaz. Kullanıcı failed outbox'ı `/api/jobs/outbox?state=Failed` üzerinden görür, version ile retry eder. Başkasının job payload/ID'sine erişmez. DB tablo satırını elle Completed yaparak history/notification üretmeyin.

Push404/410 aboneliği deaktive eder;429/5xx bounded retry; DND deneme bütçesi tüketmez. Provider kabulü browser görüntüledi kanıtı değildir. Bildirimler ve SignalR event tekrarları istemcide kimlikle dedup edilir, reconnect HTTP refetch yapar. İş başlatma/bitirme gerçeği notification sonucuna bağlanmaz.

## Tekrarlanabilir lokal container kabulü

`scripts/container-smoke.py` yalnız projeye ait izole Docker socket, UUID'li compose project ve sentetik volume'larla çalışır. Gerçek hesap, dış SMTP/push veya production domain'i kullanmaz. Her çalışmada yeni DB/secret/test TLS sertifikası üretir; finally yalnız kendi project volume/network/container'larını temizler. Backup/secret dosyaları ignored `.local/container-smoke/` altında kalır. `proof.json` yalnız güvenli kabul özeti içerir.

Bu makinede Docker Desktop bulunmadığı için resmî Docker29.9.1 statik binary, Compose5.6.0 ve Buildx0.38.0 checksum'ları doğrulanarak WSL Ubuntu26.04'te **ayrı** socket/data-root ile kullanıldı. Mevcut başka daemon ayarı/OS servisi değiştirilmedi. İç DNS için eksik WSL iptables bağımlılığı kuruldu; daemon'un host firewall yönetimi kapalıdır. overlay2 kullanılır. Başlat/durdur script'i sahiplik marker'ı ve süreç yolunu doğrular. Bu test düzeni production daemon kurulum önerisi değildir.

Sıra: build-test-images → container-smoke → own daemon stop → native full regression. SDK/migration image ve runtime image aynı Dockerfile kaynağından gelir. Linux smoke clean migration, API/DB restart, eski JWT, plan/work/focus/not/preference restore, TLS SignalR ve HTTP tick olmadan Quartz focus alarmını doğrular. Güncel somut sonuçlar [MVP-29 kanıtındadır](verification/mvp-29.md).

Temsilî performans [motor](verification/mvp-29-performance.json) ve [HTTP/DB sorguları](verification/mvp-29-query-performance.json) olarak saklanır. Saf motor p95 hedefi HTTP/DB/network/browser toplam SLA değildir. Bu ölçümler tek kullanıcı/sınırlı referans fixture'dır; çok kiracılı production kapasite testi yerine geçmez.

### Mobil bildirim iyileştirmeleri

`20261110194716_AddNotificationClientReceipts` migration'ı yalnız içeriksiz istemci makbuz tablosunu ekler; mevcut görev, plan, tercih ve abonelikleri değiştirmez. `/api/notifications/summary` gerçek owner kapsamlı okunmamış sayacıdır. `read-all` yanıtındaki `summary` aynı transaction'ın komut sonrası sonucudur. Yeni arayüzden önce API/migration yayımlanır; eski istemciler ek alanları kullanmadan çalışabilir.

P1 izin/kurulum, sayaç ve panel akışı yayımlandıktan sonra P2 okundu gönderim kuralı `Push__SuppressReadDeliveries=true` ile ayrıca açılabilir (varsayılan `false`). Bu değeri mevcut `API/.local/push.env` içine diğer VAPID değerlerini koruyarak ekleyin ve yalnız API'yi yeniden oluşturun: `docker compose up -d --no-deps api`. `false` değeri önceki gönderim kuralına geri döner. Anahtarları yeniden üretmeyin. Açık erteleme `ReadAt` değerini sıfırlayıp yeni tur açar; başlamış dış ağ isteği geri alınamaz.

Makbuzlar kullanıcı/bildirim/tur/aşama ve sunucu zamanlarından oluşur; başlık, gövde, endpoint ve token içermez. Tarayıcı kuyruğu ayrı IndexedDB'dedir: en çok 256 kayıt, 24 saat ömür, her tetikte en çok 20 gönderim ve 5 saniye ağ bütçesi. Oturum/hesap doğrulaması ve cookie CSRF uygulanır; ağ hataları gösterilen bildirimi başarısız saymaz. Sağlayıcı kabulü, tarayıcı gösterim/açılma bildirimi ve uygulamada okunma ayrı kanıtlardır; fiziksel kilit ekranı/ses garantisi değildir.

Taşıyıcı önceliği ve toplulaştırma değiştirilmemiştir. Gerçek iOS/Android arka plan, kilit ekranı, pil tasarrufu ve ekran okuyucu kabulü ayrıca kaydedilmelidir.

### Native FCM Aşama 1 (12 Kasım 2026: canlı)

Yukarıdaki Web Push tesliminden sonraki native ekin sözleşmesi [Android FCM API Aşama 1](android-fcm-api-stage1.md) belgesindedir. `20261111214523_AddMobilePush` üretime uygulanmıştır; dört tablo ekler ve mevcut abonelikleri korur. Yayından önce alınan yedek izole veritabanına geri yüklenmiş, migration orada doğrulanmış ve üretim uygulamasında mevcut tabloların kayıt sayıları korunmuştur.

Uygulama varsayılanı `Firebase__Enabled=false` olarak kalır. Üretimde `API/.local/firebase.env` üzerinden `Firebase__Enabled=true`, `Firebase__ProjectId=navortal`, `Firebase__ServiceAccountPath=/opt/navortal/API/.local/firebase-service-account.json` ve `Firebase__AndroidPackageName=tr.com.navortal` ayarlanmıştır. `Firebase__TimerSyncEnabled=false` yalnız ayrılmış ayardır. Anahtar dosyası root sahibi, API grubuna okunabilir ve diğer kullanıcılara kapalıdır; içeriği image/repository/mobil pakete eklenmez.

Üretimde anahtarı salt okunur bağlayan ek dosyayla API güncellenir: `docker compose -f docker-compose.yml -f docker-compose.firebase.yml up -d --no-deps --no-build api`. Anahtar yokken temel Compose yine kullanılabilir; ek FCM dosyası yalnız anahtar hazırlanmış üretim için seçilir. FCM kapalıysa veya uygulama dosyayı bulamıyorsa mevcut Web Push yolu çalışır. JSON içeriğini terminale veya loga yazdırmayın.

Yayın kabulünde Google OAuth erişimi doğrulandı; `validate_only` FCM isteği sentetik hedef için beklenen INVALID_ARGUMENT yanıtını döndürdü. Gerçek Android tokenıyla teslim/gösterim ayrıca sınanmalıdır. Geri dönüş imajı ve yedek bilgileri `API/.local/current-fcm-stage1-deployment` işaretçisinin gösterdiği özel klasördedir; eklemeli migration için otomatik tablo silme/downgrade yapılmaz.

Etkin FCM ile uygun mobil kayıt varsa teslim başına kalıcı mobil önceliği uygulanır; hedef yoksa veya kesin ret varsa Web Push'a düşülür. Belirsiz ağ sonucu çift bildirimi önlemek için Web Push'a düşürülmez. Ayrıntılar ve bu tercihin teslim kaybı sınırı sözleşmede açıklanır.

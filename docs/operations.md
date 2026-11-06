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

`docker-compose.yml` PostgreSQL18.6, ayrı `migrate` servisi ve API içerir. Kalıcı volume PostgreSQL18'in `/var/lib/postgresql` yoluna bağlıdır. DB health sonrası migration job tamamlanmadan API başlamaz. API startup `Migrate/EnsureCreated/EnsureDeleted` çalıştırmaz. Yeni schema ayrı kontrollü adımdır. PostgreSQL image tag'i bakım güncellemesinde bilinçli test edilerek yenilenmelidir.

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

Compose'un API8080 portu hostta yalnız `127.0.0.1:5080` yayınlanır; public uç HTTPS reverse proxy'dir. Mevcut compose içinde Next.js servisi henüz yoktur. Frontend gelince `/` Next.js upstream'e, `/api` ve hub ASP.NET'e yönlenir.

## Kalıcı ayarlar

| Ayar | Sorumluluk |
| --- | --- |
| `ConnectionStrings__Planner` | Host/Database/Username/Password. DB18 uyumlu kalıcı veriye bağlanır. |
| `Jwt__SigningKey` | Kalıcı, yeterince uzun HS256 secret; restart'ta yeniden üretmeyin. Issuer/audience da uygulama ayarlarıyla aynı kalır. |
| `ReverseProxy__KnownProxies__0`, sonraki indeksler | API'nin doğrudan bağlandığı güvenilir proxy IP'leri. Tek-hop forwarded header limit1. Bütün interneti trusted network yapmayın. |
| `Jobs__Enabled` | Varsayılan kalıcı worker'ları açar; false yalnız hosted işleri kapatır, kayıtları silmez. |
| `Google__Enabled=false` | Kullanıcı kararı; gerçek Google provider kabulü ertelenmiştir. |
| SMTP yapılandırması | İsteğe bağlı parola kurtarma; register email onayı içermez. Kesin alan adları `appsettings.json`/README'dedir. |
| `Push__Enabled=false` | Başlangıçta dış Web Push kapalı; in-app/SignalR bağımsız çalışır. |
| `Push__Subject`, `Push__PublicKey`, `Push__PrivateKey` | Açılırsa ayrı kalıcı P-256 VAPID keypair ve gerçek iletişim adresi gerekir. JWT secret'ı değildir. |

Env, `.env`, JWT/VAPID private key, SMTP parola ve DB backup'larını repo/HTTP/loglara almayın. `.local` yalnız geliştirici geçici alanıdır; üretim secret store/backup saklaması ayrıca sağlanır. JWT exp'sizdir; signing key kaybı/değişimi eski token'ların doğrulanmasını etkiler. Logout ve parola reset eski kopyaları revoke etmez. VAPID key değişirse browser subscription yenilenir.

17 Ekim JWT/SMTP güvenlik düzeltmesi: API Git/Docker ignore `.env*` çeşitlerini kapsar; Docker ayrıca nested `**/.env*` dosyalarını dışlar. Ignore, önceden yayımlanmış sırrı geri almaz; harici credential/key değiştirilmedi. JWT anahtarı en az32byte ve boş olmayan değer olmalı; üretimde32rastgelebyte veya fazlasını güvenli kaynaktan sağlayın. SMTP açıkken startup validation Host/Port/From/ResetPageUrl/Security alanlarını kontrol eder. Zorunlu TLS StartTls/SslOnConnect; Auto/StartTlsWhenAvailable reddedilir. None ve HTTP reset URL yalnız Development/Testing loopback istisnasıdır; localhost benzeri uzak alan adları istisna sayılmaz. Production reset adresi HTTPS, user info/query içermeyen URL olmalı; güncel frontend için `https://<uygulama-origin>/parola-yenile#`. Sertifika doğrulamasını kapatan callback eklenmez. Ayar hataları değer/parola içermeyen alan adlarıyla bildirilir. [Odaklı test kanıtı](verification/auth-security.md).

## HTTPS ve SignalR proxy

`deploy/nginx.conf` çalışan TLS/proxy şablonudur; `/etc/nginx/tls/cert.pem` ve `key.pem` gerçek ortamda sertifika yönetiminden mount edilir. Lokal kabul testinde2günlük localhost sertifikası yalnız test istemcisi trust context'ine eklenir; OS trust store değiştirilmez.

Şablon8443'te TLS1.2/1.3, HTTP1.1 Upgrade/Connection ve buffering kapalı SignalR/SSE proxy'si kullanır. Docker DNS resolver ile API recreate sonrasında upstream IP yenilenir. UI mevcut olmadığı için `/`404'tür. `X-Forwarded-For/Proto` proxy tarafından yazılır; uygulama yalnız KnownProxies'den kabul eder. Gerçek ortamdaki proxy IP/servis isimleriyle template'i uyarlayın.

JWT browser WebSocket/SSE query'sinde bulunabildiğinden access log `$uri` kullanır, `$request_uri/$request` veya Authorization loglamaz. Nginx error satırları raw request/query içerebildiği için örnek şablonda `error_log /dev/null`; operasyon görünürlüğü access status/request-id, uygulama safe error/traceId ve health'ten sağlanır. Kuruma ait farklı error logger eklenecekse query redaction kanıtlanmalıdır. Uygulama Hosting.Diagnostics query logging Warning'e filtrelidir. SensitiveDataLogging açılmaz.

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

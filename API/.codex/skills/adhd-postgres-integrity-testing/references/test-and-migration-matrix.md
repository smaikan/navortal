# Migration ve test matrisi

## Ortam

PostgreSQL 18 ve EF/Npgsql 10 proje temelidir. Repo pinlerini ve çalıştırılan gerçek sürümü kontrol et. Docker/Testcontainers veya açıkça ayrılmış test PostgreSQL kullanılabilir; ortak/production veritabanına test temizliği uygulama. Docker yoksa limitation'ı raporla, EF InMemory ile geçilmiş gösterme.

## Şema değişikliğinde

1. Domain kuralını ve mevcut veriyi incele.
2. FK silme davranışı, nullable alan, default ve benzersizliği değerlendir.
3. Migration üret ve SQL etkisini oku; aktif kullanıcı verisinin kaybolmasını önle.
4. Boş DB'ye bütün migrations'ı uygula.
5. Önceki sürümde temsilî veri oluşturup ileri migrate et; veri ve referansları kontrol et.
6. Değişen HTTP/domain/DB testlerini çalıştır. Gereksiz şema rewrite'ı yapma.

Rollback her migration'da veri kayıpsız olmak zorunda değildir; uygulanabilir yayın ve restore stratejisini açık tut. Production migration'ını her API instance başlangıcında yarışa sokma.

## Kritik matris

| Alan | Kontrol |
| --- | --- |
| Kullanıcı izolasyonu | A'nın B task/plan/session/revision/nested kaynağına read/write girişimi |
| JWT | exp yok/ileri zaman geçerli; bozuk imza, yanlış issuer/audience ve olmayan kullanıcı reddi; refresh/session tabloları yok |
| Oturum | Aynı anda iki start; pause/resume/finish yarışı; tek açık segment |
| Plan apply | Aynı proposal tekrarı; aynı key farklı payload; stale sürüm |
| Atomiklik | Snapshot/ikinci gün/outbox yazımında hata ve tam rollback |
| Geçmiş | Arşivleme/taşıma/undo sonrası eski bağlantılar |
| Recurrence | Aynı pencere ve eşzamanlı worker'da unique instance |
| Düzeltme | Audit + effective value atomikliği; overlap reddi |
| Zaman | UTC mapping; DST; gece yarısı; yarı açık aralık |

Race testinde tek DbContext'i iki thread arasında paylaşma; ayrı scope/connection ve kontrollü senkronizasyon kullan. Arbitrary sleep yerine barrier/işaretli test düzeni tercih et.

## Performans

1000+ görev, derin ağaç, yıllık plan geçmişi ve binlerce oturum içeren temsilî fixture. Tarih aralığı ve pagination olmadan sınırsız sorgu sunma. Sorgu sayısı, DB roundtrip, EXPLAIN planı ve payload boyutunu ihtiyaç olduğunda ölç. Referans ortamda 1000 görev/31 günlük planlama için p95 2 sn başlangıç hedefidir; ölçülmeden sağlandı deme.

## Rapor

Komut, ortam, sürüm, geçen/kalan kontrol ve ilgili kanıtı yaz. `Uygulama Adımları.md` içindeki ilgili iş/kabul kutularını yalnız kanıt varsa işaretle; MVP kapanışını ortak kapı sağlanınca yap. Uygulama henüz yokken bu skill'in doğrulanması backend testlerinin geçtiği anlamına gelmez.

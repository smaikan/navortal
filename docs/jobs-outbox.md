# Kalıcı işler ve transactional outbox — MVP-25

Durum: Tamamlandı; kabul kanıtı [verification/mvp-25.md](verification/mvp-25.md). Push/SignalR ve kullanıcı bildirim tercihleri26'dadır; bu paket dış cihaza bildirim teslimi iddia etmez.

## Üretim ve iş sahiplenme

PlannerDbContext SaveChanges/SaveChangesAsync; yeni TaskEvent/PlanRevision, değişen WorkSession/FocusSession/UserPreferences/RecurrenceTemplate için minimal kimlik/version içeren outbox kaydını aynı EF işlemi/transaction'ına ekler. Task/plan/work metni, JWT, parola veya push endpoint'i payload'a konmaz. Önizleme SchedulingProposal'ı accepted plan olayı yayımlamaz. Birkaç SaveChanges kullanan revision/lifecycle işlemlerinde bütün outbox kayıtları caller transaction'ı commit edene kadar görünmez.

Kullanıcı/eventKey DB unique. Task olayı kendi ID'si, accepted revision kendi ID'si, work/focus/settings/template version'ı ile tekilleşir. FocusTargetReached'ın eventKey'si focus kimliğinde sabittir; version artınca tekrar target olayı çıkmaz. Capture edilmiş eski kaynak durumları işlenirken güncel kaynakla karşılaştırılır; obsolete mesajlar sessiz veri mutation'ı üretmez.

Worker `FOR UPDATE SKIP LOCKED` ile en çok100 (normal pompa20) mesajı kısa SQL işlemiyle sahiplenir. Uygun işler her kullanıcı içinde AvailableAt/Id sırasını korur; batch önce her kullanıcının ilk işini, sonra ikinci işini alır. Böylece bir kullanıcının büyük görev olayı kuyruğu başka kullanıcının hazır işini bütün batch'in dışında bırakmaz. Kilit alınırken uygunluk yeniden kontrol edilir; eşzamanlı worker daha önce sahiplenilmiş işi tekrar alamaz. Lease2dk, claim başına attempts+1. Ack/failure yalnız aynı leaseId ve Processing durumuyla koşullu güncellenir; eski worker yeni sahibin kaydını değiştiremez. Geçici hata üstel beklemeyle yeniden Pending; en çok5 deneme sonunda Failed. Son deneme sırasında süreç ölürse lease bitince Failed'a alınır, Processing'de sonsuza kadar kalmaz.

Her mesaj ayrı DI scope/DbContext kullanır; başarısız transaction'ın tracked entity'leri sonraki mesaja sızmaz. Domain etki receipt'i aynı etki transaction'ında kalır; outbox ack ayrı kısa işlemdir. Etkiden sonra ack öncesi crash tekrarında receipt ikinci domain etkisini önler. Dış provider için distributed exactly-once sözü verilmez;26 kararlı notification kimliği ve source tekrar doğrulaması kullanacak.

Recurrence materialize kendi use-case transaction'ını kullanır. Worker önce template/version/yerel pencereyi Prepared receipt'te dondurur; `job:{outboxId}` key'siyle aynı bounded materialize komutunu çalıştırır, sonra receipt'i tamamlar. Gece yarısı/restart sonrasında pencereyi başka payload'a dönüştürmez. Hazırlanmamış eski günlük sweep penceresi obsolete; otomatik geçmiş gün üretim seli yoktur. Güncel pencere bugün..bugün+7; açık manuel93gün çağrısı ayrı kalır.

## Quartz ve şema

Quartz4.5.0 Apache-2.0, Npgsql10.0.3 kilitlenmiştir.4.x hosted/DI/System.Text.Json desteği core pakettedir; ayrı eski hosting/serializer paketi eklenmedi. Kaynaklar: [Quartz4 job store](https://www.quartz-scheduler.net/documentation/quartz-4.x/tutorial/job-stores.html), [4.5.0 upstream PostgreSQL DDL](https://github.com/quartznet/quartznet/blob/v4.5.0/database/tables/tables_postgres.sql).

Resmî DDL'nin mevcut tabloları silen DO bloğu tamamen kaldırıldı. Yalnız CREATE TABLE/INDEX bölümü `Persistence/Resources/quartz-4.5.0-postgres.sql` olarak pinlenip EF migration'a embedded resource verildi. SHA256 `E52462E87A128B2870179B19C7A82A1609A84A6D36D8E683D3A9EEBAD9239B63`; lisans `third-party/quartz-LICENSE.txt`. API startup schema provision/drop yapmaz; kontrollü migration önce çalışır, Quartz varsayılan schema validation ile açılır. Migration eski current task/plan/aktif target/template durumuna bootstrap outbox koyar; geçmiş domain event'i icat etmez.

Scheduler adı AdhdPlanner, instance ID generated, PostgreSQL ADO store `qrtz_`, clustering açık, concurrency2, string job data/System.Text.Json. Execution history de PostgreSQL'dedir. Sabit job/trigger kimlikleri, IgnoreDuplicates=true/OverwriteExistingData=false; restart stored trigger'ın başlangıcını ve job cursor'ını değiştirmez.

| İş | Periyot | İşlev |
| --- | --- | --- |
| outbox-pump |2sn|20 mesajlık lease/effect/ack; batch dolu döndükçe aynı ateşte en çok10sn boşaltmaya devam eder (birikmiş kuyruk 10 mesaj/sn ile sınırlı kalmaz) |
| reminder-pump |2sn|en çok20 due iş, source guard ve durable notification intent |
| focus-sweep |1sn|50 kayıt/cursor; target veya mola geçişi için mevcut FocusService |
| recurrence-sweep |30sn|50 template/cursor; bugün..+7 için tekil RecurrenceWindow outbox |

Focus/recurrence job cursor'ları Quartz job data'da persist edilir. Bütün job'lar DisallowConcurrentExecution; missed periodic tick'ler replay seli üretmeden sonraki ateşe gider. Quartz takvimi/host canlılığı sayaç otoritesi değildir. Host kapalıyken normal gerçek çalışma sürer; tekrar açıldığında ilk değerlendirme hedefi kaydeder. AutoBreak ilk değerlendirmede actual segmenti kapatır; geçmiş actual hedef anında kesilmiş gibi yeniden yazılmaz.

Normal API'de Jobs:Enabled varsayılan true, ortamdan false yapılabilir. Entegrasyon host'ları varsayılan worker başlatmaz; gerçek scheduler testi açıkça ayrı PostgreSQL fixture ve gerçek clock kullanır. Bu test ayarı gerçek ürün için RAM store alternatifi oluşturmaz.

## Reminder çekirdeği ve geçerlilik

Accepted current revision → gelecekteki açık Work bloklarının ScheduleStart/ScheduleEnd işleri. Görevin (veya kalıtılan) tarih aralığı bitişi → iki TaskDeadline işi (bitişten önceki gün 18:00, bitiş günü 09:00); üst aralık değişince veya görev taşınınca alt ağaç da yeniden hesaplanır. Doğrudan işi olmayan konteyner görevler hatırlatma üretmez. Task/pool/status değişince eski current kaynaklar işlenmez; kapanan işin pending reminder/intent'leri obsolete. Her source yazımı ve receipt aynı user-lock transaction'ında yapılır.

Due gönderim hazırlığında task hâlâ açık mı, blok current/Planned ve aynı version mı, DailyPlan current revision aynı mı tekrar denetlenir. Deadline için ilgili deadline instant'ı ve task açıklığı denetlenir; sırf başlık değişimi aynı deadline'ı ikinci mantıksal bildirime çevirmez. İki dakikadan eski due iş Expired olur. Geçerli due, tek durable NotificationIntent oluşturur; gerçek push26'dadır. Mantıksal intent anahtarı kind/source/due instant; başka blok eklenip revision değişince aynı blok/aynı due için ikinci intent kimliği oluşmaz. Pending intent güncel revision'a bağlanabilir.

FocusTarget işi historical target kaydını, aktif focus'u, corrected effective süreyi ve focus notifications seçimini doğrular. Task complete veya below-target correction sonrası geçersiz alarm üretilmez. Geçerli hedefte tek intent, actual/overtime devam eder. NotificationIntent teslim edilmiş anlamına gelmez.

## Görünürlük ve işletim

- GET /api/jobs/outbox?state=Failed&offset=0&limit=50: yalnız owner, payload/sır yerine kimlik/tür/attempts/durum/LastErrorCode/version.
- POST /api/jobs/outbox/{id}/retry `{version}`: yalnız güncel Failed kaydı Pending yapar; attempts sıfırlanır. Foreign404, stale veya aktif iş409.
- GET /api/jobs/reminders?state=Pending&offset&limit: yalnız owner, bounded reminder durumu ve kaynak referansları.
- Quartz execution history/triggers için veritabanı operasyon sorguları yetkili işletime aittir; kullanıcıya global admin endpoint açılmadı. Beklenmeyen hata log'u messageId/errorCode/attempt içerir; payload veya exception metni yazılmaz.

Şema geri alma kalıcı job/outbox/receipt/intent tablolarını düşürür; production rollback yerine kontrollü ileri migration ve backup/restore süreci29'da değerlendirilir. Bu paket production yayın değildir.


## 25 Ekim okuma performans eki: NotesChanged

Başarılı not oluşturma/düzenleme ve gerçek task dönüşümü mevcut owner transaction'ında `NotesVersion` artırır. Aynı transaction'da `NotesChanged` outbox olayı üretilir; sourceId owner kimliği, sourceVersion monoton NotesVersion, payload yalnız version alanıdır. Not metni taşınmaz. Reddedilen/replay/no-op yazı sürüm artırmaz. Bu olay realtime refetch işaretidir; yeni bir planlama veya bildirim işi yaratmaz. Workspace/day overview metadata'sı ve bağlantı sonrası sürüm karşılaştırması aynı not kaynağını kullanır. SpecialDaysVersion ayrı kaynaktır; mevcut PlanningVersion bütün değişiklikler yerine kullanılmaz.

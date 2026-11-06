# Mimari — MVP-00 sözleşmesi

Durum: tasarım kararı; uygulanan paketler ilerleme dosyasında ayrıca gösterilir. Çalışma kökü API/, UI ayrı kardeş klasördür.

## Katmanlar

`Adhd.Api → Adhd.Application → Adhd.Domain`; `Adhd.Infrastructure → Application/Domain`. Host Infrastructure'ı composition root'ta bağlar. Controller tabanlı HTTP API; ince controller, Application kullanım senaryosu, saf domain hesaplayıcıları. Tek PlannerDbContext ve PostgreSQL. Başlangıçta generic repository, MediatR ve mikroservis yok.

Modüller Auth/Preferences, Tasks/Pools, Planning/Revisions, Work/Focus, Recurrence/Notifications, Analytics. Modüllerin transaction'ı aynı DB'dedir. DI scoped DbContext, singleton TimeProvider.System; testlerde kontrol edilen clock.

## Dört çekirdek yapı

SchedulingEngine stateless saf hesaplamadır. TaskSchedule plan niyetidir. WorkSession/Segment gerçekleşen fiziksel çalışmadır. PlanRevision kabul edilmiş niyet snapshot'ıdır. Engine DB yazmaz; PlanningCoordinator girdiyi toplar ve öneriyi doğrulayarak atomik uygular. WorkCoordinator aynı kullanıcı koordinasyon kilidini kullanır; session ve plan değişiklikleri yarışamaz.

TaskId birçok gün ve block/session boyunca aynıdır. Planlı session başlangıç ScheduleId ve RevisionItemId'yi saklar; schedule taşındığında değişmez. Plansız başlangıçta bu FK'ler null'dır. Gerçek aralık undo ile silinmez.

## ADR kararları

- ADR-001: Modüler monolit ve tek DB; atomik çok günlük işlemi kolaylaştırır.
- ADR-002: Current schedules + immutable full revision items; diff yalnız açıklama içindir. Event-sourcing sistemi kurulmaz.
- ADR-003: Kullanıcı PlanningState satırı `FOR UPDATE`; her planlama girdisi mutation'ı PlanningVersion'ı artırır. Motor hesaplaması kilit dışında, apply tekrar kontrol altında.
- ADR-004: `Version bigint` explicit optimistic concurrency; provider'a özgü görünmez xmin public wire alanı değildir.
- ADR-005: UTC DateTimeOffset(0)/timestamptz; local DateOnly + IANA zone; yarı açık aralıklar.
- ADR-006: Süresiz HS256 JWT; exp/refresh/cookie auth yok. Users + ExternalLogins; PasswordHasher yalnız hash adaptörü. İmza/issuer/audience/sub varlığı doğrulanır.
- ADR-007: Aktif actual yalnız effective work segments'ten. Revision ve focus toplamları ikinci süre kaynağı değildir.
- ADR-008: Her MVP test ve kabul kapısıyla kapanır; sonraki uygulanabilir pakete kullanıcı yeniden onayı gerekmez.
- ADR-009: Küçük tercih/takvim bütünü typed Domain kayıtları + Infrastructure jsonb belge olarak tek sürüm altında saklanır. Kullanıcı planlama kilidi ve version atomik; tek ayar güncellemesinde yarım haftalık takvim oluşmaz.

## İşlem sınırları

Task mutation: kullanıcı kilidi → beklenen entity version → kural → events + entity + PlanningVersion → commit. Work start/pause/finish aynı sırayla segment/session'ı değiştirir. Apply: lock → proposal sürüm/hash/anchor kontrolü → bütün günler current+revision+items+changes+idempotency(+ileride outbox) → commit. DB fail hiçbir yarım etki bırakmaz.

## Harici sınırlar

JWT üretimi ve password hash Infrastructure'da. Google ID proof adapter, SMTP sender ve push sender interface arkasındadır; test double yalnız bu dış sınırda kabul edilir. Application DB/motor yanıtını mocklayarak integration başarısı iddia edilmez. Provider kanıtı eksikse ilgili kabul açık tutulur, bağımsız sonraki MVP sürdürülebilir.

## Çalıştırma

API/src/Adhd.Api, Adhd.Application, Adhd.Domain, Adhd.Infrastructure; tests/Adhd.UnitTests ve Adhd.IntegrationTests. Docker Compose production-benzeri yol; Docker olmayan Windows için yalnız loopback'e bağlı, ignore edilmiş .local PostgreSQL test yolu. Gerçek kullanıcı/production DB üzerinde fixture cleanup yok.

## Başlangıç/baseline

DailyPlan ilk create sırasında revision 1 üretir. Baseline ilk kabul edilmiş boş-olmayan work revision'ıdır; boş plan baseline dondurmaz. Dondurulan baseline değişmez. Günün daha sonra başlaması veya acil iş eklenmesi paydayı değiştirmez. Revision snapshot schemaVersion=1 alanı taşır.

- ADR-010: Yeni child sınıflandırmayı miras alır; move sınıflandırmayı korur; açık subtree replacement kullanıcı planningVersion kontrolüyle atomiktir. Grup workload yalnız üye fiziksel bileşenlerden forest hesaplar. Etiket toplamları global toplama eklenmez.
- ADR-011: Work start güncel görev/ata/grup adları ve zone snapshot'ını saklar. Tarihsel bağlam current entity isimlerinden üretilmez. Aktif süre decimal saniye, server instant ve effective segment kaynaklıdır; pause toplam dışıdır.

- ADR-012: Manual planning full revision writer'ı aktif blokların typed JSON snapshot'ını, delta'ları ve aynı gün current/baseline pointer'larını tek outer transaction'da yazar. Gece bölünmesi ortak ChangeSet'tir; başka güne mevcut kimlikle move20'de genişletilir. Plan/task/work mutation aynı user kilidini kullanır. Başlangıç context FK'leri eski work'ün task/schedule/item eşleşmesini korur.

# MVP-17 — HTTP koordinasyonu uygulama notları

Uygulama: MVP-17. Test ve kabul sonuçları `verification/mvp-17.md` içinde tutulur.

- Server snapshot RepeatableRead ile user PlanningVersion, frozen day zone, prefs/working windows, complete task forest+hard/soft graph, exact decimal actual, current planned rows, outside future allocations ve active session context alır. Engine hesaplaması user row lock dışında yapılır.
- Private immutable input/hash + public proposal/diff proposal tablosuna TTL2dk ile yazılır; preview plan/revision/PlanningVersion değiştirmez. GET owner scoped.
- POST /preview her zaman salt plan önizlemesidir. POST /plan ayardaki Preview/Auto davranışını takip eder; key ile tekrar güvenli. Auto yalnız constraint conflict olmayan öneriyi uygular; unplaced kapasite sonucu görünür kalır.
- POST /apply user lock altında proposal owner/key/payload, planningVersion,TTL, input integrity, active session ve zamansal feasibility kontrol eder. Tick başına stale hash üretmez; yeni Work start geçmişe düşerse yeniden preview gerekir.
- Preview/apply ağ gecikmesi nedeniyle yeni Work için en az30sn ileri yuvarlanmış dakika default notBefore kullanılır; gerçek ServerNow ve actual değişmez. Uygun eski slotlar bu lead nedeniyle taşınmaz. Active mevcut iş ayrıca korunur; eski planlı başlangıç context'i rewrite edilmez.
- Apply changed current+full revision/items/deltas+idempotency+status aynı transaction'dadır. No-op accepted öneri revision üretmez; first baseline politikası14'le aynıdır. Same proposal/key accepted effect'i tekrarlamaz; yeni key ile replay bile key/payload bağını korur.
- Existing schedule IDs korunur; removed soft'tur. Split new work same task/group/origin bağlanır. IsAutomatic TaskSchedules'a AddSchedulingProposals migration'ı ile eklenir; eski bloklar false kalır, manuel edit ownership'i manual'a alır. Eski revision JSON'u değiştirilmez.
- Kabul testleri: no-preview-mutation, stale task/settings/work/manual/version/time/TTL, idempotent/samekey-differentbody/parallel apply, rollback revision-item fail, Auto/Preview, unknown/partial/active/protected, foreign owner, no-op, exact decimal/outside commitment, clean/16 öncesi schema upgrade.

HTTP sözleşmesi:

- `POST /api/scheduling/preview` ve `/plan`: `{date,taskIds,expectedPlanningVersion?,newWorkNotBefore?}`. Date yerel gün, 1..1000 benzersiz kullanıcı görevi; seçilen parent altındaki doğrudan işler motor tarafından açılır. `/plan` ayrıca `Idempotency-Key` ister.
- Yanıt: proposalId/inputVersion/createdAt/expiresAt/anchorAt/planningMode/algorithmVersion/status/canApply/hasConstraintConflicts; blocks,changes,unplaced,warnings,explanations ve uygulanmışsa applied. Changes Added/Updated/Removed ve before/after taşır. Partial kapasite sonuçları uygulanabilir; kısıt çatışmaları uygulanamaz.
- `GET /api/scheduling/proposals/{id}` yalnız sahibine yanıt verir. TTL dolunca Pending görüntüsü Expired olur; kabul geçmişi Applied kalır. CanApply zamanın geçmesi dışındaki güncel değişiklikler için ön kontrol garantisi değildir; apply authoritative doğrulama yapar.
- `POST /api/scheduling/apply {proposalId}` + `Idempotency-Key` → `{proposalId,changeSetId?,planningVersion,revisionIds,noChanges}`. Replay aynı sonucu ve `Idempotent-Replay:true` döndürür; farklı payload 409/idempotency_conflict. No-op'ta changeSet null, revisionIds boş ve sürüm değişmez.
- 400: geçersiz seçim/anahtar; 404: yabancı veya bulunamayan görev/öneri; 409/planning_version_conflict: preview dayanağı eski; 409/proposal_stale: girdi, süre veya yeni başlangıç geçersiz; 409/proposal_constraints: korunan plan çatışması.

Girdi JSONB canonical hash ile korunur; apply motoru aynı immutable girdiden kilit dışında tekrar çalıştırıp public farkla karşılaştırır. Aggregate PlanningVersion görev/ayar/actual/plan mutasyonlarını kapsar; active session ve current plan/block sürümleri ayrıca kontrol edilir. Gerçek çalışma tick'i bu sürümü artırmaz. Aktif plansız işin takvim projeksiyonu başlangıç oturum bağlantısını sonradan doldurmaz.

Bu paket tek gün içindir. Acil çalışmayı başlatma MVP-18, undo MVP-19, çok günlük dağıtım MVP-20; bildirim/outbox ve bağımsız Focus henüz bu akışa dahil değildir. Snapshot geçerli kullanıcı ağacının tamamını alır; büyük veri performans kabulü sonraki ölçüm paketindedir.

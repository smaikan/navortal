# MVP-18 — şimdi başlat ve süre aşımında yeniden planlama

`POST /api/work-sessions/start-now` JWT ve Idempotency-Key gerektirir. Body:

```json
{
  "taskId": "hedef görevin UUID değeri",
  "expectedPlanningVersion": 12,
  "expectedSessionId": "varsa kesilecek aktif oturumun UUID değeri",
  "expectedSessionVersion": 1,
  "remainingTaskIds": []
}
```

Aktif oturum yoksa iki expectedSession alanı da boş/null olmalıdır. Varsa ikisi birlikte güncel olmalıdır. Eski sekme yeni çalışmayı yanlışlıkla kesemez. Gerçek ön koşul ve hedef uygunluğu kesmeden önce kontrol edilir. RemainingTaskIds isteğe bağlı, benzersiz, en çok1000; boşsa günün mevcut gelecek Work görevleri seçilir. Hedef ve kesilen iş daima seçime dahil edilir. Seçilen parent'lar motorun normal doğrudan iş açılımını kullanır.

Başarılı yanıt200: `{work,plan?,planningStatus,planningError?,replayed}`. Work receipt: `{session,pausedSession?,localDate,planningVersion,taskIds,resumed}`. Bu immutable başlangıç makbuzudur; sonraki canlı saniye/durum `/api/work-sessions/current` ve session GET ile alınır. Paused hedef varsa aynı oturum yeni segmentle devam eder; original metadata/schedule/revision context korunur. Yeni oturum plansızdır; sonradan takvime projekte edilmesi original start link'i doldurmaz.

İşlem sınırları:

1. Kullanıcı koordinasyon kilidi altında tek server instant alınır; eski segment kapanır, eski task/session Paused olur, hedef başlar veya devam eder. DB unique/exclusion kısıtları için eski kapanış önce SaveChanges olur; yeni açılış ve receipt aynı outer transaction'dadır. Yeni açılış hatasında eski kapanış da rollback olur. PlanningVersion bir defa artar.
2. Kalan plan bu commit edilmiş gerçeklikten üretilir. Preview tercihi öneri verir; Auto feasible öneriyi MVP-17 atomik apply akışıyla kabul eder. Görmezden gelinen/reddedilen önizleme eski actual'ı geri getirmez veya yeni çalışmayı silmez.

PlanningStatus `Preview`, `Applied`, `NeedsPreview` veya `Unavailable` olur. Başlatma commit edildikten sonra yeni bir mutation öneriyi eskittiyse NeedsPreview+conflict code; plan DB hatasında Unavailable+planning_unavailable gelir. Bu sonuçlar gerçek çalışmanın başladığını açıkça taşır. Aynı key actual'ı tekrar başlatmaz; plan aşaması başarısız kaldıysa, girdiler hâlâ geçerliyken aynı key ile tekrar planlanabilir. Başarılı plan da kendi idempotency kaydını kullanır. Request değişirse key409'dur.

Süre aşımı için mevcut `POST /api/scheduling/plan` tetiklenir: current session/actual verisi yeni snapshot'ta okunur. Tahmini tükenmiş açık iş `NeedsEstimateExtension`/`ActiveEndUnknown`, sabitle taşan projeksiyon `ProtectedConflict` uyarısı verir. Auto bu conflict'i uygulamaz. Actual sayaç kesilmez, task complete yapılmaz, sabit blok taşınmaz. Kalan süre tahmini kullanıcı tarafından artırılabilir; yeni preview güncel gerçeklikten üretilir. Otomatik bildirim/iş zamanlayıcısı tetikleyicileri ilerideki bildirim MVP'sinin kapsamıdır.

09:20 fixture: React actual1200sn, acil09:20–09:50, React09:50–10:30, bölünebilir Backend10:30–11 ve11:30–12; fixed11–11:30. React'in eski09–10 revision item'ı değişmez. Non-split Backend'e iki parça zorlanmaz ve3600sn yerleşmeyen iş görünür.

Kabul kanıtı `verification/mvp-18.md` içinde tutulur. Yeni paket veya migration eklenmedi; mevcut session/segment/event/revision/idempotency tabloları kullanıldı.

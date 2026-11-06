# Eisenhower Matrisi

27 Ekim2026. Kullanıcı mevcut görev seçimi, bölgeler arasında ve bölge içinde kalıcı sürükle-bırak istedi. Matris mevcut task kimliğine owner kapsamında bağlıdır; yeni görev/plan/actual üretmez. Matris sırası görev ağacı SortOrder veya görev önceliği değildir.

`matrix_states` owner sürümünü, `matrix_items` `(UserId,TaskId)` tekil üyeliği, `Quadrant` ve bağımsız `SortOrder` tutar. Composite task FK farklı owner bağını DB'de de reddeder. Transaction içindeki state row lock aynı owner yazılarını seriler; beklenen version farklıysa409. Fractional sıra değerinde aralık tükenirse sadece hedef matris alanı yeniden numaralanır; görev satırları ve tarihçe değişmez.

Alanlar: Inbox ayrılmamış (önem/aciliyet henüz seçilmemiş); Do önemli+acil; Schedule önemli+acil değil; Delegate önemli değil+acil; Eliminate önemli değil+acil değil. Alan seçimi mevcut priority/deadline'dan çıkarılmaz. Eliminate ve üyelikten çıkarma task silme/tamamlama değildir.

- `GET /api/matrix`: `inboxOffset/doOffset/scheduleOffset/delegateOffset/eliminateOffset` bağımsız0..100000; limit1..100, varsayılan25. Tek RepeatableRead snapshot'ta version ve beş alanın sayfası/count döner. Son sayfadan taşan alan offset'i son geçerli sayfaya düzeltilir. Boş okumada state veya plan yaratılmaz.
- `GET /api/matrix/candidates`: search≤200, offset0..100000, limit1..100 (25). Açık owner görevleri/kapsayıcıları ve alt görev ana başlıklarını arar; matriste olanları, terminal/archived/deleted görevleri çıkarır. Doğrudan tahmin null ise bilinmiyor; frontend toplam üretmez.
- `POST /api/matrix/items/{taskId}`: body version≥0, quadrant, optional beforeTaskId. Üyelik zaten varsa409 matrix_task_exists.
- `PUT /api/matrix/items/{taskId}`: aynı body; üyelik gerekir. beforeTaskId aynı hedef alandaki owner aktif üyesi olmalı; onun önüne taşır, null gerçek sona ekler. Kendi önüne taşıma400. Yabancı/kaybolmuş görev veya hedef404.
- `DELETE /api/matrix/items/{taskId}?version=...`: yalnız üyeliği kaldırır. Görev ve geçmiş korunur.

Bütün yazılar200 `{version,taskId}` döndürür. Key tanımlı değildir; belirsiz yazı otomatik tekrarlanmaz. Güncel GET ve yeni kullanıcı niyeti gerekir. Cookie/CSRF/me ve private/no-store standart middleware kuralları geçerlidir. Snapshot ve candidates sayfalıdır, bütün görevler tarayıcıya yüklenmez.

Her başarılı yazı version'ı bir artırır, MatrixChanged outbox olayı yayınlar. TaskChanged matris kartlarını da geçersiz kılar. Terminal/archived/deleted üyelik saklanır, aktif tahtada görünmez; tekrar açılan görev önceki alanına döner. Matris yazısı task/planning sürümünü, task eventlerini, work/focus durumunu değiştirmez.

Wire şekilleri ve politikalar: [modül](frontend-api/matrix.md), [OpenAPI](openapi-v1.json), [işlem politikaları](operation-policies.json). Gerçek PostgreSQL ve UI kanıtı [tek teslim raporunda](verification/matrix.md).

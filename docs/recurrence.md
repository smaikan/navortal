# Tekrarlayan görevler — MVP-24 tasarım ve uygulama sözleşmesi

Uygulama sözleşmesi aşağıdadır; kabul kanıtı `verification/mvp-24.md` içinde kapanır. Quartz worker25, reminder26 kapsamındadır.

Tekrar şablonu gerçek Task değildir. Şablon immutable tanım sürümleri taşır; seçilmiş1..93 günlük penceredeki uygun yerel tarihler gerçek Task instance'larına materialize edilir. Aynı kullanıcı/şablon/yerel occurrence tarihi DB'de benzersizdir. Tekrar job'ı veya iki istemci aynı tarihi ikinci task'a çeviremez. Instance TaskId normal task/work/plan akışlarında kullanılır; takvim düzenlemesi ikinci bir task kopyası üretmez.

## Kural ve zaman politikaları

- Daily: başlangıç yerel tarihinden her gün. IntervalDays: başlangıçtan itibaren herN gün (1..366).
- Weekly: başlangıç tarihinin Pazartesi başlayan haftasını anchor alır; seçili0=Pazar..6=Cumartesi günlerinde herN hafta (1..52). StartDate öncesi tarih üretilmez.
- Monthly: başlangıç ayını anchor alır; herN ay (1..24), belirli1..31 ay günü. Ayda o gün yoksa **açık MonthEndPolicy**: Skip veya ClampToLastDay. Kuralın tarihi instance anahtarıdır;31Ocak →28Şubat clamp ve31Mart birer örnektir.
- StartDate dahil, UntilDate varsa dahil; geçerli yıllar2..9998. Pencere en çok93 gün, sonuç en çok93 occurrence/task; sonsuz gelecek üretimi yok.
- IANA zone her tanım sürümünde saklanır. DueTime verilirse occurrence'ın yerel deadline saatidir; otomatik takvim bloğu veya gerçekleşen çalışma değildir. Verilmezse Task.DeadlineAt null; occurrence yerel tarihi yine korunur.
- Yerel deadline DST boşluğuna düşerse GapPolicy: Reject, Skip veya ShiftForward (ilk geçerli dakika). İki kez oluşursa OverlapPolicy: Reject, Earlier veya Later. Varsayılan Reject; belirsiz/olmayan saati gizlice seçme. DueTime dakika hassasiyetindedir. Gerçek instant UTC; dueAt ile orijinal yerel tarih/saat/zone ayrı tutulur.

## Seri ve tek örnek düzenleme

Şablon create tanım v1'i StartDate'den geçerli kılar. “Bu ve gelecek” yeni immutable tanım sürümü ve EffectiveFrom tarihi oluşturur; bir occurrence tarihinde geçerli en yüksek sürüm seçilir. Daha eski future tanımlar daha yeni sürümün geçerliliğinden sonra yeniden ortaya çıkmaz. Template version concurrency ile korunur. Geçmiş/completed instance metadata ve task geçmişi değiştirilmez.

Mevcut materialize edilmemiş tarihler yeni tanımla üretilir. Açıkça refreshExisting seçildiğinde `effectiveFrom..refreshThrough` aralığındaki (en çok93 gün) **henüz kullanıcı tarafından değiştirilmemiş, başlamamış, planlanmamış ve alt göreve ayrılmamış Pending** task'lar aynı TaskId ile güncellenebilir. RefreshThrough bu seçimde zorunludur; daha ileride önceden üretilmiş işler örtülü değiştirilmez. Task.Version materialization'daki SyncedTaskVersion ile eşleşmelidir. Kullanıcı düzenlemesi, çalışma, plan veya çocuk varsa protected olarak bildirilir; sessiz overwrite yoktur. Yeni kurala artık uymayan untouched future instance Skip ile kapanabilir; kayıt/occurrence anahtarı silinmez. Geçmiş tarihler refresh edilmez. Tarih ve zone eski instance'ın kimliğini yeniden yazmaz.

Tek task instance düzenlemesi normal task CRUD/work-definition/classification uçlarını kullanır; Task.Version farkı seri refresh'te override korumasıdır. Diğer occurrence veya şablon değişmez. Skip/cancel yalnız seçilen yerel occurrence'ı etkiler. Materialize edilmemiş tarih için kalıcı skip/cancel marker'ı oluşturulur; mevcut task için normal lifecycle, actual/work/future revision koruması aynı transaction'da kullanılır. Aynı pencerenin tekrarında marker tekrar görev üretmez. Completed/geçmiş instance'ı skip ile bozma.

Şablonu pasifleştirmek yalnız yeni üretimi durdurur; var olan task/work/planları silmez. Toplu geçmiş silme veya sınırsız gelecek cancel komutu yoktur. Tek/gelecek düzenlemeler owner lock, version ve idempotency kurallarıyla yapılır. Materialize işlemi gerçek HTTP talebi üzerinde çalışır; arka plan worker varmış gibi raporlanmaz.

Bu sürümde şablon başlık/açıklama/öncelik/bölünebilirlik/doğrudan tahmin ve isteğe bağlı havuz varsayılanı taşır. Oluşan Task standart hiyerarşide bağımsız doğrudan iş olarak başlar; kullanıcı sonradan çocuklara ayırabilir. Otomatik bütün alt ağaç klonlama/dependency kopyalama uygulanmış gibi gösterilmez.

## HTTP ve kalıcı model

| Uç | İstek / sonuç |
| --- | --- |
| POST /api/recurrence-templates | `{rule,task}` + key →201 RecurrenceEffect; yalnız şablon/tanım oluşturur |
| GET /api/recurrence-templates | offset0..100000,limit1..100; owner listesi, son tanımın effectiveFrom bilgisi |
| GET /api/recurrence-templates/{id} | version/enabled, head tanımın ID/number/rule/task alanları |
| GET /{id}/definitions | aynı bounded sayfalama; immutable tanım sürümleri |
| PUT /{id} | `{version,effectiveFrom,rule,task,refreshExisting=false,refreshThrough?}` + key |
| PUT /{id}/enabled | `{version,enabled}` + key; mevcut task'ları silmez |
| POST /{id}/materialize | `{version,fromDate,toDate}` + key;93 günlük açık pencere |
| GET /{id}/occurrences | fromDate/toDate zorunlu, aynı pencere/pagination sınırları |
| POST /{id}/occurrences/{date}/skip veya /cancel | `{version,taskVersion?}` + key; materialized task varsa beklenen taskVersion zorunlu |
| GET /api/tasks/{id}/recurrence | owner task'ın tek occurrence bağlantısı |

`/{id}` ile başlayan kısa uçlar `/api/recurrence-templates` kökünü kullanır. Bütün uçlar JWT ister; key1..128 karakter, kapsam+payload bağlanır. Key replay ilk receipt'e döner; değişmiş şablon sürümüyle farklı yeni komut409/version_conflict. Aynı pencereyi farklı key ile çalıştırmak mevcut occurrence ID/TaskId'lerini döndürür, task/planningVersion çoğalmaz. Pasif şablon yeni üretimde409/recurrence_disabled.

Rule: startDate, timeZoneId, frequency(Daily/IntervalDays/Weekly/Monthly), interval, weekDays[], monthDay?, monthEnd?, untilDate?, dueTime?, gap(Reject/Skip/ShiftForward), overlap(Reject/Earlier/Later). Task: title,description?,estimatedSeconds?,priority,canSplit,poolId?,energyDemand?. Enum'lar metin; date/time yerel tiplerdir. Ay günü29..31 için monthEnd zorunludur. Kullanıcıya ait aktif havuz gereklidir; arşivlenen havuz sessizce değiştirilmez.

Effect; template, pencere içindeki occurrences, refreshedTaskIds, protectedTaskIds, planningVersion ve replayed taşır. Template version, planlama sürümünden bağımsızdır. Yalnız yeni/güncellenen materialized Task'lar planningVersion'ı artırır; bir batch'te bir defa. Şablon/skip-marker değişikliği tek başına mevcut planın görev girdilerini değiştirmez. Bütün task/event/occurrence/revision ve receipt aynı user-lock transaction'ındadır.

Occurrence originalDefinitionId, originalTimeZoneId, originalDueTime/originalDueAt ve localDate'i ilk üretim bağlamı olarak tutar. AppliedDefinitionId ve SyncedTaskVersion, kontrollü future refresh'in son kaynağını gösterir. Örneğin ambiguous Earlier'dan Later'a gelecek deadline yenilenirken özgün instant kalır; Task.DeadlineAt günceldir, TaskEvent before/after farkı saklar. `taskChangedSinceSync`, task sürümünün şablonun son senkronundan farklı olduğunu söyler; yalnız kullanıcı edit'i iddiası değildir (work/state değişimi de version artırır).

DB kullanıcı/şablon/yerel tarih unique; kullanıcı/task unique; owner ve aynı template definition FK'leri kullanır. Tanım UPDATE/DELETE'i ve occurrence'ın özgün kimlik/tarih/zone/deadline/task bağı UPDATE'i trigger ile reddedilir. Source record hard delete endpoint'i yoktur. Mevcut task'a ordinary reopen uygulanırsa effective occurrence state task'ın güncel durumunu gösterir; eski marker/olay ve aynı TaskId korunur, yeniden generation ikinci task üretmez.

Materialize edilen geçmiş occurrence bugünkü kayıt anıyla oluşturulur; geçmişte completed veya çalışılmış gibi event yazılmaz. DST Reject pencerenin tamamını400/recurrence_local_time_invalid ile geri alır. Gap Skip kalıcı DstGap marker oluşturur; ShiftForward özgün localDate/DueTime'ı koruyup çözülen UTC'yi saklar. Kullanıcı explicit skip/cancel isterse belirsiz deadline çözmek gerekmez; marker üretimi saati tahmin etmez.

Worker/restart/misfire entegrasyonu25'te bu aynı bounded materialize use-case'ini kullanacaktır. Bu pakette zamanında çalışan background job iddiası yoktur.

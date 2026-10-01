# Tekrar ve delivery davranışı

## Tekrar

Günlük, haftalık, seçili hafta günleri, aylık ve özel aralık. Kullanıcı timezone'unda yerel oluşum kimliğini sabitle; şablon kimliği + occurrence anahtarı benzersiz olsun. Kesin ay-sonu/DST politikalarını model sözleşmesinde açıklaştır; sessiz rastgele tarih üretme.

Talep edilen takvim/plan penceresine göre materialize et; sonsuz geleceği peşinen üretme. Tek örnek, bu ve gelecek seri düzenlemesi ve atlanan örnek ayrı davranışlardır. Geçmiş completed instance snapshot'ını değiştirme. İşin tekrar çalışması aynı occurrence'a dönmeli.

## Outbox ve scheduler

Domain transaction'ı bildirilecek niyeti kalıcı outbox'a yazar. Dispatcher claim/lease ile sahiplenir; teslim durumunu ve bounded backoff'u kaydeder. Crash teslimden sonra ama ack'ten önce olabilir; alıcı tag/id ile mantıksal duplicate'i azalt. Outbox için dış provider ile dağıtık exactly-once iddiası kurma.

Revision/schedule/setting değişince eski job'ı geçersizleştir; worker gönderim anında tekrar doğrulasın. Kullanıcı timezone ve DND sınırlarını değerlendir. Tarihi geçmiş hatırlatmaları restart sonrası arka arkaya rahatsız edici bildirim seline dönüştürme; uygulanacak misfire davranışını bildirimin türüne göre açıklaştır.

## Türler ve kanallar

Görev başlangıcı, bitiş yaklaşması, Pomodoro çalışma hedefi, mola sonu, deadline, göreve dönüş ve özel reminder. Ön süre/snooze/ses/tür tercihi kullanıcıya aittir. İzin isteği bildirim özelliği açılırken frontend tarafından yapılır.

Uygulama açıkken arayüz/ses ve tarayıcı bildirimi; desteklenen kapalı ortamda Web Push. OS/browser engelinde teslim garanti değildir. Bildirim güvenli task/focus deep link'i taşır; kullanıcı metnini secret veya push endpoint'i ile loglama.

Pomodoro ContinueTracking hedefe ulaştı bildirimi üretir ama session'ı kapatmaz. SignalR mesajı eksik olsa bile HTTP authoritative state ile istemci toparlanır.

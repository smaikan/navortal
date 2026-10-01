---
name: adhd-work-sessions-focus
description: ADHD planlayıcısının WorkSessions, aktif segmentler, manuel süre düzeltmeleri ve FocusSessions/Pomodoro akışını geliştir veya incele. Gerçek süre, pause/resume, tek aktif çalışma, hedef sonrası taşma ve mola ayrımı gereken işlerde kullan.
---

# ADHD gerçek çalışma ve odak

Oturum ve zaman hesabı değişirken [zaman ve düzeltme referansını](references/time-and-corrections.md) oku. Varsa aktif MVP, domain sözleşmesi, oturum endpointleri ve DB constraint'lerini birlikte incele.

## İş kuralları

- Aktif süreyi kesintisiz WorkSessionSegments aralıklarından üret; pause ve break sürelerini toplama.
- Kullanıcı başına tek açık çalışma aralığı bulunur; yalnız frontend kontrolüne güvenme.
- Başlat/duraklat/devam/bitir komutlarında server time kullan. Tarayıcı setInterval'ı kayıt kaynağı değildir.
- Oturum plansız başlayabilir. Planlı başlatmanın blok ve revision-item bağlamını sakla.
- Normal sayaç tarayıcı kapansa veya bağlantı gitse de kullanıcı durdurana kadar devam eder.
- Oturum bitmesi görev tamamlanması değildir; görevi tamamlamak açık oturumu kapatır.
- Manuel ekleme/düzeltmede özgün değer, yeni değer, zaman ve nedeni koru. Çakışan etkili çalışma aralıklarını reddet.
- Pomodoro hedefi dolunca görev tamamlanmaz. Kullanıcının seçtiği varsayılanda çalışma ve taşan süre devam eder.
- Mola gerçek çalışmayı kapatır. Otomatik geçiş ayarları hedef sonunda devam tercihiyle çelişmemelidir.
- FocusSession ve WorkSession sürelerini analitikte ayrı kaynaklar gibi toplayıp çift sayma.

## Doğrulama

Sahte saatle pause/resume, yenileme, kapanma, hedef dolması ve taşma; PostgreSQL ile çift başlatma/başka oturumu resume etme yarışları; manuel çakışma ve correction audit testleri uygula. Timer bildirimi ile zaman hesabının doğruluğunu ayrı değerlendir.

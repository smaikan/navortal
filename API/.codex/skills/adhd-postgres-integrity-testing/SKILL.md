---
name: adhd-postgres-integrity-testing
description: ADHD backendinde EF Core/PostgreSQL şema, migration, transaction, concurrency, kullanıcı izolasyonu ve gerçek DB integration testlerini geliştir veya incele. Planlayıcı domain kuralını yeniden tanımlamadan kalıcılık doğruluğunu ve sorgu performansını doğrula.
---

# ADHD PostgreSQL bütünlüğü ve integration testleri

Şema veya kalıcı işlem değişirken [migration ve test matrisi](references/test-and-migration-matrix.md) referansını oku. Mevcut migrations, DbContext, constraint, test fixture ve aktif MVP'yi incele.

## Kalıcılık

- DB'ye uygun FK, check, unique ve gerekli indeksleri kullan; uygulama validator'ı tek savunma olmasın.
- UserId ve ilişkili kaynakların aynı kullanıcıya ait olmasını koru. Global query filter tek başına her write/FK senaryosunu çözmez.
- Açık çalışma ve recurrence instance benzersizliğini DB seviyesinde de koru.
- Manuel kabul edilmiş plan çakışmaları mümkün olduğundan bütün TaskSchedules'a koşulsuz overlap yasağı koyma. Gerçek çalışma çakışması farklı invariant'tır.
- Geçmiş oturum, revizyon ve snapshot referanslarını cascade delete ile silme.
- Kritik transaction ve optimistic concurrency'nin kullanıcı başına koordinasyonla etkileşimini test et.
- UTC timestamp ve [start,end) semantiğini PostgreSQL/Npgsql mapping'inde doğrula.

## Test ve ölçüm

- İlişkisel davranış için gerçek PostgreSQL kullan. EF InMemory veya SQLite başarısını PostgreSQL constraint/transaction kanıtı sayma.
- HTTP integration için gerçek JWT Bearer middleware'ini kullan; eksik exp kabulünü ve imza/issuer/audience reddini gerçek imzalı test token'larıyla doğrula. Yalnız saf servisi test edip endpoint geçti deme.
- Test fixture'larını izole et; secret/access token loglama; gerçek eşzamanlı komutlarla yarışları üret.
- Şema değişince temiz migration ve önceki şemadan upgrade yolunu doğrula. Mevcut verilere etkisini incele.
- Tarih aralığı, pagination, toplu alt ağaç sorgusu ve indeks planlarını ölç; cache ile stale veri üretme.
- Kaynak olmadığı için çalışmayan testi skipped/not verified olarak raporla; fake başarı üretme.

Genel framework test talimatlarını yeniden kopyalama. İlgili domain becerisi beklenen davranışın, bu beceri DB/HTTP doğrulama yönteminin sahibidir.

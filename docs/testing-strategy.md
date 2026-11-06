# Test stratejisi

Kullanıcı her MVP'de test yazma/çalıştırma ve kabul kapısı sonrası onaysız devam yetkisi verdi. Testler sona bırakılmaz. MVP-00 saf tasarım olduğundan engine kodunu önceden varmış gibi test etmez; dört senaryo veri/işlem/state yürütmesi scheduling-engine.md'de incelenir.

Unit: domain quantity/graph/state ve deterministik clock; Integration: WebApplicationFactory gerçek middleware + gerçek PostgreSQL; schema temiz migrate ve önceki sürümden upgrade. DB için Docker veya izole loopback native PostgreSQL; InMemory/SQLite provider başarısı PG constraint kanıtı değildir. Dış Google/SMTP adapter double'ları gerçek provider smoke yerine geçmez.

HTTP fixture her test sınıfında benzersiz adhd_test_ database oluşturur; cleanup yalnız bu önekte ve fixture'ın oluşturduğu isimde yapılır. Ayrı connection/scope; race senaryosunda bariyer, keyifî sleep değil. T01–T20 eşleştirmesi scheduling-engine.md'de ve takip dosyasında. TestResults TRX dosyaları geçici artifacts altında; kalıcı kabul kanıtı docs/verification içinde secretsiz özet.

Süre ve auth için TimeProvider injectable; gerçek JWT middleware test edilir. Hiç exp olmaması + ileri saatte doğrulama, signature/issuer/audience reddi bağımsız senaryolardır. Session races, full revision rollback, multi-day failure ve correction audit gerçek DB'de test edilir.

Kapanış: ilgili testler + build + migration kabulü + sözleşme güncellemesi; ardından Uygulama Adımları.md kutularını kanıtla işaretle ve sıradaki uygulanabilir MVP'yi aç. Ortam/provider engelini kaydet; ilgili kapanış açık kalırken bağımsız paketlere ilerlenebilir. Frontend aşamasında Playwright/a11y, backend HTTP kanıtıyla karıştırılmaz.

MVP29 bütünleşik T01–T20/J/A–L backend eşleştirmesi [kapanış kanıtında](verification/mvp-29.md). `BackendJourneyTests`, `BackendReleaseTests`, `ApiContractTests`, `ReverseProxyTests` bağımsız özellikleri gerçek HTTP yolculuklarında birleştirir. Native tam PG regresyonu Docker build/restore yoğunluğundan ayrı çalıştırılır; ortam timeout'u başarılı sayılmaz. `scripts/container-smoke.py` gerçek Linux/Kestrel/TLS/Nginx/PG/Quartz, restart ve ayrı DB restore kapısıdır; sıradan TestServer testleri yerine geçmez. Özellikle WebSocket upgrade feature'ının auth öncesi hazır olması gerçek proxy testiyle yakalanmıştır.

`Adhd.ApiDocs` gerçek public ApiExplorer/OpenAPI export'u; test-only probe controller'ları içermez. `generate-frontend-docs.py` redakte edilmiş sentetik HTTP örneklerini eşleştirir; GUID/date route constraint'leri statik routes ile yanlış eşleştirmeyi önler. `validate-frontend-docs.py` her public işlem/DTO, request/response şekli, yetki/parametreler, JSON, local link ve JWT/private-key sızıntısını kontrol eder. Google'ın iki kapalı işlemi dışında157somut işlemin155'inde gerçek başarılı HTTP örneği vardır. Ham transcript yalnız ignored `.local` içindedir.

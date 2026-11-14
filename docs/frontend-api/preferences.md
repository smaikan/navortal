# Tercihler ve çalışma saatleri

Tercihler version0 varsayılan belgeyle başlar; PUT beklenen version ile bütün values belgesini yazar. Europe/Istanbul başlangıç zone’u, haftanın başlangıcı0Pazar..6Cumartesi. Weekly ve Exceptions dakika0..1440 aralıklarıdır; aynı gün overlap reddedilir, istisna haftalık pencerenin yerini alır. Haftalık saatler boşsa yerel günün tamamı (00:00–24:00) kullanılabilir kabul edilir. Tanımlı haftalık programın boş günleri, boş tarih istisnaları ve çalışma dışı özel günler kapalı kalır. Varsayılan gün uzunluğu saat dilimine ve yaz/kış saati geçişlerine göre hesaplanır. Preview/Auto, minimum parça, tampon ve SupportEnabled burada; focus/bildirim tercihleri kendi modüllerindedir. Working-hours çıktısındaki UTC aralıklarını otorite alın. Çalışma takvimi dönüşümü DST gap’te ilk geçerli dakikayı, tekrarlanan sınırda erken instant’ı kullanır; manuel blokta açık UTC/offset instant gönderilir.

[Ana rehber](../Frontend%20API%20Rehberi.md) · [DTO sözlüğü](DTO-Sozlugu.md) · [Hata kodları](Hata-Kodlari.md) · [Koşullar ve state akışları](Entegrasyon-Kurallari.md) · [Plan mesajları](Plan-Mesajlari.md) · [İşlem bazlı tekrar politikası](Islem-Politikalari.md)

## GET /api/preferences

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/preferences
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [PreferencesSnapshot](DTO-Sozlugu.md#preferencessnapshot).

```json
{
  "version": 1,
  "values": {
    "timeZoneId": "Europe/Istanbul",
    "language": "tr",
    "timeFormat": "24h",
    "weekStartsOn": 1,
    "planningMode": "Preview",
    "parentCompletionPolicy": "örnek",
    "minimumSplitSeconds": 1,
    "transitionSeconds": 1,
    "supportEnabled": false,
    "weekly": [],
    "exceptions": [],
    "uiSupports": {
      "calmView": false,
      "dayBar": true,
      "calibrationHints": true,
      "nudges": true,
      "resumeCard": true,
      "openTodayAsOneThing": false
    }
  }
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## PUT /api/preferences

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Beklenen sürümleri en son HTTP yanıtından alın; veri ve plan ilişkilerini istemcide ikinci otorite olarak hesaplamayın. Hata yanıtında code/traceId kullanın.

**Tekrar gönderim:** Idempotency-Key tanımlı değil. Yazımda otomatik retry yok; timeout sonucu belirsizse güncel kaynakları okuyun. Header eklemek duplicate koruması sağlamaz.

**Ek entegrasyon kuralı:** Bütün values belgesini gönderin. MinimumSplit1..86400/Transition0..86400; Weekly<=70/Exceptions<=366, her istisnada<=24aralık. Empty exceptions.intervals o gün çalışılmayacağını belirtir.

| Request alanı | C# tip karşılığı | Ek annotation |
| --- | --- | --- |
| `version` | Int64 | range:0..9.223372036854776E+18 |
| `values` | PlanningPreferences | required |

**Request şeması:** [UpdatePreferencesRequest](DTO-Sozlugu.md#updatepreferencesrequest).

**Örnek request body:**

```json
{
  "version": 1,
  "values": {
    "timeZoneId": "Europe/Istanbul",
    "language": "tr",
    "timeFormat": "24h",
    "weekStartsOn": 1,
    "planningMode": "Preview",
    "parentCompletionPolicy": "örnek",
    "minimumSplitSeconds": 1,
    "transitionSeconds": 1,
    "supportEnabled": false,
    "weekly": [],
    "exceptions": [],
    "uiSupports": {
      "calmView": false,
      "dayBar": true,
      "calibrationHints": true,
      "nudges": true,
      "resumeCard": true,
      "openTodayAsOneThing": false
    }
  }
}
```

**Örnek HTTP:**

```http
PUT /api/preferences
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
Content-Type: application/json
```

**Başarılı response:** HTTP 200.
Şema: [PreferencesSnapshot](DTO-Sozlugu.md#preferencessnapshot).

```json
{
  "version": 1,
  "values": {
    "timeZoneId": "Europe/Istanbul",
    "language": "tr",
    "timeFormat": "24h",
    "weekStartsOn": 1,
    "planningMode": "Preview",
    "parentCompletionPolicy": "örnek",
    "minimumSplitSeconds": 1,
    "transitionSeconds": 1,
    "supportEnabled": false,
    "weekly": [],
    "exceptions": [],
    "uiSupports": {
      "calmView": false,
      "dayBar": true,
      "calibrationHints": true,
      "nudges": true,
      "resumeCard": true,
      "openTodayAsOneThing": false
    }
  }
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

## GET /api/preferences/working-hours

**Yetki:** JWT Bearer zorunlu; owner doğrulanmış sub.

**Amaç/koşul:** Owner kapsamı JWT sub’tan gelir. Sayfalı yanıtta Total bütün sorgudur, Items yalnız bu sayfadır. Kaynağın null/boş durumunu DTO ve modül sözleşmesine göre gösterin.

**Tekrar gönderim:** Okuma çağrısı; sınırlı ağ retry yapılabilir. Focus current/detail hedef/mola değerlendirmesi yapabilir; no-store kullanın.

| Parametre | Yer | Zorunlu | Tip / sınır |
| --- | --- | --- | --- |
| `date` | query | evet | string (date); — |

**Request body:** yok.

**Örnek HTTP:**

```http
GET /api/preferences/working-hours?date=2026-10-16
Accept: application/json
Authorization: Bearer <APPLICATION_JWT>
```

**Başarılı response:** HTTP 200.
Şema: [WorkingDay](DTO-Sozlugu.md#workingday).

```json
{
  "date": "2026-10-16",
  "timeZoneId": "Europe/Istanbul",
  "localIntervals": [],
  "utcIntervals": []
}
```

Örnek kaynağı: Şemadan üretilmiş yapısal örnek; bu endpoint için kayıtlı başarılı HTTP örneği bulunmadı. ID/sürüm/koşulları modül akışından tamamlayın.

**Hata yanıtları:** 400 (Alan/domain doğrulama hatası; code/traceId, alan hatalarında errors.), 401 (JWT veya giriş bilgisi gerekli/geçersiz.), 404 (Kaynak yok veya bu kullanıcıya ait değil.), 409 (Sürüm/idempotency/domain çatışması; güncel durumu okuyun.), 503 (Gerekli sağlayıcı/özellik kullanılamıyor.), 500 (Beklenmeyen hata; traceId ile takip edilir.).

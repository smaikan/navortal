# Navortal arama görünümü

10 Kasım 2026.

## Arama motoruna sunulan bilgiler

- Site adı: **Navortal**. WebSite alternatif adı yalnız **Navortal Planlayıcı**; alan adı marka adı alternatifi olarak önerilmez.
- Ana sayfa başlığı: **Navortal | Görev Yönetimi, Gün Planlama ve Pomodoro** (51 karakter).
- Açıklama (150 karakter): **Görevlerini, projelerini ve günlük planını Navortal ile düzenle. Pomodoro sayacı, rutinler, notlar ve çalışma analiziyle zamanını daha bilinçli yönet.**
- Aynı açıklama ana sayfa meta, Open Graph, Twitter ve WebApplication verisinde kullanılır. Uygulama adı metadata alanı Navortal'dır; WebSite ve Organization kimlikleri birbirine bağlanır.
- Mevcut marka logosu korunur. Sabit `/icon-192.png` adresindeki 192×192 PNG açık favicon olarak tanımlanır; SVG, ICO ve Apple simgeleri çalışmaya devam eder.
- Favicon, site simgeleri, robots ve sitemap gibi sınırlı bir public dosya listesine sayfalara ait `X-Robots-Tag: noindex` başlığı gönderilmez. Özel, giriş ve bilinmeyen sayfaların noindex sınırı korunur. Bu dosyalar sitemap'e sayfa olarak eklenmez.

Genel arayüz, sayfa yerleşimi ve görünen ana sayfa tasarımı değiştirilmedi.

## Google'da güncellenmesi

Google başlık, açıklama, site adı ve faviconu kendi taramasıyla seçer; site kodunun güncellenmesi arama sonucunu anında değiştirmez. Search Console'da `https://www.navortal.com.tr/` için **URL Denetimi → Canlı URL'yi test et → Dizine eklenmesini iste** kullanılabilir. Sitemap adresi `https://www.navortal.com.tr/sitemap.xml` olarak kalır. Tekrar tarama günlerden haftalara uzayabilir; belirli metin veya faviconun gösterilmesi garanti edilemez.

Kaynaklar: [favicon](https://developers.google.com/search/docs/appearance/favicon-in-search), [site adı](https://developers.google.com/search/docs/appearance/site-names), [açıklama](https://developers.google.com/search/docs/appearance/snippet), [yeniden tarama](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl).

## Kontroller

- SEO ve yasal sayfa sınırlarında 65 birim testi başarılı.
- Değişen dosyaların ESLint ve biçim kontrolü başarılı.
- Üretim Docker derlemesi ve TypeScript kontrolü başarılı.
- SEO'ya özel masaüstü/mobil tarayıcı kontrolleri: 4 başarılı (marka/başlık/açıklama, favicon yanıtları, www yönlendirmesi).
- Geniş ana sayfa erişilebilirlik kontrolünde 2 test footer'ın dekoratif pseudo-elementi için `expectDecorOnly` kontrolünde duruyor. Aynı durum değişiklikten önceki canlı imajda da tekrarlandı. Axe otomatik ihlal listesi boş; belirsiz kontrast kontrolü bu SEO değişikliğinin dışında kaldı. Bu testin beklentisi veya arayüz tasarımı gevşetilmedi/değiştirilmedi.

## Yayın

Yalnız UI imajı güncellendi; API ve veritabanına yeni değişiklik uygulanmadı. Önceki UI imajı geri dönüş için korundu. Canlıda ana sayfa başlığı, meta açıklaması, WebSite adı ve 192×192 favicon bildirimi doğrulandı. ICO/PNG/SVG, robots ve sitemap HTTP 200 ve noindex başlıksız; login ve özel sayfalarda noindex sürüyor.

Canlı kontrol zamanı: 2026-11-10T13:02:09.555080+00:00.

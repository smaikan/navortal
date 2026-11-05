"use client";
import { useState } from "react";
import Link from "next/link";
import "./styles.css";

const chapters = [
  {
    id: "baslangic",
    title: "İlk planını oluştur",
    path: "/planning",
    action: "Gün planını aç",
    text: "Önce Görevler'de yapmak istediğin işi yaz. Gün Planlama'da bir gün seçip Görev ekle alanından o güne ekle. İstersen saat ver. Çalışmaya hazır olduğunda Başlat'ı ayrıca seç. Görev oluşturmak tek başına takvime zaman ayırmaz.",
  },
  {
    id: "gorevler",
    title: "Görevler ve alt görevler",
    path: "/tasks",
    action: "Görevleri aç",
    text: "Büyük bir işi alt görevlere ayırabilirsin. Ana görev › Alt görev yolu hangi işi seçtiğini gösterir. Görev ayrıntısında tahmin, öncelik, efor ve ilk adımı düzenle. Tahmin boşsa süre bilinmiyordur; sıfır değildir. Plan öğesinin kutusunu işaretlemek yalnız o günlük öğeyi bitirir. Görevi bitirmek için görev menüsünü kullan.",
  },
  {
    id: "gun",
    title: "Başka bir günü planla",
    path: "/calendar",
    action: "Takvimi aç",
    text: "Gün Planlama yalnız bugün için değildir. Başlıktaki oklarla veya tarih alanıyla başka bir güne geç. Takvimde bir günü açıp gün planını düzenleyebilirsin. Saatsiz işler de o günün planındadır. Saat vermek isteğe bağlıdır; otomatik plan önerileri sen uygulamadan kaydedilmez.",
  },
  {
    id: "acil",
    title: "Beklenmeyen bir işi plana al",
    path: "/planning",
    action: "Gün Planlama’yı aç",
    text: "Plan menüsünden Acil işe geç’i aç. Var olan bir işi seç veya yeni başlık yazıp öneri satırına bas. İş, eklediğin saatte başlayan ve bitişi boş bir Acil iş olarak seçili güne eklenir. Saatini satırdan değiştirebilir, bitişini kendin belirleyebilirsin. Acil aralık başka işlerle çakışabilir. Bu işlem çalışma veya odak sayacını başlatmaz, açık çalışmayı durdurmaz. Çalışmaya hazır olunca Başlat’ı ayrıca seç.",
  },
  {
    id: "odak",
    title: "Çalışma ve Pomodoro",
    path: "/focus",
    action: "Odağı aç",
    text: "Başlat gerçek çalışma kaydını açar. Pomodoro, seçtiğin süreye dikkatini vermeni sağlar. Sürenin dolması görevi tamamlamaz; bitirmeye sen karar verirsin. Tarayıcıyı kapatmak çalışmayı bitirmez. Döndüğünde çalışma çubuğundan duraklatabilir veya bitirebilirsin.",
  },
  {
    id: "tekrarlar",
    title: "Tekrarlanan işler",
    path: "/recurrences",
    action: "Rutini aç",
    text: "Her gün, belirli gün aralığında, haftalık veya aylık bir seri tanımlayabilirsin. Her oluşum kendi görevini üretir; geçmiş çalışmaların ayrı kalır. Tahmini süre ve başlangıç saati isteğe bağlıdır. Gün planlarına otomatik ekle seçiliyse bugün ve önümüzdeki 7 gün sunucuda hazırlanır; daha ileri günleri aralık seçerek oluştur. Başlangıç var, tahmin yoksa bitiş boş kalır. Saat çakışmasında iş görünür kalır ve saati düzenlemen istenir. Seri değişiklikleri geçmişi yeniden yazmaz. Ayın 29–31'i gibi her ay bulunmayan bir gün seçersen, o ayı atlama veya ayın son gününü kullanma seçimini yap.",
  },
  {
    id: "notlar",
    title: "Aklındakini not et",
    path: "/notes",
    action: "Notları aç",
    text: "Hızlı alana bir not yazıp kaydet. Tür, tarih veya görev bağı gibi ayrıntılar için Ayrıntılı not ekle'yi kullan. Notlar sayfasında aklına geleni kaydedebilirsin; not almak çalışmayı durdurmaz. İlk adım notu, işe döndüğünde nereden başlayacağını hatırlatır.",
  },
  {
    id: "bildirimler",
    title: "Hatırlatma ve bildirim",
    path: "/reminders",
    action: "Hatırlatmaları aç",
    text: "Kendine bir başlık, tarih ve saatle hatırlatma bırak. İstersen bir göreve bağla. Oluşan bildirimler sağ üstteki zilde görünür. Hatırlatmanın kaydedilmesi, cihazına teslim edildiği anlamına gelmez. Tarayıcı bildirimi için izin, desteklenen cihaz ve güvenli bağlantı gerekir. Tercihler'den sessiz saatleri ve bildirim türlerini seçebilirsin.",
  },
  {
    id: "ertele",
    title: "Görevleri ertele ve günü gözden geçir",
    path: "/planning",
    action: "Gün planını aç",
    text: "Plan menüsündeki Görev Ertele ile bitmemiş görevlerini seç. Her görevin tarihi başlangıçta yarındır; istediğin sonraki günü seçip Ertele’ye bas. Gün sonunu gözden geçir aynı menüde seçili günün çalışma süresini, tamamlanan görevlerini ve plan ayrıntısını gösterir. Sakin görünüm de bu menüdedir; sayıları ve hareketi azaltır.",
  },
  {
    id: "hesap",
    title: "Hesap ve bağlantı",
    path: "/settings",
    action: "Ayarları aç",
    text: "Hesap menüsü kenar çubuğunun altında, telefonda Daha fazla panelindedir. Çıkış yap bu oturumu kapatır; Ayarlar'daki Tüm cihazlardan çık diğer oturumları da kapatır. Bağlantı yokken yazılar kaydedilmiş sayılmaz veya sonra otomatik gönderilmez. Sonucu belirsiz bir işlemde önce güncel kaydı oku. Parolanı unuttuysan giriş ekranındaki parola yenileme bağlantısını kullan.",
  },
];

export function HelpGuide() {
  const [search, setSearch] = useState("");
  const needle = search.trim().toLocaleLowerCase("tr-TR");
  const found = chapters.filter(c => `${c.title} ${c.text}`.toLocaleLowerCase("tr-TR").includes(needle));
  return (
    <div className="help-guide">
      <aside className="help-index">
        <label htmlFor="help-search">Rehberde ara</label>
        <input
          id="help-search"
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Ne yapmak istiyorsun?"
        />
        <nav aria-label="Rehber bölümleri">
          {found.map(c => (
            <a key={c.id} href={`#${c.id}`}>
              {c.title}
            </a>
          ))}
        </nav>
      </aside>
      <div className="help-articles">
        <p className="muted">Bir sonraki adımı bul. İstediğin bölümden başlayabilirsin.</p>
        {!found.length && <p role="status">Bu aramada bir bölüm yok. Daha kısa bir sözcük deneyebilirsin.</p>}
        {found.map(c => (
          <section key={c.id} id={c.id} aria-labelledby={`help-${c.id}`}>
            <h2 id={`help-${c.id}`}>{c.title}</h2>
            <p>{c.text}</p>
            <Link href={c.path} prefetch={false}>
              {c.action}
            </Link>
          </section>
        ))}
      </div>
    </div>
  );
}

import { PreviewIcon } from "./preview-icons";
import { ChevronRight, FileText, Folder, Plus, Search } from "lucide-react";
import { kindIcon } from "../special-days/icons";
import styles from "./landing.module.css";

/* Bunlar uydurma, salt okunur örnekler. Gerçek oranlarla sunucuda çiziliyor, özel API çağrısı yapmıyor. */

type PlanRow = {
  time?: string;
  title: string;
  parent?: string;
  chips?: string[];
  duration: string;
  done?: boolean;
  active?: boolean;
};
const timed: PlanRow[] = [
  { time: "09:00–09:20", title: "Gün için üç iş seç", duration: "20 dk", done: true },
  {
    time: "09:30–10:15",
    title: "Sunumun girişini yaz",
    parent: "Ürün sunumu",
    chips: ["Yüksek", "Efor: Orta"],
    duration: "45 dk",
    active: true,
  },
  { time: "11:00–11:30", title: "Kaynak notlarını düzenle", chips: ["Efor: Düşük"], duration: "30 dk" },
];
const untimed: PlanRow[] = [{ title: "Faturayı öde", duration: "10 dk" }];

function Segment({ items }: { items: string[] }) {
  return (
    <span className={styles.segment}>
      {items.map((item, index) => (
        <span key={item} className={index === 0 ? styles.segmentOn : undefined}>
          {item}
        </span>
      ))}
    </span>
  );
}

function Row({ row }: { row: PlanRow }) {
  return (
    <div
      className={
        styles.planRow + (row.active ? " " + styles.planRowActive : "") + (row.done ? " " + styles.planRowDone : "")
      }
    >
      <span className={styles.check}>{row.done && <PreviewIcon name="check" size={12} />}</span>
      <span className={styles.planBody}>
        <span className={styles.planSummary}>
          <span className={styles.planTitle}>
            {row.title}
            {row.parent && <span className={styles.planParent}> · {row.parent}</span>}
          </span>
          {row.time && <span className={styles.planTime}>{row.time}</span>}
        </span>
        {row.chips && (
          <span className={styles.chips}>
            {row.chips.map(chip => (
              <span key={chip} className={styles.chip}>
                {chip}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className={styles.planDuration}>{row.duration}</span>
      <span className={styles.planPlay + (row.done ? " " + styles.planDisabled : "")}>
        <PreviewIcon name="play" size={16} />
      </span>
      <span className={styles.planMore}>
        <PreviewIcon name="more" size={16} />
      </span>
    </div>
  );
}

export function PlanScene() {
  return (
    <>
      <p className={styles.sceneTitle}>Gün Planlama</p>
      <div className={styles.dayBar}>
        <PreviewIcon name="left" size={16} />
        <strong>3 Kasım Salı</strong>
        <PreviewIcon name="right" size={16} />
        <span className={styles.dayBarEnd}>
          <Segment items={["Liste", "Tek şey"]} />
          <PreviewIcon name="more" size={16} />
        </span>
      </div>
      <p className={styles.capacity}>
        <span>
          Günün kalanı <strong>3 sa 10 dk</strong>
        </span>
        <span>
          Planın kalanı <strong>1 sa 25 dk</strong>
        </span>
      </p>
      <span className={styles.meter}>
        <span />
      </span>
      {timed.map(row => (
        <Row key={row.title} row={row} />
      ))}
      <p className={styles.groupLabel}>Saati belirlenmemiş</p>
      {untimed.map(row => (
        <Row key={row.title} row={row} />
      ))}
      <span className={styles.addRow}>
        <PreviewIcon name="plus" size={16} />
        Görev ekle
      </span>
    </>
  );
}

const weekdays = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const plans: Record<number, string[]> = {
  2: ["Haftayı planla"],
  3: ["Sunumun girişini yaz", "Kaynak notları", "Faturayı öde"],
  4: ["Sınav tekrarı"],
  5: ["Sınav", "Diş hekimi"],
  10: ["Proje teslimi"],
  12: ["Okuma 30 dk"],
  14: ["Market"],
  18: ["Toplantı notları"],
  20: ["Spor"],
  24: ["Kira"],
  27: ["Tatil hazırlığı"],
};
const specialDays: Record<number, { title: string; kind: keyof typeof kindIcon }> = {
  7: { title: "Ece", kind: "Birthday" },
  18: { title: "Mezuniyet", kind: "Anniversary" },
};
function SpecialDayMark({ day }: { day: (typeof specialDays)[number] }) {
  const Icon = kindIcon[day.kind];
  return (
    <span className={styles.daySpecial} data-special-kind={day.kind} title={day.title}>
      <Icon size={12} aria-hidden="true" />
      <span>{day.title}</span>
    </span>
  );
}
// Örnek Kasım 2026 takvimi pazartesi başlıyor. Baştaki 26–31 Ekim ve sondaki 1–6 Aralık da var.
const month = Array.from({ length: 42 }, (_, index) => {
  const out = index < 6 || index > 35;
  const day = index < 6 ? 26 + index : index > 35 ? index - 35 : index - 5;
  const items = out ? [] : (plans[day] ?? []);
  const special = out ? undefined : specialDays[day];
  const room = special ? 1 : 2;
  const shown = items.length > room ? room - 1 : room;
  return { index, day, out, today: !out && day === 3, items, special, shown };
});

export function CalendarScene() {
  return (
    <>
      <p className={styles.sceneTitle}>Takvim</p>
      {/* Gerçek ay ölçüleriyle çizip küçültüyoruz. Yazı, nokta ve hücre oranları korunsun. */}
      <div className={styles.calendarZoom}>
        <div className={styles.calHead}>
          <Segment items={["Ay", "Hafta"]} />
          <span className={styles.calNav}>
            <span className={styles.calIcon}>
              <PreviewIcon name="left" size={16} />
            </span>
            <strong>Kasım 2026</strong>
            <span className={styles.calIcon}>
              <PreviewIcon name="right" size={16} />
            </span>
          </span>
          <span className={styles.calToday}>Bugün</span>
          <span className={styles.calIcon + " " + styles.calExtra}>
            <PreviewIcon name="more" size={16} />
          </span>
        </div>
        <div className={styles.month}>
          {weekdays.map(day => (
            <span key={day} className={styles.weekday}>
              {day}
            </span>
          ))}
          {month.map(cell => (
            <span
              key={cell.index}
              className={
                styles.dayCell + (cell.out ? " " + styles.dayOut : "") + (cell.today ? " " + styles.dayToday : "")
              }
            >
              <span className={styles.dayNumber}>{cell.day}</span>
              {cell.special && <SpecialDayMark day={cell.special} />}
              <span className={styles.dayLines}>
                {cell.items.slice(0, cell.shown).map(item => (
                  <span key={item} className={styles.dayLine}>
                    <i />
                    {item}
                  </span>
                ))}
                {cell.items.length > cell.shown && (
                  <span className={styles.dayMore}>+{cell.items.length - cell.shown} daha</span>
                )}
              </span>
              {cell.items.length > 0 && (
                <span className={styles.dayDots}>
                  {cell.items.slice(0, 3).map(item => (
                    <i key={item} />
                  ))}
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

const categories = [
  { name: "Uyarı", color: "warning", pinInAll: true },
  { name: "Fikirler", color: "blue", pinInAll: false },
  { name: "Okul", color: "teal", pinInAll: false },
  { name: "Ev", color: "purple", pinInAll: false },
] as const;
type PreviewNote = {
  title: string;
  body: string;
  display: "Short" | "Detailed" | "Toggle";
  category?: string;
  meta?: string;
  when: string;
  task?: string;
};
const notes: readonly PreviewNote[] = [
  {
    title: "Teslimden önce",
    body: "Teslimden önce kaynakları kontrol et.",
    display: "Short",
    category: "warning",
    meta: "Uyarı",
    when: "Bugün 09:30",
  },
  {
    title: "Sunum için fikirler",
    body: "Girişte kısa bir soru sor. Örneği tek bir slayta indir.",
    display: "Detailed",
    category: "blue",
    meta: "Fikirler",
    when: "Bugün 09:12",
  },
  {
    title: "Sıkıştığımda",
    body: "İlk cümleyi kötü yazmama izin ver. Sonra düzeltirim.",
    display: "Toggle",
    task: "Sunumun girişini yaz",
    when: "Bugün 09:20",
  },
  {
    title: "Okul haftası",
    body: "Perşembe sınav. Çarşamba akşamı tekrar için yer aç.",
    display: "Detailed",
    category: "teal",
    meta: "Okul",
    when: "Dün",
  },
  { title: "Market", body: "Süt, ekmek, pil.", display: "Short", category: "purple", meta: "Ev", when: "2 gün önce" },
];

/** Gerçek Tümü görünümündeki gibi sabit kategori kendi bölümüyle gelir; alttaki listeye tekrar girmez. */
function PreviewNoteSection({
  label,
  items,
  category,
}: {
  label: string;
  items: readonly (typeof notes)[number][];
  category?: string;
}) {
  return (
    <section className={styles.noteSection} aria-label={label}>
      <h3 className={styles.noteSectionHead}>
        {category && <i data-color={category} />}
        <span>{label}</span>
        <span className={styles.noteSectionCount}>· {items.length}</span>
      </h3>
      <div className={styles.noteGrid}>
        {items.map(note => (
          <span
            key={note.title}
            data-note-display={note.display}
            title={note.title}
            className={styles.note + (note.category === "warning" ? " " + styles.noteWarning : "")}
          >
            {note.display === "Short" ? (
              <span className={styles.noteContent}>
                <span className={styles.noteBody}>{note.body}</span>
                <PreviewIcon name="more" size={16} />
              </span>
            ) : (
              <span className={styles.noteHeading}>
                {note.display === "Detailed" ? (
                  <span className={styles.noteDocument}>
                    <FileText size={16} aria-hidden="true" />
                  </span>
                ) : (
                  <ChevronRight size={16} aria-hidden="true" />
                )}
                <strong>{note.title}</strong>
                {note.display === "Detailed" && <ChevronRight size={16} aria-hidden="true" />}
                <PreviewIcon name="more" size={16} />
              </span>
            )}
            <span className={styles.noteMeta} data-color={note.category ?? "gray"}>
              <span className={styles.noteBadge}>
                <i />
                {note.meta ?? "Kategorisiz"}
              </span>
              {note.task && (
                <span className={styles.noteTask}>
                  <PreviewIcon name="link" size={12} />
                  <span>{note.task}</span>
                </span>
              )}
              <span> · {note.when}</span>
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}

export function NotesScene() {
  const pinned = categories.filter(category => category.pinInAll);
  return (
    <>
      <div className={styles.notesHead}>
        <p className={styles.sceneTitle}>Notlar</p>
        <span className={styles.notesSearch}>
          <PreviewIcon name="search" size={15} />
          Notlarda ara
        </span>
        <span className={styles.notesAdd}>
          <PreviewIcon name="plus" size={15} />
          Not ekle
        </span>
      </div>
      <div className={styles.notesFilters}>
        <span className={styles.filterOn}>Tümü</span>
        <span className={styles.filter}>Görev notları</span>
        {categories.map(category => (
          <span key={category.name} className={styles.filter}>
            <i data-color={category.color} />
            {category.name}
          </span>
        ))}
        <span className={styles.notesView}>
          <Segment items={["Kartlar", "Liste"]} />
        </span>
      </div>
      <div className={styles.noteSections}>
        {pinned.map(category => (
          <PreviewNoteSection
            key={category.name}
            label={category.name}
            category={category.color}
            items={notes.filter(note => note.category === category.color)}
          />
        ))}
        <PreviewNoteSection
          label="Tüm notlar"
          items={notes.filter(note => !pinned.some(category => category.color === note.category))}
        />
      </div>
    </>
  );
}

const weekLetters = ["P", "S", "Ç", "P", "C", "C", "P"];
const routines: { title: string; summary: string; days?: string }[] = [
  { title: "Sabah yürüyüşü", summary: "Her gün · 07:30", days: "1111111" },
  { title: "Haftalık planı gözden geçir", summary: "Pazartesi · 09:00", days: "1000000" },
  { title: "Spor salonu", summary: "Pzt, Çar, Cum · 18:30", days: "1010100" },
  { title: "Kitap oku", summary: "Her gün · 21:00", days: "1111111" },
  { title: "Çamaşırları yıka", summary: "Cumartesi · 10:00", days: "0000010" },
  { title: "Ev temizliği", summary: "Pazar · 11:00", days: "0000001" },
  { title: "Faturaları kontrol et", summary: "Ayın 1. günü · 10:00" },
];

export function RoutinesScene() {
  return (
    <>
      <p className={styles.sceneTitle}>Rutin</p>
      <span className={styles.routineAdd}>Rutin oluştur</span>
      <ul className={styles.routineCards}>
        {routines.map(routine => (
          <li key={routine.title} className={styles.routineCard}>
            {routine.days && (
              <span className={styles.routineStrip}>
                {weekLetters.map((letter, index) => (
                  <span key={index} data-on={routine.days![index] === "1" || undefined}>
                    {letter}
                  </span>
                ))}
              </span>
            )}
            <span className={styles.routineText}>
              <strong>{routine.title}</strong>
              <span>{routine.summary}</span>
            </span>
            <span className={styles.routineState}>Etkin</span>
          </li>
        ))}
      </ul>
    </>
  );
}

const projects = [
  {
    name: "Tez çalışması",
    text: "Kalan bölümler, kaynaklar ve danışman görüşmeleri.",
    done: 11,
    total: 18,
    info: "7 açık · 12 sa 30 dk",
  },
  { name: "Ev taşınması", text: "Nakliye, abonelikler ve kutulama planı.", done: 6, total: 14, info: "8 açık · 9 sa" },
  { name: "Ürün sunumu", text: "Müşteri toplantısı için hazırlık.", done: 4, total: 6, info: "2 açık · 2 sa 15 dk" },
  { name: "Yıllık izin", text: "Rezervasyon ve seyahat listesi.", done: 2, total: 9, info: "7 açık · 3 sa 40 dk" },
  { name: "Kişisel site", text: "Yeni tasarım ve içerik yazımı.", done: 3, total: 12, info: "9 açık · 11 sa" },
  {
    name: "Vergi hazırlığı",
    text: "Belgeleri topla ve beyanı tamamla.",
    done: 1,
    total: 5,
    info: "4 açık · 1 sa 50 dk",
  },
];

export function ProjectsScene() {
  return (
    <>
      <div className={styles.projectHead}>
        <p className={styles.sceneTitle}>Projeler</p>
        <span className={styles.projectAdd}>
          <Plus aria-hidden="true" size={16} />
          Yeni proje
        </span>
      </div>
      <div className={styles.projectTools}>
        <span className={styles.projectSearch}>
          <Search aria-hidden="true" size={15} />
          Proje ara
        </span>
        <span className={styles.projectCount}>6 / 6 proje</span>
        <span className={styles.projectArchive}>
          <i />
          Arşivlenenleri göster
        </span>
      </div>
      <ul className={styles.projectCards}>
        {projects.map(project => (
          <li key={project.name} className={styles.projectCard}>
            <span className={styles.projectTop}>
              <span className={styles.projectTile}>
                <Folder aria-hidden="true" size={20} />
              </span>
              <span className={styles.projectTitle}>
                <strong>{project.name}</strong>
                <span>{project.info}</span>
              </span>
            </span>
            <span className={styles.projectText}>{project.text}</span>
            <span className={styles.projectProgress}>
              <span>
                <i style={{ width: `${(project.done / project.total) * 100}%` }} />
              </span>
              {project.done}/{project.total}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

import { ChevronRight } from "lucide-react";
import report from "../analytics/report.module.css";
import "../recurrence/styles.css";
import styles from "./landing.module.css";

/* Gerçek Analiz sayfasının işaretlemesi ve stilleri, uydurma verilerle. Veri okumaz, kontrol içermez. */

function Header({ period = "Geçen hafta", range = "26 Eki – 1 Kas 2026" }: { period?: string; range?: string }) {
  return (
    <>
      <p className={styles.sceneTitle}>Analiz</p>
      <div className={report.picker}>
        <div className={report.chips}>
          {["Bu hafta", "Geçen hafta", "Bu ay", "Geçen ay", "Özel aralık"].map(label => (
            <span key={label} className={report.chip} aria-current={label === period ? "page" : undefined}>
              {label}
            </span>
          ))}
        </div>
        <p className={`muted ${report.range}`}>{range}</p>
      </div>
    </>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className={report.tile}>
      <span className={report.label}>{label}</span>
      <strong className={report.value}>{value}</strong>
      <span className={report.note}>{note}</span>
    </div>
  );
}

const strip = ["P", "S", "Ç", "P", "C", "C", "P"];
type Routine = {
  title: string;
  summary: string;
  days?: string;
  done: number;
  total: number;
  /** Son 12 hafta, eskiden yeniye. Yüzde; o hafta görev yoksa boş. */
  weeks: (number | null)[];
};
// Ekim 2026 takvimine göre: her gün 31, üç gün 13, tek gün 4–5, aylık 1 görev.
const routines: Routine[] = [
  {
    title: "Sabah yürüyüşü",
    summary: "Her gün · 07:30",
    days: "1111111",
    done: 26,
    total: 31,
    weeks: [57, 71, 71, 86, 57, 71, 86, 100, 86, 71, 86, 100],
  },
  {
    title: "Haftalık planı gözden geçir",
    summary: "Pazartesi · 09:00",
    days: "1000000",
    done: 3,
    total: 4,
    weeks: [100, 100, 0, 100, 100, 0, 100, 100, 0, 100, 100, 100],
  },
  {
    title: "Spor salonu",
    summary: "Pzt, Çar, Cum · 18:30",
    days: "1010100",
    done: 10,
    total: 13,
    weeks: [67, 33, 67, 100, 67, 33, 67, 100, 67, 67, 100, 100],
  },
  {
    title: "Kitap oku",
    summary: "Her gün · 21:00",
    days: "1111111",
    done: 22,
    total: 31,
    weeks: [43, 57, 29, 57, 71, 43, 57, 71, 57, 86, 71, 50],
  },
  {
    title: "Çamaşırları yıka",
    summary: "Cumartesi · 10:00",
    days: "0000010",
    done: 4,
    total: 5,
    weeks: [100, 100, 100, 0, 100, 100, 100, 100, 0, 100, 100, null],
  },
  {
    title: "Ev temizliği",
    summary: "Pazar · 11:00",
    days: "0000001",
    done: 2,
    total: 4,
    weeks: [100, 0, 100, 100, 0, 100, 0, 100, 0, 100, 0, null],
  },
  {
    title: "Faturaları kontrol et",
    summary: "Ayın 1. günü · 10:00",
    done: 1,
    total: 1,
    weeks: [null, null, 100, null, null, null, 100, null, null, null, 100, null],
  },
];
// Haftalar 17 Ağustos'tan başlıyor; Ekim'e değenler 6–10. sıradakiler.
const inPeriod = (index: number) => index >= 6 && index <= 10;

export function RoutineAnalyticsScene() {
  return (
    <div className={report.page}>
      <div>
        <Header period="Geçen ay" range="1 Eki – 31 Eki 2026" />
      </div>
      <section className={report.section}>
        <h2>Rutinler</h2>
        <p className={report.lead}>Geçen ay 7 rutinde 89 görevden 68 tanesi yapıldı. Önceki ay: 59/85.</p>
        <div className={report.tiles}>
          <Tile label="Tutarlılık" value="%76" note="Önceki ay: %69" />
          <Tile label="Yapılan" value="68/89" note="9 tanesi sonradan" />
          <Tile label="Zamanında" value="59" note="Gününde bitirilen" />
        </div>
        <div className={styles.routineWide}>
          <div className={report.routineBox}>
            <div className={report.routineHead} aria-hidden="true">
              <span>Rutin</span>
              <span>Tutarlılık · Geçen ay</span>
              <span>Son 12 hafta · haftalık yüzde</span>
              <span />
            </div>
            <ul className={report.routineList}>
              {routines.map(routine => {
                // Gerçek sayfadaki gibi: az örnekte yüzde değil sayı gösterilir.
                const percent = routine.total >= 3 ? Math.round((routine.done / routine.total) * 100) : null;
                return (
                  <li key={routine.title}>
                    <div className={report.routineRow}>
                      <span className={report.routineStrip}>
                        {routine.days && (
                          <span className="recurrence-strip" aria-hidden="true">
                            {strip.map((letter, index) => (
                              <span key={index} data-on={routine.days![index] === "1" || undefined}>
                                {letter}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                      <span className={report.routineText}>
                        <strong>{routine.title}</strong>
                        <span className="muted">{routine.summary}</span>
                      </span>
                      <span className={report.routineMeter}>
                        <span>
                          <strong>
                            {percent !== null
                              ? `%${percent}`
                              : routine.total
                                ? `${routine.done}/${routine.total}`
                                : "Görev yok"}
                          </strong>
                          {percent !== null && (
                            <span className="muted">
                              {routine.done}/{routine.total}
                            </span>
                          )}
                        </span>
                        {percent !== null && (
                          <span className={report.routineTrack}>
                            <span style={{ width: `${percent}%` }} />
                          </span>
                        )}
                      </span>
                      <span
                        className={report.routineWeeks}
                        role="img"
                        aria-label={`${routine.title}, son 12 haftanın örnek tamamlanma oranları`}
                      >
                        <span className={report.routineWeeksCaption}>Son 12 hafta · haftalık yüzde</span>
                        <span className={report.routineBars}>
                          {routine.weeks.map((share, index) => (
                            <span
                              key={index}
                              className={report.routineBar}
                              data-empty={share === null || undefined}
                              data-period={inPeriod(index) || undefined}
                            >
                              <span
                                data-zero={share === 0 || undefined}
                                style={share ? { height: `${share}%` } : undefined}
                              />
                            </span>
                          ))}
                        </span>
                        <span className={report.routineAxis}>
                          <span>17 Ağu</span>
                          <span>Bu hafta</span>
                        </span>
                      </span>
                      <ChevronRight className={report.routineChevron} size={16} aria-hidden="true" />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        <div className={report.routineLegend}>
          <span>
            <i data-kind="zero" aria-hidden="true" />
            Hiç yapılmadı
          </span>
          <span>
            <i data-kind="none" aria-hidden="true" />
            Görev yoktu
          </span>
          <span>
            <i data-kind="period" aria-hidden="true" />
            Seçili dönem
          </span>
        </div>
      </section>
    </div>
  );
}

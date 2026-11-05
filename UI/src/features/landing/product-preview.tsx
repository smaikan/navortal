"use client";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { BrandMark } from "../../components/ui/brand-mark";
import { PreviewIcon, type PreviewIconName } from "./preview-icons";
import { AnalyticsScene, RoutineAnalyticsScene } from "./preview-analytics";
import { CalendarScene, NotesScene, PlanScene, ProjectsScene, RoutinesScene } from "./preview-scenes";
import styles from "./landing.module.css";

const pages = [
  { label: "Gün Planlama", caption: "Gün Planlama: saatli ve saatsiz işlerin, günün kalanıyla birlikte." },
  { label: "Takvim", caption: "Takvim: ayın planını ve özel günlerini tek bakışta gör." },
  { label: "Notlar", caption: "Notlar: aklındakini bırak, renkli kategorilerle bul." },
  { label: "Rutin", caption: "Rutin: tekrar eden işlerini bir kez kur, günlerine kendisi gelsin." },
  { label: "Projeler", caption: "Projeler: uzun soluklu işlerini topla, ilerlemeyi tek yerden izle." },
  { label: "Analiz", caption: "Analiz: çalışmanın ritmini ve zamanının nereye gittiğini gör." },
  { label: "Rutin analizi", caption: "Rutin analizi: bütün rutinlerinin haftalar içinde nasıl gittiğini izle." },
] as const;
// Yan menü sırası gerçek uygulamayla aynı.
const sidebar: { label: string; icon: PreviewIconName; page?: number }[] = [
  { label: "Gün Planlama", icon: "sun", page: 0 },
  { label: "Görevler", icon: "tasks" },
  { label: "Takvim", icon: "calendar", page: 1 },
  { label: "Pomodoro", icon: "timer" },
  { label: "Eisenhower Matrisi", icon: "matrix" },
];
const organize: { label: string; icon: PreviewIconName; page?: number }[] = [
  { label: "Havuz", icon: "inbox" },
  { label: "Projeler", icon: "folder", page: 4 },
  { label: "Kategoriler", icon: "shapes" },
  { label: "Notlar", icon: "notes", page: 2 },
  { label: "Rutin", icon: "repeat", page: 3 },
  { label: "Analiz", icon: "chart", page: 5 },
  { label: "Hatırlatmalar", icon: "alarm" },
];
const bottom: { label: string; icon: PreviewIconName; page?: number }[] = [
  { label: "Gün Planlama", icon: "sun", page: 0 },
  { label: "Görevler", icon: "tasks" },
  { label: "Takvim", icon: "calendar", page: 1 },
  { label: "Pomodoro", icon: "timer" },
  { label: "Daha fazla", icon: "more", page: 2 },
];

/** Örnek hesap için çizilmiş avatar. Gerçek bir kişinin fotoğrafı değil. */
function ProfilePortrait() {
  return (
    <svg className={styles.mockAvatar} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <circle className={styles.portraitBack} cx="14" cy="14" r="14" />
      <path className={styles.portraitBody} d="M4.5 25.5c1.4-4.6 5-7 9.5-7s8.1 2.4 9.5 7a14 14 0 0 1-19 0Z" />
      <circle className={styles.portraitFace} cx="14" cy="11.5" r="5" />
      <path
        className={styles.portraitHair}
        d="M8.8 11.4c-.4-4 2.1-6.6 5.4-6.6 3.4 0 5.6 2.5 5 6.4-1.3-1.8-3.6-2.9-6.3-2.6-1.8.2-3.3 1.2-4.1 2.8Z"
      />
    </svg>
  );
}

/** Gerçek alanın uydurma, salt okunur önizlemesi; yalnız seçili sayfayı tutuyor. Sekmeler erişilebilir kontrol, örnek menü ise Tab sırasının dışında fare kısayolu. */
export function ProductPreview() {
  const scenes = [
    <PlanScene key="plan" />,
    <CalendarScene key="calendar" />,
    <NotesScene key="notes" />,
    <RoutinesScene key="routines" />,
    <ProjectsScene key="projects" />,
    <AnalyticsScene key="analytics" />,
    <RoutineAnalyticsScene key="routine-analytics" />,
  ];
  const [selected, setSelected] = useState(0);
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  function keyDown(event: KeyboardEvent, index: number) {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % pages.length
        : event.key === "ArrowLeft"
          ? (index + pages.length - 1) % pages.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? pages.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    setSelected(next);
    tabs.current[next]?.focus();
  }
  function navItem(item: { label: string; icon: PreviewIconName; page?: number }, className: string, active: string) {
    const content = (
      <>
        <span className={styles.navIcon}>
          <PreviewIcon name={item.icon} size={18} />
        </span>
        <span className={styles.navLabel}>{item.label}</span>
      </>
    );
    return item.page === undefined ? (
      <span key={item.label} className={className}>
        {content}
      </span>
    ) : (
      <button
        key={item.label}
        type="button"
        tabIndex={-1}
        // Rutin analizi de Analiz sayfasının bir bölümü; menüde aynı öğe seçili kalır.
        className={className + ((selected === 6 ? 5 : selected) === item.page ? " " + active : "")}
        onClick={() => setSelected(item.page!)}
      >
        {content}
      </button>
    );
  }
  return (
    <figure className={styles.productFigure}>
      <div className={styles.previewTabs} role="tablist" aria-label="Örnek sayfa">
        {pages.map((page, index) => (
          <button
            key={page.label}
            ref={el => {
              tabs.current[index] = el;
            }}
            id={id + "-tab-" + index}
            type="button"
            role="tab"
            aria-selected={selected === index}
            aria-controls={id + "-panel-" + index}
            tabIndex={selected === index ? 0 : -1}
            className={styles.previewTab}
            onClick={() => setSelected(index)}
            onKeyDown={e => keyDown(e, index)}
          >
            {page.label}
          </button>
        ))}
      </div>
      <div className={styles.productWindow}>
        <div className={styles.mockSidebar} aria-hidden="true">
          <span className={styles.mockBrand}>
            <BrandMark size={22} />
            Navortal
          </span>
          {sidebar.map(item => navItem(item, styles.mockNav, styles.mockNavActive))}
          <span className={styles.mockDivider} />
          {organize.map(item => navItem(item, styles.mockNav, styles.mockNavActive))}
          <span className={styles.mockAccount}>
            <span className={styles.mockAccountTrigger}>
              <ProfilePortrait />
              <span className={styles.mockAccountName}>Deniz Yılmaz</span>
              <PreviewIcon name="down" size={14} />
            </span>
            <span className={styles.mockHelp}>
              <PreviewIcon name="help" size={16} />
            </span>
          </span>
        </div>
        <div className={styles.mockArea}>
          <div className={styles.mockTopbar} aria-hidden="true">
            <span className={styles.mockMobileBrand}>
              <BrandMark size={22} />
            </span>
            <PreviewIcon name="bell" size={20} />
            <span className={styles.mockNewTask}>
              <PreviewIcon name="plus" size={16} />
              <span>Görev</span>
              <kbd>N</kbd>
            </span>
          </div>
          <div className={styles.mockMain}>
            {scenes.map((scene, index) => (
              <div
                key={index}
                role="tabpanel"
                id={id + "-panel-" + index}
                aria-labelledby={id + "-tab-" + index}
                hidden={selected !== index}
                tabIndex={0}
                // Rutin listesi pencereden uzun; bu sahne kendi içinde kayar.
                className={styles.scene + (index === 6 ? " " + styles.sceneScroll : "")}
              >
                {scene}
              </div>
            ))}
          </div>
          <div className={styles.mockPlayer} aria-hidden="true">
            <span className={styles.playerMain}>
              <strong>Sunumun girişini yaz</strong>
              <span className={styles.playerState}>
                <i />
                Çalışılıyor<span>·</span>
                <strong className={styles.playerTime}>12:40</strong>
              </span>
            </span>
            <span className={styles.playerActions}>
              <span className={styles.playerAction}>
                <PreviewIcon name="pause" size={16} />
                <span>Duraklat</span>
              </span>
              <span className={styles.playerAction}>
                <PreviewIcon name="stop" size={14} />
                <span>Oturumu bitir</span>
              </span>
              <span className={styles.playerMore}>
                <PreviewIcon name="more" size={18} />
              </span>
            </span>
          </div>
          <div className={styles.mockBottomNav} aria-hidden="true">
            {bottom.map(item => navItem(item, styles.bottomItem, styles.bottomItemActive))}
          </div>
        </div>
      </div>
      <figcaption className={styles.previewCaption} aria-live="polite">
        {pages[selected].caption}
      </figcaption>
    </figure>
  );
}

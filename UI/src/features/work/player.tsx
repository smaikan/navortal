"use client";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import { useTaskPanel } from "../../components/layout/task-panel";
import { Menu } from "../../components/ui/menu";
import { useWork } from "./coordinator";
import { clock, displaySeconds, spoken, stateLabels, type Work } from "./model";
import { useMiniPlayerItem } from "../mini-player/bridge";
const SegmentsDialog = lazy(() => import("./segments").then(module => ({ default: module.SegmentsDialog })));
const ImmediateDialog = lazy(() => import("./immediate-dialog").then(module => ({ default: module.ImmediateDialog })));
const UrgentDialog = lazy(() => import("../planning/urgent-dialog").then(module => ({ default: module.UrgentDialog })));

/** Gün menüsünden veya oynatıcı menüsünden açılan geçiş penceresi. Kapanınca odak menü düğmesine döner. */
export function ImmediateSwitch({
  trigger,
  close,
  review = false,
  date,
}: {
  trigger: HTMLElement;
  close: () => void;
  review?: boolean;
  date?: string;
}) {
  return (
    <Suspense fallback={<p role="status">Geçiş ekranı açılıyor…</p>}>
      {review ? (
        <ImmediateDialog trigger={trigger} close={close} review />
      ) : (
        <UrgentDialog trigger={trigger} close={close} date={date} />
      )}
    </Suspense>
  );
}

/** Geçen süre ayrı görünümde. Çevredeki oynatıcı ve çalışma alanı saniye güncellemesini dinlemiyor. */
export function WorkTimer({ work, receivedAt }: { work: Pick<Work, "state" | "activeSeconds">; receivedAt: number }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    // Yeni sunucu değeri hemen gösterilir, geçen fark en az sıfırdır. Sayaç bir saniye içinde devam eder.
    if (work.state !== "Running") return;
    const timer = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(timer);
  }, [work.state, work.activeSeconds, receivedAt]);
  const total = displaySeconds(work, receivedAt, now);
  return (
    <span
      role="timer"
      aria-live="off"
      className="work-timer"
      aria-label={`Aktif çalışma ${spoken(total)}`}
      data-work-timer
    >
      {clock(total)}
    </span>
  );
}

/** Sabit çubuk mesaj ve satır kırılmasıyla büyüyebilir. Son satırı örtmemesi için tam yüksekliği ayrılır. */
function useReservedSpace(target: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const element = target.current;
    const shell = element?.closest<HTMLElement>(".workspace-shell");
    const slot = element?.closest<HTMLElement>("#work-player-slot");
    if (!element || !shell || !slot) return;
    // Ölçüm gözlemcisinin dışında, yalnız değişince yazıyoruz. Aynı karede yerleşim tekrar gözlem tetiklemesin.
    let frame = 0;
    let last = "";
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = `${Math.ceil(slot.getBoundingClientRect().height)}px`;
        if (next !== last) {
          last = next;
          // Kabuk değişkeni miras alınıyor, yazmak bütün sayfada stil hesabı yapar. Stil dosyasındaki değer yetiyorsa yazmıyoruz.
          if (getComputedStyle(shell).getPropertyValue("--player-space").trim() !== next)
            shell.style.setProperty("--player-space", next);
          // WebKit odak kaydırması dahil sabit alanların boşluğunu kaydırma kökünde bir kere ayırıyoruz.
          element.ownerDocument.documentElement.style.setProperty("--workspace-player-space", next);
        }
      });
    });
    observer.observe(slot);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      shell.style.removeProperty("--player-space");
      element.ownerDocument.documentElement.style.removeProperty("--workspace-player-space");
    };
  }, [target]);
}
/** Son çalışma komutunun hatası, belirsiz sonuç çözümü ve notu geldiği kontrolün yanında çizilir. */
export function WorkFeedback({ className }: { className: string }) {
  const work = useWork();
  const errorBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (work.failure) errorBox.current?.focus();
  }, [work.failure]);
  if (!work.ready || (!work.failure && !work.notice)) return null;
  return (
    <div className={className}>
      {work.failure && (
        <div ref={errorBox} tabIndex={-1} role="alert" className="form-error">
          <p>{work.failure}</p>
          {work.uncertain?.kind === "start" && (
            <button type="button" disabled={work.busy} onClick={() => void work.retryStart()}>
              Aynı başlatmayı güvenle yeniden dene
            </button>
          )}
          {work.uncertain?.kind === "immediate" && (
            <button type="button" disabled={work.busy} onClick={() => void work.retryStart()}>
              Aynı acil geçişi güvenle yeniden dene
            </button>
          )}
          {work.uncertain && (
            <button type="button" disabled={work.busy} onClick={work.acknowledge}>
              Güncel çalışma durumunu kontrol et
            </button>
          )}
        </div>
      )}
      {work.notice && <p className="form-notice">{work.notice}</p>}
      {!work.uncertain && (
        <button type="button" onClick={work.dismiss}>
          Mesajı kapat
        </button>
      )}
    </div>
  );
}
export function WorkPlayer() {
  const work = useWork();
  const session = work.work;
  const open = useTaskPanel();
  const root = useRef<HTMLDivElement>(null);
  useReservedSpace(root);
  const [segmentsTrigger, setSegmentsTrigger] = useState<HTMLElement | null>(null);
  const [immediate, setImmediate] = useState<{ trigger: HTMLElement; review: boolean } | null>(null);
  const locked = work.busy || !!work.uncertain;
  const miniPlayerItem = useMiniPlayerItem(session?.state === "Running");
  return (
    <div className="work-player" ref={root}>
      <p className="sr-only" role="status" aria-live="polite">
        {work.announcement}
      </p>
      {session && (
        <>
          <div className="work-player-main">
            <p className="work-player-title">
              {session.taskAtStart?.title ?? (session.taskId ? "Görev" : "Genel odak")}
            </p>
            <p className="work-player-state">
              <span className={`work-dot ${session.state === "Running" ? "running" : "paused"}`} aria-hidden="true" />
              <span>{stateLabels[session.state]}</span>
              <span aria-hidden="true">·</span>
              <WorkTimer work={session} receivedAt={work.receivedAt} />
            </p>
            {!work.online && (
              <p className="work-player-note">
                Bağlantı yok. Süre son sunucu kaydına göre gösteriliyor; komutlar gönderilmez.
              </p>
            )}
          </div>
          <div className="work-player-actions">
            {session.state === "Running" ? (
              <button type="button" disabled={locked} onClick={() => void work.transition("pause")}>
                <Pause size={18} aria-hidden="true" />
                <span>Duraklat</span>
              </button>
            ) : (
              <button
                type="button"
                className="primary"
                disabled={locked}
                onClick={() => void work.transition("resume")}
              >
                <Play size={18} aria-hidden="true" />
                <span>Devam et</span>
              </button>
            )}
            <button type="button" disabled={locked} onClick={() => void work.transition("finish")}>
              <Square size={16} aria-hidden="true" />
              <span>Oturumu bitir</span>
            </button>
            {/* İki durum denetimi görünür kalır, diğerleri tek menüde. */}
            <Menu
              label="Çalışma menüsü"
              items={[
                miniPlayerItem,
                { label: "Aralıklar", onSelect: setSegmentsTrigger },
                !!session.taskId && { label: "Görevi aç", onSelect: trigger => open(session.taskId!, trigger) },
                {
                  label: "Acil işe geç",
                  disabled: work.busy,
                  onSelect: trigger => setImmediate({ trigger, review: false }),
                },
                {
                  label: "Çalışma ve kalan plan",
                  disabled: work.busy,
                  onSelect: trigger => setImmediate({ trigger, review: true }),
                },
              ]}
            />
          </div>
        </>
      )}
      {(work.origin === "player" || work.origin === "immediate") && <WorkFeedback className="work-player-feedback" />}
      {immediate && (
        <ImmediateSwitch trigger={immediate.trigger} review={immediate.review} close={() => setImmediate(null)} />
      )}
      {segmentsTrigger && session && (
        <Suspense fallback={<p role="status">Aralıklar açılıyor…</p>}>
          <SegmentsDialog
            work={session}
            receivedAt={work.receivedAt}
            trigger={segmentsTrigger}
            close={() => setSegmentsTrigger(null)}
          />
        </Suspense>
      )}
    </div>
  );
}

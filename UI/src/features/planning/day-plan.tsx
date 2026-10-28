"use client";
import { lazy, Suspense, useEffect, useId, useState, type ComponentProps } from "react";
import { ArrowRight, Play } from "lucide-react";
import { Menu, openRowMenu } from "../../components/ui/menu";
import { useDonePop } from "../../lib/done-pop";
import { estimateText, priorities } from "../tasks/model";
import { energies } from "../support/model";
import { shortTime, type Phase } from "./agenda-blocks";
import { entryId, type DayActions, type Entry } from "./day-actions";
import { kinds, type DayItem, type Schedule } from "./model";
import type { Hint } from "./glance";
import { calibratedMinutes } from "./calibration";
import "./styles.css";

const FirstStepEditor = lazy(() => import("./first-step").then(m => ({ default: m.FirstStepEditor })));

export const blockTitle = (block: Schedule) => block.taskSnapshot?.task.title ?? kinds[block.kind];
const blockParent = (block: Schedule) => block.taskSnapshot?.task.ancestors.at(-1)?.name ?? null;
export function entryFacts(entry: Entry) {
  return entry.kind === "block"
    ? {
        title: blockTitle(entry.block),
        parent: blockParent(entry.block),
        estimate: estimateText(entry.block.taskSnapshot?.directEstimatedSeconds),
        done: !!entry.block.completedAt,
        taskId: entry.block.taskId,
      }
    : {
        title: entry.item.taskTitle,
        parent: entry.item.parentTitle,
        estimate: estimateText(entry.item.directEstimatedSeconds),
        done: !!entry.item.completedAt,
        taskId: entry.item.taskId,
      };
}
export function entryTiming(entry: Entry) {
  return entry.kind === "block"
    ? { startsAt: entry.block.startsAt, endsAt: entry.block.endsAt, urgent: false }
    : {
        startsAt: entry.item.startsAt ?? null,
        endsAt: entry.item.endsAt ?? null,
        urgent: entry.item.isUrgent === true,
      };
}
/** Yalnız görünüm sırası. Eksik aralığın sunucudan gelen başlangıcını koruyoruz. */
export function orderEntries(blocks: Schedule[], items: DayItem[]) {
  const timed: Entry[] = [
    ...blocks.map(block => ({ kind: "block" as const, block })),
    ...items.filter(item => !!item.startsAt).map(item => ({ kind: "item" as const, item })),
  ];
  timed.sort((a, b) => Date.parse(entryTiming(a).startsAt!) - Date.parse(entryTiming(b).startsAt!));
  const untimed: Entry[] = items
    .filter(item => !item.startsAt)
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
    .map(item => ({ kind: "item", item }));
  return { timed, untimed };
}

type RowProps = {
  entry: Entry;
  date: string;
  zone: string;
  format: string;
  phase: Phase | null;
  now: number;
  actions: DayActions;
  canStart: boolean;
  start: () => void;
  openTask: (trigger: HTMLElement) => void;
  move: (trigger: HTMLElement) => void;
  pool?: (trigger: HTMLElement) => void;
  hint?: Hint;
  dim?: boolean;
  /** Gerçek/tahmin oranının sunucu medyanı. İpucu kapalıysa veya yoksa null. */
  ratio?: number | string | null;
  supportsEnabled?: boolean;
  five?: (trigger: HTMLElement) => void;
  onEdit?: () => void;
  /** Sıradaki açık öğe. Satır vurgulanır, başlatma düğmeleri yazıyla görünür. */
  next?: boolean;
};

/** Plan satırında gün öğesi kutusu, saat, görev/üst adı, tahmin, Başlat ve menü var. Satıra basınca saat yerinde düzenlenir. */
export function PlanRow({
  entry,
  date,
  zone,
  format,
  phase,
  now,
  actions,
  canStart,
  start,
  openTask,
  move,
  pool,
  hint,
  dim = false,
  ratio = null,
  supportsEnabled = false,
  five,
  onEdit,
  next = false,
}: RowProps) {
  const id = useId();
  const facts = entryFacts(entry);
  const timing = entryTiming(entry);
  const priority = hint?.priority ?? (entry.kind === "item" ? entry.item.priority : entry.block.taskSnapshot?.priority);
  const energy =
    hint?.energyDemand ?? (entry.kind === "item" ? entry.item.energyDemand : entry.block.taskSnapshot?.energyDemand);
  const key = entryId(entry);
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState<"first" | "important" | null>(null);
  const busy = actions.pending === key;
  const failure = actions.failure?.id === key ? actions.failure.text : "";
  // Kutu tıklamayı hemen izler. Yazı ve okuma bitince, hata olsa da sunucu değeri gösterilir.
  const [shown, setShown] = useState<boolean | null>(null);
  const done = shown ?? facts.done;
  const pop = useDonePop(done);
  const block = entry.kind === "block" ? entry.block : null;
  const work = !block || block.kind === "Work";
  const current = phase === "current" && !facts.done;
  const left = block && current ? Math.max(0, Math.ceil((Date.parse(block.endsAt) - now) / 60000)) : 0;
  const progress =
    block && current
      ? Math.min(
          100,
          Math.max(
            0,
            ((now - Date.parse(block.startsAt)) / (Date.parse(block.endsAt) - Date.parse(block.startsAt))) * 100,
          ),
        )
      : 0;
  return (
    <li
      className={`r2-plan-row${timing.urgent ? " urgent" : ""}${done ? " done" : ""}${pop ? " r2-done-pop" : ""}${dim ? " dim" : ""}${current ? " now" : ""}${next ? " next" : ""}${phase === "past" && !facts.done ? " past" : ""}`}
      aria-current={current ? "time" : undefined}
      aria-busy={busy || undefined}
    >
      <div className="r2-plan-line" onContextMenu={facts.taskId ? openRowMenu : undefined}>
        <label className="r2-square-hit">
          <input
            type="checkbox"
            className="r2-square"
            checked={done}
            disabled={busy}
            aria-label={`${facts.title} plan öğesi bitti`}
            onChange={() => {
              setShown(!done);
              void actions.toggle(entry).finally(() => setShown(null));
            }}
          />
        </label>
        <button
          type="button"
          className="r2-plan-body"
          aria-expanded={editing}
          aria-controls={`${id}-time`}
          aria-label={`${facts.title}${timing.startsAt ? `, ${shortTime(timing.startsAt, zone, format)}${timing.endsAt ? `–${shortTime(timing.endsAt, zone, format)}` : ", bitiş belirlenmemiş"}` : ", saati belirlenmemiş"}. Saati düzenle`}
          onClick={() => {
            if (!editing) onEdit?.();
            setEditing(!editing);
            actions.clear();
          }}
        >
          <span className="r2-plan-title">
            {facts.title}
            {facts.parent && <span className="r2-plan-parent"> · {facts.parent}</span>}
            {timing.urgent && <span className="r2-chip urgent-chip">Acil iş</span>}
          </span>
          {timing.startsAt && (
            <span className="r2-plan-time">
              <time dateTime={timing.startsAt}>{shortTime(timing.startsAt, zone, format)}</time>
              {timing.endsAt ? (
                <>
                  –<time dateTime={timing.endsAt}>{shortTime(timing.endsAt, zone, format)}</time>
                </>
              ) : (
                <span className="sr-only">, bitiş belirlenmemiş</span>
              )}
            </span>
          )}
          {current && <span className="r2-now-text">Şimdi · {left} dk kaldı</span>}
          {facts.taskId && ((priority && priority !== "Normal") || energy) && (
            <span className="r2-plan-facts">
              {/* Varsayılan öncelik ve belirtilmemiş efor satırda yer kaplamaz. */}
              {priority && priority !== "Normal" && <span className="r2-chip">{priorities[priority]}</span>}
              {energy && <span className="r2-chip">Efor: {energies[energy]}</span>}
            </span>
          )}
        </button>
        <span className="r2-plan-estimate">
          <span className="sr-only">{facts.estimate ? "Tahmini süre " : "Tahmin girilmedi "}</span>
          {facts.estimate || "Süre yok"}
        </span>
        {work && facts.taskId && (
          <button
            type="button"
            className="r2-icon-start"
            disabled={!canStart || facts.done}
            aria-label={`Başlat: ${facts.title}`}
            onClick={start}
          >
            <Play aria-hidden="true" size={13} />
            {next && <span aria-hidden="true">Başlat</span>}
          </button>
        )}
        {next && work && facts.taskId && supportsEnabled && five && (
          <button
            type="button"
            className="r2-next-five"
            disabled={!canStart}
            aria-label={`5 dakika başlat: ${facts.title}`}
            onClick={event => five(event.currentTarget)}
          >
            5 dakika
          </button>
        )}
        <Menu
          label={`${facts.title} plan öğesi menüsü`}
          items={[
            !!facts.taskId && { label: "Görev ayrıntısı", onSelect: openTask },
            { label: "Başka güne taşı", separator: true, disabled: busy, onSelect: move },
            !!pool && { label: "Bu işi havuzda beklet", disabled: busy, onSelect: pool },
            !!facts.taskId && !facts.done && { label: "İlk adımı yaz", onSelect: () => setStep("first") },
            !!facts.taskId &&
              !facts.done &&
              supportsEnabled &&
              !!five && { label: "Sadece 5 dakika", disabled: !canStart, onSelect: five },
            !!facts.taskId && !facts.done && { label: "Önemli not ekle", onSelect: () => setStep("important") },
            {
              label: "Plandan kaldır",
              danger: true,
              disabled: busy,
              onSelect: () => void actions.remove(entry, facts.title),
            },
          ]}
        />
      </div>
      {entry.kind === "item" && entry.item.timingIssue && (
        <p className="r2-plan-warning" role="status">
          {(
            {
              ScheduleOverlap: "Bu saatte başka bir plan var; bitişi belirlemek için saati düzenle.",
              LocalTimeUnavailable: "Başlangıç saati bu gün kullanılamıyor; yeni bir saat seç.",
              PlanTimeZoneMismatch: "Bu günün saat ayarı farklı; başlangıcı yeniden seç.",
              EstimateTooLong: "Tahmin tek bir plan aralığı için uzun; saati kendin belirle.",
            } as Record<string, string>
          )[entry.item.timingIssue] ?? "Plan saatini kontrol et."}
        </p>
      )}
      {hint?.nextStep && !facts.done && !step && (
        <div className="r2-plan-chips">
          <span className="r2-chip step">
            <ArrowRight aria-hidden="true" size={12} />
            <span>
              <span className="r2-chip-label">Not: </span>
              {hint.nextStep.text.replace(/^Sıradaki küçük adım:\s*/i, "")}
            </span>
          </span>
        </div>
      )}
      {step && facts.taskId && (
        <Suspense fallback={null}>
          <FirstStepEditor taskId={facts.taskId} prompt={step} close={() => setStep(null)} />
        </Suspense>
      )}
      {current && (
        <div className="r2-now-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
      {editing && (
        <TimeEditor
          id={`${id}-time`}
          entry={entry}
          date={date}
          zone={zone}
          estimate={facts.estimate}
          suggestion={calibratedMinutes(
            entry.kind === "block"
              ? entry.block.taskSnapshot?.directEstimatedSeconds
              : entry.item.directEstimatedSeconds,
            ratio,
          )}
          actions={actions}
          close={() => setEditing(false)}
        />
      )}
      {failure && !editing && (
        <p role="alert" className="field-error r2-row-error">
          {failure}
        </p>
      )}
    </li>
  );
}

/** Düzenleyici yalnız kullanıcı açınca yüklenir. Modül hatasında yerinde tekrar veya vazgeç var. */
function TimeEditor(props: ComponentProps<typeof import("./time-editor").TimeEditor>) {
  const [Editor, setEditor] = useState<typeof import("./time-editor").TimeEditor | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    import("./time-editor").then(
      value => {
        if (current) setEditor(() => value.TimeEditor);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [attempt]);
  if (Editor) return <Editor {...props} />;
  return (
    <div id={props.id} className="r2-time-editor">
      <p role={failed ? "alert" : "status"}>
        {failed ? "Saat düzenleyicisi açılamadı." : "Saat düzenleyicisi hazırlanıyor…"}
      </p>
      {failed && (
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setAttempt(value => value + 1);
          }}
        >
          Yeniden dene
        </button>
      )}
      <button type="button" onClick={props.close}>
        Vazgeç
      </button>
    </div>
  );
}

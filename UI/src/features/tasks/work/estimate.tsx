"use client";
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { useSession } from "../../auth/provider";
import { estimateText, isOffline, offlineWrite, readTask, type Task } from "../model";
import { useTaskCache } from "../queries";
import { workFailure } from "./model";
import { useWorkReport } from "./queries";
import { useSupports } from "../../preferences/supports";
import "../styles.css";

const sliderMax = 480;
const EstimateHint = lazy(() => import("./estimate-hint").then(m => ({ default: m.EstimateHint })));
/** Sunucu tahmini tam dakika. null tahmin yoktur, asla sıfır sayılmaz. */
export function estimateMinutes(task: Pick<Task, "hasDirectWork" | "directEstimatedSeconds">) {
  return task.hasDirectWork && task.directEstimatedSeconds !== null
    ? String(Math.round(Number(task.directEstimatedSeconds) / 60))
    : "";
}
/** Boş alan tahmini temizler. Diğeri en fazla 100000 tam dakika olmalı. */
export function parseMinutes(text: string): number | null {
  const value = text.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value) || Number(value) > 100000)
    throw new RangeError("Tahmini süreyi 0–100.000 arası tam dakika olarak yaz.");
  return Number(value);
}

/** Sayı ve kaydırıcı aynı dakika değerinde. Kendi kendine kaydeder, yalnız bu görevi etkiler; dört temel bilgi de gösterilir. */
export function EstimateSection({ task, hasChildren }: { task: Task; hasChildren: boolean }) {
  const { session } = useSession();
  const cache = useTaskCache();
  const report = useWorkReport(task.id);
  const { supports } = useSupports();
  const id = useId();
  const [text, setText] = useState(() => estimateMinutes(task));
  const [failure, setFailure] = useState("");
  const [saved, setSaved] = useState(false);
  const [sent, setSent] = useState(() => estimateMinutes(task));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busy = useRef(false);
  const server = estimateMinutes(task);
  const [seen, setSeen] = useState(server);
  if (seen !== server) {
    setSeen(server);
    if (text === sent) {
      setText(server);
      setSent(server);
    }
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  async function save(value: string, expectedVersion?: Task["version"]) {
    clearTimeout(timer.current);
    let minutes: number | null;
    try {
      minutes = parseMinutes(value);
    } catch (error) {
      setFailure((error as Error).message);
      return;
    }
    if (value.trim() === sent || busy.current || task.archivedAt) return;
    if (isOffline()) {
      setFailure(offlineWrite);
      return;
    }
    busy.current = true;
    setFailure("");
    setSaved(false);
    try {
      const fresh = readTask(await session.api.read("/api/tasks/{id}", { path: { id: task.id } }));
      const body = {
        version: expectedVersion ?? fresh.version,
        hasDirectWork: minutes !== null || fresh.hasDirectWork,
        directEstimatedSeconds: minutes === null ? null : minutes * 60,
        targetBudgetSeconds: fresh.targetBudgetSeconds,
      };
      const result = readTask(
        await session.api.mutation("/api/tasks/{id}/work-definition", "put", { path: { id: task.id }, body }).execute(),
      );
      if (!cache.current()) return;
      setSent(value.trim());
      setSaved(true);
      void cache.update(result);
    } catch (error) {
      if (cache.current()) setFailure(workFailure(error));
    } finally {
      busy.current = false;
    }
  }
  function change(value: string, immediate = false) {
    setText(value);
    setSaved(false);
    setFailure("");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(value), immediate ? 0 : 700);
  }
  const empty = text.trim() === "";
  const data = report.data;
  const actual = data ? Number(data.time.subtreeActualSeconds) : 0;
  const total = data
    ? data.summary.calculatedTotalSeconds !== null
      ? estimateText(data.summary.calculatedTotalSeconds)
      : Number(data.summary.knownEstimatedSeconds) > 0
        ? `En az ${estimateText(data.summary.knownEstimatedSeconds)}`
        : "Bilinmiyor"
    : "…";
  const facts = [
    ["Tahmini görev süresi", total],
    ["Tamamlanan süre", data ? (actual > 0 ? estimateText(actual) : "0 dk") : "…"],
    [
      "Kalan tahmini süre",
      data
        ? data.time.remainingSeconds === null
          ? "Bilinmiyor"
          : estimateText(data.time.remainingSeconds) || "0 dk"
        : "…",
    ],
    [
      "Tahmin aşımı",
      data ? (Number(data.time.knownOvertimeSeconds) > 0 ? estimateText(data.time.knownOvertimeSeconds) : "Yok") : "…",
    ],
  ] as const;
  return (
    <section className="r2-section" aria-labelledby={`${id}-title`}>
      <div className="r2-section-head">
        <h3 id={`${id}-title`}>Tahmini süre</h3>
        {!empty && !task.archivedAt && (
          <button type="button" className="r2-quiet" onClick={() => change("", true)}>
            Temizle
          </button>
        )}
      </div>
      <div className="r2-estimate-row">
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={5}
          disabled={!!task.archivedAt}
          value={empty ? 0 : Math.min(Number(text) || 0, sliderMax)}
          data-empty={empty || undefined}
          aria-label="Tahmini süre, dakika"
          aria-valuetext={empty ? "Tahmin yok" : `${text} dakika`}
          onChange={event => change(event.target.value)}
          onKeyUp={() => void save(text)}
          onPointerUp={() => void save(text)}
        />
        <label className="r2-minutes">
          <input
            type="number"
            aria-label="Tahmini süre (dakika)"
            inputMode="numeric"
            min={0}
            step={5}
            placeholder="—"
            disabled={!!task.archivedAt}
            value={text}
            aria-invalid={!!failure || undefined}
            aria-describedby={failure ? `${id}-error` : undefined}
            onChange={event => change(event.target.value)}
            onBlur={() => void save(text)}
          />
          <span aria-hidden="true">dk</span>
        </label>
      </div>
      {supports.calibrationHints && !supports.calmView && !task.archivedAt && (
        <Suspense fallback={null}>
          <EstimateHint
            task={task}
            apply={async value => {
              setText(value);
              await save(value, task.version);
            }}
          />
        </Suspense>
      )}
      {empty && <p className="r2-hint">Tahmin girilmedi. Bilinmeyen süre sıfır sayılmaz.</p>}
      {failure && (
        <p id={`${id}-error`} role="alert" className="field-error">
          {failure}
        </p>
      )}
      <p role="status" className="r2-saved">
        {saved ? "Kaydedildi" : ""}
      </p>
      <dl className="r2-facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className={label === "Tahmin aşımı" && value !== "Yok" && value !== "…" ? "over" : undefined}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {report.isError && (
        <p role="alert" className="field-error">
          Süreler alınamadı.{" "}
          <button type="button" className="r2-quiet" onClick={() => void report.refetch()}>
            Yeniden yükle
          </button>
        </p>
      )}
      {hasChildren && (
        <p className="r2-hint">
          Değerler alt görevler dahildir. Buradaki giriş yalnız bu görevin kendi süresini değiştirir.
        </p>
      )}
    </section>
  );
}

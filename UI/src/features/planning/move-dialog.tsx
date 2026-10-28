"use client";
import { TemporalInput } from "../../components/ui/temporal-input";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Temporal } from "temporal-polyfill";
import { useQueryClient } from "@tanstack/react-query";
import { Surface } from "../../components/ui/surface";
import { ApiError } from "../../lib/api/errors";
import { queryKeys } from "../../lib/api/query-client";
import { wallTimeIsAmbiguous, type WallChoice } from "../../lib/time/wall-time";
import { useSession } from "../auth/provider";
import { useDialogGuard } from "../work/draft-guard";
import {
  minutes,
  readDay,
  readSchedule,
  timeText,
  titleOf,
  warningText,
  type Day,
  type Draft,
  type Result,
  type Schedule,
} from "./model";
import { dayWindow, initialDraft, localInput, rangeBody } from "./time-model";
import { moveTimes, multiFailure, rangeDates, readMoved } from "./distribution-model";
type Command = { execute: (options?: { retryUnknownResult?: boolean }) => Promise<Result>; target: Day };
export function MoveDialog({
  day,
  block,
  initialTarget,
  initialRange,
  trigger,
  close,
}: {
  day: Day;
  block: Schedule;
  initialTarget?: string;
  initialRange?: { startsAt: string; endsAt: string };
  trigger: HTMLElement;
  close: () => void;
}) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const [base, setBase] = useState({ day, block });
  const [date, setDate] = useState(
    () => initialTarget ?? Temporal.PlainDate.from(day.localDate).add({ days: 1 }).toString(),
  );
  const [target, setTarget] = useState<Day | null>(null),
    [draft, setDraft] = useState(() => initialDraft(day.localDate, day.timeZoneId, block));
  const [pending, setPending] = useState(false),
    [unknown, setUnknown] = useState<Command | null>(null),
    [saved, setSaved] = useState<Result | null>(null),
    [stale, setStale] = useState(false),
    [failure, setFailure] = useState(""),
    [refreshFailed, setRefreshFailed] = useState(false);
  const [latest, setLatest] = useState<{ day: Day; block: Schedule; target: Day } | null>(null);
  const busy = useRef(false),
    issue = useRef<HTMLDivElement>(null);
  const locked = pending || !!unknown;
  const guard = useDialogGuard({
    dirty: !saved && !!target,
    pending: locked,
    close,
    trigger,
    message: "Taşıma taslağı kapatılacak. Devam edilsin mi?",
  });
  useLayoutEffect(() => {
    if (failure && !pending) issue.current?.focus();
  }, [failure, pending]);
  async function guarded(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailure("");
    try {
      await action();
    } catch (error) {
      setFailure(multiFailure(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function refresh() {
    setRefreshFailed(false);
    try {
      await Promise.all(
        ["day-overview", "plan-day", "plan-blocks", "plan-allocation", "plan-revisions"].map(r =>
          client.invalidateQueries(
            { queryKey: queryKeys.resource(state.user!.id, r).slice(0, 3), refetchType: "active" },
            { throwOnError: true },
          ),
        ),
      );
    } catch {
      setRefreshFailed(true);
    }
  }
  async function run(command: Command, retry = false) {
    try {
      const result = readMoved(
        await command.execute({ retryUnknownResult: retry }),
        base.block,
        base.day,
        command.target,
      );
      setSaved(result);
      setUnknown(null);
      guard.markSaved();
    } catch (error) {
      setFailure(multiFailure(error));
      if (error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol")) setUnknown(command);
      else {
        setUnknown(null);
        if (
          error instanceof ApiError &&
          (error.status === 404 ||
            (error.status === 409 && !["schedule_protected", "schedule_overlap"].includes(error.code ?? "")))
        )
          setStale(true);
      }
      return;
    }
    // Yazı tamamlandı. Yavaş takip okuması makbuzu kilitlemesin.
    void refresh();
  }
  function loadTarget() {
    void guarded(async () => {
      if (!navigator.onLine) throw new ApiError("offline", "Bağlantı yok. Hedef gün okunamadı; taşıma gönderilmedi.");
      rangeDates(date, date);
      if (date === day.localDate)
        throw new RangeError("Başka bir hedef gün seç. Aynı gün için Saatleri düzenle'yi kullan.");
      const value = readDay(await session.api.read("/api/daily-plans/{date}", { path: { date } }), date);
      setTarget(value);
      setDraft(previous => ({
        ...previous,
        ...(initialRange && date === initialTarget
          ? {
              start: localInput(initialRange.startsAt, value.timeZoneId),
              end: localInput(initialRange.endsAt, value.timeZoneId),
            }
          : moveTimes(base.block, base.day, date)),
        startChoice: "",
        endChoice: "",
      }));
    });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!target || locked || stale || saved) return;
    void guarded(async () => {
      if (!navigator.onLine) throw new ApiError("offline", "Bağlantı yok. Taşıma gönderilmedi; kuyruğa alınmadı.");
      const range = rangeBody(draft, target.localDate, target.timeZoneId);
      if (Date.parse(range.endsAt) > Date.parse(dayWindow(target.localDate, target.timeZoneId).to))
        throw new RangeError(
          "Taşıma aralığı hedef gün içinde kalmalı. Geceyi geçen parça için ayrı düzenleme gerekiyor.",
        );
      const command = session.api.mutation("/api/schedules/{id}/move", "post", {
        path: { id: base.block.id },
        body: {
          version: base.block.version,
          expectedPlanningVersion: base.day.planningVersion,
          targetDate: target.localDate,
          startsAt: range.startsAt,
          endsAt: range.endsAt,
          allowConflicts: draft.conflicts,
          allowProtectedChange: draft.protected,
          reason: range.reason,
        },
      });
      await run({ execute: command.execute, target });
    });
  }
  function reconcile() {
    void guarded(async () => {
      const [d, b, t] = await Promise.all([
        session.api.read("/api/daily-plans/{date}", { path: { date: day.localDate } }),
        session.api.read("/api/schedules/{id}", { path: { id: block.id } }),
        session.api.read("/api/daily-plans/{date}", { path: { date } }),
      ]);
      setLatest({ day: readDay(d, day.localDate), block: readSchedule(b), target: readDay(t, date) });
    });
  }
  const change = (value: Partial<Draft>) => {
    setDraft({ ...draft, ...value });
    setFailure("");
  };
  let targetSeconds: number | null = null;
  if (target) {
    try {
      const r = rangeBody(draft, target.localDate, target.timeZoneId);
      targetSeconds = (Date.parse(r.endsAt) - Date.parse(r.startsAt)) / 1000;
    } catch {
      /* Geçersiz yerel alanları kullanıcı gönderince açıklıyoruz. */
    }
  }
  return (
    <Surface title="Bloğu başka güne taşı" modal returnTo={trigger} onClose={guard.requestClose} closeDisabled={locked}>
      <div className="move-planner">
        <p className="relation-title">{titleOf(base.block)}</p>
        <p>
          Kaynak: {base.day.localDate} · {timeText(base.block.startsAt, base.day.timeZoneId)}–
          {timeText(base.block.endsAt, base.day.timeZoneId)} ·{" "}
          {minutes((Date.parse(base.block.endsAt) - Date.parse(base.block.startsAt)) / 1000)}
          {base.block.isFixed && " · Sabit"}
          {base.block.isLocked && " · Kilitli"}
        </p>
        <p>
          Aynı görev ve blok kimliği korunur. Kaynak ve hedef gün tek değişiklik grubuyla birlikte kaydedilir. Geçmiş
          veya aktif çalışmanın başlangıç bloğu taşınamaz; gerçek çalışma değişmez.
        </p>
        {saved ? (
          <section aria-label="Taşıma onayı">
            <p role="status">Blok hedef güne taşındı. İki gün birlikte kaydedildi.</p>
            <p>Hedef: {target?.localDate}</p>
            <ul aria-label="Taşıma uyarıları">
              {saved.warnings.map((w, i) => (
                <li key={i}>{warningText(w)}</li>
              ))}
            </ul>
            {refreshFailed && (
              <div role="alert">
                Taşıma onayı alındı; güncel görünüm okunamadı. Tekrar taşıma.
                <button disabled={pending} onClick={() => void guarded(refresh)}>
                  Görünümü yeniden oku
                </button>
              </div>
            )}
          </section>
        ) : (
          <>
            <fieldset disabled={locked || stale}>
              <legend>Hedef gün</legend>
              <label>
                Hedef tarih
                <TemporalInput
                  type="date"
                  min="0002-01-01"
                  max="9998-12-31"
                  value={date}
                  onChange={e => {
                    setDate(e.target.value);
                    setTarget(null);
                    setFailure("");
                  }}
                />
              </label>
              <button onClick={loadTarget}>Hedef günü oku</button>
            </fieldset>
            {target && (
              <form aria-label="Günler arası taşıma" noValidate onSubmit={submit}>
                <fieldset disabled={locked || stale}>
                  <legend>Hedef saatleri ve açık izinler</legend>
                  <p>
                    Kaynak saat etiketleri başlangıç taslağıdır; hedef saatleri kontrol et. Değişen miktar sunucu
                    uyarılarında gösterilir.
                  </p>
                  {targetSeconds !== null && (
                    <p>Yeni hedef süresi: {minutes(targetSeconds)}. Bu, planlanan süredir; gerçek çalışma değildir.</p>
                  )}
                  {(["start", "end"] as const).map(key => (
                    <MoveTimeField key={key} field={key} draft={draft} zone={target.timeZoneId} change={change} />
                  ))}
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.protected}
                      onChange={e => change({ protected: e.target.checked })}
                    />
                    Sabit veya kilitli bloğu taşımaya açıkça izin veriyorum
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.conflicts}
                      onChange={e => change({ conflicts: e.target.checked })}
                    />
                    Hedef plandaki çakışmayı açıkça kabul ediyorum
                  </label>
                  <label>
                    Taşıma nedeni (isteğe bağlı)
                    <textarea
                      maxLength={2000}
                      rows={2}
                      value={draft.reason}
                      onChange={e => change({ reason: e.target.value })}
                    />
                  </label>
                  <button className="primary">İki günü birlikte kaydet</button>
                </fieldset>
              </form>
            )}
          </>
        )}
        {pending && (
          <p role="status">{saved ? "Taşıma onayı alındı; görünüm okunuyor…" : "Taşıma sonucu bekleniyor…"}</p>
        )}
        {failure && (
          <div role="alert" ref={issue} tabIndex={-1} className="form-error">
            {failure}
          </div>
        )}
        {unknown && (
          <section aria-label="Belirsiz taşıma sonucu">
            <p>Kaydedilmiş olabilir. Yeni taşıma gönderilmez; yalnız aynı istek aynı anahtarla uzlaştırılır.</p>
            <button disabled={pending} onClick={() => void guarded(() => run(unknown, true))}>
              Aynı taşıma isteğini yeniden dene
            </button>
          </section>
        )}
        {stale && !saved && (
          <section aria-label="Taşıma sürüm karşılaştırması">
            <p>Eski istek tekrarlanmadı; taslak korundu.</p>
            <button disabled={locked} onClick={reconcile}>
              Güncel kaynak ve hedefi oku
            </button>
            {latest && (
              <>
                <p>
                  Kaynak sürümü {String(latest.day.version)} · Blok sürümü {String(latest.block.version)} ·{" "}
                  {timeText(latest.block.startsAt, latest.day.timeZoneId)}
                </p>
                {latest.block.state === "Planned" && latest.block.dailyPlanId === latest.day.id && (
                  <button
                    onClick={() => {
                      setBase({ day: latest.day, block: latest.block });
                      setTarget(latest.target);
                      setLatest(null);
                      setStale(false);
                      setFailure("");
                    }}
                  >
                    Bu sürümlerle taslağı yeniden hazırla
                  </button>
                )}
                <p>Bu seçim kaydetmez; taslağı kontrol edip ayrıca onayla.</p>
              </>
            )}
          </section>
        )}
        <button disabled={locked} onClick={guard.requestClose}>
          Kapat
        </button>
      </div>
    </Surface>
  );
}
function MoveTimeField({
  field,
  draft,
  zone,
  change,
}: {
  field: "start" | "end";
  draft: Draft;
  zone: string;
  change: (value: Partial<Draft>) => void;
}) {
  return (
    <div className="form-field">
      <label htmlFor={`move-${field}`}>{field === "start" ? "Hedef başlangıç" : "Hedef bitiş"}</label>
      <TemporalInput
        id={`move-${field}`}
        type="datetime-local"
        step={1}
        value={draft[field]}
        onChange={e => change({ [field]: e.target.value, [`${field}Choice`]: "" })}
      />
      {wallTimeIsAmbiguous(draft[field], zone) && (
        <>
          <label htmlFor={`move-${field}-choice`}>
            {field === "start" ? "Hedef başlangıç oluşumu" : "Hedef bitiş oluşumu"}
          </label>
          <select
            id={`move-${field}-choice`}
            value={draft[`${field}Choice`]}
            onChange={e => change({ [`${field}Choice`]: e.target.value as WallChoice })}
          >
            <option value="">Saat iki kez oluşuyor; seç</option>
            <option value="earlier">İlk oluşum</option>
            <option value="later">İkinci oluşum</option>
          </select>
        </>
      )}
    </div>
  );
}

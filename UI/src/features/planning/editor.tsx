"use client";
import { TemporalInput } from "../../components/ui/temporal-input";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Surface } from "../../components/ui/surface";
import { ApiError } from "../../lib/api/errors";
import { queryKeys } from "../../lib/api/query-client";
import { wallTimeIsAmbiguous, type WallChoice } from "../../lib/time/wall-time";
import { useSession } from "../auth/provider";
import { useDialogGuard } from "../work/draft-guard";
import type { Task } from "../tasks/model";
import {
  kinds,
  planFailure,
  readDay,
  readResult,
  readSchedule,
  timeText,
  titleOf,
  warningText,
  type Day,
  type Draft,
  type Result,
  type Schedule,
} from "./model";
import { initialDraft, localInput, rangeBody } from "./time-model";

type Command = { execute: (options?: { retryUnknownResult?: boolean }) => Promise<Result> };
export function BlockEditor({
  day,
  block,
  task,
  initialRange,
  remove = false,
  trigger,
  close,
}: {
  day: Day;
  block?: Schedule;
  task?: Task;
  initialRange?: { startsAt: string; endsAt: string };
  remove?: boolean;
  trigger: HTMLElement;
  close: () => void;
}) {
  const { session, state } = useSession();
  const client = useQueryClient();
  // Sürümler düzenleyici açılırken alınır. Arka plan GET'i bunları sessizce değiştirmez.
  const [base, setBase] = useState<{ day: Day; block?: Schedule }>(() => ({ day, block }));
  const zone = base.day.timeZoneId;
  const [latest, setLatest] = useState<{ day: Day; block?: Schedule } | null>(null);
  const [initial] = useState(() => ({
    ...initialDraft(day.localDate, zone, block),
    ...(!block && !task && { kind: "Break" as const }),
  }));
  const [draft, setDraft] = useState(() =>
    initialRange
      ? { ...initial, start: localInput(initialRange.startsAt, zone), end: localInput(initialRange.endsAt, zone) }
      : initial,
  );
  const [pending, setPending] = useState(false),
    [failure, setFailure] = useState(""),
    [stale, setStale] = useState(false);
  const [unknown, setUnknown] = useState<Command | null>(null),
    [saved, setSaved] = useState<Result | null>(null),
    [refreshing, setRefreshing] = useState(false);
  const [refreshFailure, setRefreshFailure] = useState(false);
  const busy = useRef(false),
    issue = useRef<HTMLDivElement>(null);
  const dirty = !saved && JSON.stringify(draft) !== JSON.stringify(initial);
  const { requestClose, markSaved } = useDialogGuard({
    dirty: dirty || !!unknown,
    pending: pending || refreshing,
    close,
    trigger,
    message: "Kaydedilmemiş plan taslağı silinecek. Devam edilsin mi?",
  });
  useLayoutEffect(() => {
    if (failure && !pending) issue.current?.focus();
  }, [failure, pending]);
  const change = (next: Partial<Draft>) => {
    setDraft({ ...draft, ...next });
    setFailure("");
  };
  async function refresh() {
    setRefreshing(true);
    setRefreshFailure(false);
    try {
      await Promise.all(
        ["day-overview", "plan-day", "plan-blocks", "plan-allocation", "tasks", "task-work"].map(resource =>
          client.invalidateQueries(
            { queryKey: queryKeys.resource(state.user!.id, resource).slice(0, 3), refetchType: "active" },
            { throwOnError: true },
          ),
        ),
      );
    } catch {
      setRefreshFailure(true);
    } finally {
      setRefreshing(false);
    }
  }
  async function run(command: Command, retry = false) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailure("");
    try {
      const result = readResult(await command.execute({ retryUnknownResult: retry }));
      setSaved(result);
      setUnknown(null);
      markSaved();
      await refresh();
    } catch (error) {
      setFailure(planFailure(error));
      if (error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol")) setUnknown(command);
      else if (
        error instanceof ApiError &&
        (error.status === 404 ||
          (error.status === 409 && !["schedule_overlap", "schedule_protected"].includes(error.code ?? "")))
      )
        setStale(true);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function reconcile() {
    setRefreshing(true);
    setLatest(null);
    try {
      const [currentDay, currentBlock] = await Promise.all([
        session.api.read("/api/daily-plans/{date}", { path: { date: day.localDate } }),
        base.block ? session.api.read("/api/schedules/{id}", { path: { id: base.block.id } }) : undefined,
      ]);
      setLatest({
        day: readDay(currentDay, day.localDate),
        block: currentBlock ? readSchedule(currentBlock) : undefined,
      });
    } catch (error) {
      setFailure(planFailure(error));
    } finally {
      setRefreshing(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || unknown || stale || saved) return;
    try {
      const common = { expectedPlanningVersion: base.day.planningVersion, reason: draft.reason.trim() || null };
      if (remove && base.block) {
        void run(
          session.api.mutation("/api/schedules/{id}/remove", "post", {
            path: { id: base.block.id },
            body: { ...common, version: base.block.version, allowProtectedChange: draft.protected },
          }),
        );
        return;
      }
      const range = rangeBody(draft, day.localDate, zone);
      if (base.block)
        void run(
          session.api.mutation("/api/schedules/{id}", "put", {
            path: { id: base.block.id },
            body: { ...common, ...range, version: base.block.version, allowProtectedChange: draft.protected },
          }),
        );
      else {
        if (draft.kind === "Work" && !task) throw new RangeError("İş bloğu için yan panelden bir görev seç.");
        void run(
          session.api.mutation("/api/schedules", "post", {
            body: {
              ...common,
              ...range,
              localDate: day.localDate,
              kind: draft.kind,
              taskId: draft.kind === "Work" ? task!.id : null,
            },
          }),
        );
      }
    } catch (error) {
      setFailure(planFailure(error));
    }
  }
  const title = remove ? "Bloğu kaldır" : block ? "Bloğu düzenle" : "Blok ekle";
  return (
    <Surface title={title} modal returnTo={trigger} onClose={requestClose} closeDisabled={pending || refreshing}>
      <p className="relation-title">{block ? titleOf(block) : (task?.title ?? "Mola veya geçiş zamanı")}</p>
      <p className="muted form-hint">
        {day.localDate}. Plan gerçek çalışma kaydı değildir. Sabitlik ve kilit, blok türünden ayrıdır.
      </p>
      {saved ? (
        <div>
          <p role="status">{remove ? "Blok kaldırıldı." : "Plan kaydedildi."} Yeni revizyon oluşturuldu.</p>
          {saved.warnings.length > 0 && (
            <ul aria-label="Plan uyarıları">
              {saved.warnings.map((w, i) => (
                <li key={i}>{warningText(w)}</li>
              ))}
            </ul>
          )}
          {refreshing && <p role="status">Güncel plan okunuyor; yeni işlem için bekle.</p>}
          {refreshFailure && (
            <div role="alert">
              Plan kaydedildi; güncel görünüm alınamadı. Tekrar kaydetme.
              <button onClick={() => void refresh()}>Görünümü yenile</button>
            </div>
          )}
          <button type="button" disabled={refreshing || refreshFailure} onClick={close}>
            Tamam
          </button>
        </div>
      ) : (
        <form aria-label={title} noValidate onSubmit={submit}>
          <fieldset disabled={pending || !!unknown || stale}>
            {remove ? (
              <p>Blok plandan kaldırılır. Görev, gerçek çalışma ve eski revizyonlar korunur.</p>
            ) : (
              <>
                <div className="form-field">
                  <label htmlFor="block-kind">Blok türü</label>
                  <select
                    id="block-kind"
                    disabled={!!block}
                    value={draft.kind}
                    onChange={e => change({ kind: e.target.value as Draft["kind"] })}
                  >
                    {Object.entries(kinds).map(([key, label]) => (
                      <option key={key} value={key} disabled={key === "Work" && !task && !block}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                {(["start", "end"] as const).map(key => (
                  <div className="form-field" key={key}>
                    <label htmlFor={`block-${key}`}>{key === "start" ? "Başlangıç" : "Bitiş"}</label>
                    <TemporalInput
                      id={`block-${key}`}
                      type="datetime-local"
                      step={1}
                      value={draft[key]}
                      required
                      aria-describedby="block-time-help"
                      onChange={e => change({ [key]: e.target.value, [`${key}Choice`]: "" })}
                    />
                    {wallTimeIsAmbiguous(draft[key], zone) && (
                      <>
                        <label htmlFor={`block-${key}-choice`}>
                          {key === "start" ? "Başlangıç hangi oluşum" : "Bitiş hangi oluşum"}
                        </label>
                        <select
                          id={`block-${key}-choice`}
                          value={draft[`${key}Choice`]}
                          onChange={e => change({ [`${key}Choice`]: e.target.value as WallChoice })}
                        >
                          <option value="">Saat iki kez oluşuyor; seç</option>
                          <option value="earlier">İlk oluşum</option>
                          <option value="later">İkinci oluşum</option>
                        </select>
                      </>
                    )}
                  </div>
                ))}
                <p id="block-time-help" className="muted form-hint">
                  Geceyi geçen bloklar gün sınırında bağlı parçalara ayrılır. Saat etiketi gerçek süreyi belirlemez.
                </p>
                <label className="support-toggle">
                  <input type="checkbox" checked={draft.fixed} onChange={e => change({ fixed: e.target.checked })} />{" "}
                  Sabit başlangıç
                </label>
                <label className="support-toggle">
                  <input type="checkbox" checked={draft.locked} onChange={e => change({ locked: e.target.checked })} />{" "}
                  Kilitli blok
                </label>
                <label className="support-toggle">
                  <input
                    type="checkbox"
                    checked={draft.conflicts}
                    onChange={e => change({ conflicts: e.target.checked })}
                  />{" "}
                  Diğer plan bloklarıyla çakışmayı açıkça kabul ediyorum
                </label>
              </>
            )}
            {block && (
              <label className="support-toggle">
                <input
                  type="checkbox"
                  checked={draft.protected}
                  onChange={e => change({ protected: e.target.checked })}
                />{" "}
                Sabit veya kilitli bloğu değiştirmeye izin veriyorum
              </label>
            )}
            <div className="form-field">
              <label htmlFor="block-reason">Neden (isteğe bağlı)</label>
              <textarea
                id="block-reason"
                maxLength={2000}
                rows={2}
                value={draft.reason}
                onChange={e => change({ reason: e.target.value })}
              />
            </div>
            <button className="primary">
              {pending ? "Kaydediliyor…" : remove ? "Kaldırmayı onayla" : "Planı kaydet"}
            </button>
          </fieldset>
        </form>
      )}
      {failure && (
        <div role="alert" tabIndex={-1} ref={issue} className="form-error">
          <p>{failure}</p>
          {unknown && (
            <button disabled={pending} onClick={() => void run(unknown, true)}>
              Aynı isteği güvenle yeniden gönder
            </button>
          )}
          {stale && (
            <>
              <p>İstek otomatik tekrarlanmadı. Güncel değerleri okuyup taslağını karşılaştırabilirsin.</p>
              <button disabled={refreshing} onClick={() => void reconcile()}>
                Güncel planı kontrol et
              </button>
            </>
          )}
        </div>
      )}
      {stale && latest && (
        <section className="reconcile-panel" aria-label="Sunucudaki güncel plan">
          <h3>Sunucudaki güncel plan</h3>
          <p>Plan sürümü {String(latest.day.version)}</p>
          {latest.block && (
            <p>
              {titleOf(latest.block)}: {timeText(latest.block.startsAt, latest.day.timeZoneId)}–
              {timeText(latest.block.endsAt, latest.day.timeZoneId)}
              {latest.block.state === "Removed" && " · Kaldırılmış"}
            </p>
          )}
          {latest.block?.state !== "Removed" && (
            <button
              onClick={() => {
                setBase(latest);
                setStale(false);
                setFailure("");
                setLatest(null);
              }}
            >
              Taslağımı güncel plana uygula
            </button>
          )}
          <p className="muted form-hint">
            Bu seçim kaydetmez. Saatleri ve izinleri kontrol ettikten sonra yeniden kaydet.
          </p>
        </section>
      )}
    </Surface>
  );
}

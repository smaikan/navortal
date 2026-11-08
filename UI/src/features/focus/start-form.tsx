"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { ApiError } from "../../lib/api/errors";
import { queryKeys } from "../../lib/api/query-client";
import { useSession } from "../auth/provider";
import { useTaskCache } from "../tasks/queries";
import { useWork } from "../work/coordinator";
import { announceWorkChange } from "../work/changed";
import { useDialogGuard } from "../work/draft-guard";
import { focusFailure, readFocus, type Settings, type Start } from "./model";
import { TaskChoice } from "./task-choice";
import { miniPlayerFor } from "../mini-player/controller";
import { clockAt } from "./rhythm";

export type Selection = { settings: Settings; presetId?: string; name: string };

/** Başlatma isteği pencerede de sayfada da aynı: tek anahtar, belirsiz sonuçta yalnız açık yeniden deneme. */
export function useFocusStart({
  selection,
  quick = false,
  task,
  done,
}: {
  selection: Selection;
  quick?: boolean;
  task?: { id: string; title: string };
  done: () => void;
}) {
  const { session, state } = useSession();
  const work = useWork();
  const cache = useTaskCache();
  const client = useQueryClient();
  const [mode, setMode] = useState<"general" | "task">(task ? "task" : "general"),
    [taskId, setTaskId] = useState(task?.id ?? "");
  const [pending, setPending] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [saved, setSaved] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [failure, setFailure] = useState("");
  const busy = useRef(false);
  const prepared = useRef<
    | ReturnType<typeof session.api.mutation<"/api/focus-sessions", "post">>
    | ReturnType<typeof session.api.mutation<"/api/support/quick-start", "post">>
    | null
  >(null);
  const locked = pending || uncertain || saved || reviewed || work.busy || !!work.uncertain;
  async function run(retry = false) {
    if (busy.current || saved || reviewed || (uncertain && !retry) || work.busy || work.uncertain) return;
    busy.current = true;
    setPending(true);
    setFailure("");
    let miniTicket: ReturnType<ReturnType<typeof miniPlayerFor>["prepare"]> | undefined;
    let miniAccepted = false;
    try {
      if (!retry) {
        let body: Start = selection.presetId ? { presetId: selection.presetId } : { settings: selection.settings };
        if (mode === "task") {
          if (!taskId) throw new RangeError("Bir görev seç.");
          body = { ...body, taskId };
        }
        prepared.current = quick
          ? session.api.mutation("/api/support/quick-start", "post", {
              body: {
                taskId: body.taskId,
                workSessionId: body.workSessionId,
                workSessionVersion: body.workSessionVersion,
              },
            })
          : session.api.mutation("/api/focus-sessions", "post", { body });
      }
      if (!prepared.current) return;
      miniTicket = miniPlayerFor(session).prepare();
      const result = readFocus(await prepared.current.execute({ retryUnknownResult: retry }));
      if (!cache.current()) return;
      miniAccepted = result.state === "Working" || result.state === "Break";
      setSaved(true);
      setUncertain(false);
      // Makbuz sonraki okumaları beklemeden gösteriliyor. Eski idempotent yanıtı güncel durum saymıyoruz.
      client.setQueryData(queryKeys.resource(state.user!.id, "focus-current"), {
        session: result,
        serverNow: result.serverNow,
        receivedAt: performance.now(),
      });
      announceWorkChange(client, state.user!.id);
      void work.refresh();
      void client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, "focus-current") });
      void client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, "focus-list").slice(0, 3) });
      done();
    } catch (error) {
      if (!cache.current()) return;
      if (prepared.current && error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol"))
        setUncertain(true);
      setFailure(error instanceof RangeError ? error.message : focusFailure(error));
      if (error instanceof ApiError && error.status === 409) {
        void client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, "focus-current") });
        void work.refresh();
      }
    } finally {
      miniTicket?.settle(miniAccepted);
      busy.current = false;
      setPending(false);
    }
  }
  async function review() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const { readCurrent } = await import("./model");
      const value = readCurrent(await session.api.read("/api/focus-sessions/current"));
      if (!cache.current()) return;
      client.setQueryData(queryKeys.resource(state.user!.id, "focus-current"), {
        ...value,
        receivedAt: performance.now(),
      });
      setReviewed(true);
      setUncertain(false);
      setFailure("");
      void work.refresh();
    } catch (error) {
      if (cache.current()) setFailure(focusFailure(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return {
    mode,
    setMode,
    taskId,
    setTaskId,
    pending,
    uncertain,
    saved,
    reviewed,
    failure,
    locked,
    workUncertain: !!work.uncertain,
    run,
    review,
  };
}
type StartState = ReturnType<typeof useFocusStart>;

/** Genel odak veya görev; görev listesi aynı yerde açılıyor. */
export function StartFields({ start, task }: { start: StartState; task?: { id: string; title: string } }) {
  return (
    <fieldset className="focus-target" disabled={start.locked}>
      <legend>Neye odaklanacaksın?</legend>
      <div className="segmented">
        {(
          [
            ["general", "Genel odak"],
            ["task", "Bir görev seç"],
          ] as const
        ).map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="focus-start-mode"
              value={value}
              checked={start.mode === value}
              onChange={() => {
                start.setMode(value);
                start.setTaskId("");
              }}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {start.mode === "general" ? (
        <p className="muted">Bir göreve bağlamadan kendi ritminde çalış.</p>
      ) : (
        <TaskChoice value={start.taskId} selected={task} choose={start.setTaskId} />
      )}
    </fieldset>
  );
}

export function StartFeedback({ start }: { start: StartState }) {
  return (
    <>
      {start.failure && (
        <p className="form-error" role="alert">
          {start.failure}
        </p>
      )}
      {start.workUncertain && <p>Önce çalışma başlatma sonucunu kontrol et. Odak henüz başlatılmadı.</p>}
      {start.uncertain && (
        <div className="focus-uncertain">
          <p>Sonuç belirsiz. Yeni başlatma engellendi; aynı komut aynı işlem kimliğiyle yeniden denenebilir.</p>
          <div className="actions">
            <button type="button" disabled={start.pending} onClick={() => void start.run(true)}>
              Aynı odak başlatmayı güvenle yeniden dene
            </button>
            <button type="button" disabled={start.pending} onClick={() => void start.review()}>
              Başlatma sonucunu kontrol et
            </button>
          </div>
        </div>
      )}
      {start.reviewed && (
        <p role="status">Güncel durum okundu. Başlatma tekrarlanmadı; ana alandaki güncel kaydı kontrol et.</p>
      )}
    </>
  );
}

/** Sayfada seçili ritmin altında duran başlatma alanı. Kendi başına kapanmıyor; odak başlayınca sayfa onu kaldırıyor. */
export function StartSection({
  selection,
  zone,
  started,
  hold,
  disabled = false,
}: {
  selection: Selection;
  zone: string;
  started: () => void;
  hold: (open: boolean) => void;
  /** Güncel odak okunamıyorsa veya başka bir komut sürüyorsa başlatma beklemede. */
  disabled?: boolean;
}) {
  const start = useFocusStart({ selection, done: started });
  const busy = start.pending || start.uncertain;
  useDialogGuard({
    dirty: false,
    pending: busy || start.workUncertain,
    close: noop,
    trigger: null,
    message: "Odak başlatma seçimini bırakmak istiyor musun?",
  });
  useEffect(() => {
    hold(busy);
    return () => hold(false);
  }, [busy, hold]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const s = selection.settings;
  return (
    <div className="focus-start">
      <StartFields start={start} />
      <StartFeedback start={start} />
      <div className="focus-start-footer">
        <div>
          <p>
            Şimdi başlarsan hedef <strong>{clockAt(now + s.workSeconds * 1000, zone)}</strong> saatinde dolar.
          </p>
          <p className="muted">
            {s.targetBehavior === "AutoBreak" ? "Hedef dolunca mola başlar" : "Hedef dolunca saymaya devam eder"} ·{" "}
            {s.soundEnabled ? "Ses açık" : "Ses kapalı"}
          </p>
        </div>
        <button
          type="button"
          className="primary focus-start-button"
          disabled={start.locked || disabled}
          onClick={() => void start.run()}
        >
          <Play aria-hidden="true" size={16} fill="currentColor" />
          {start.pending ? "Başlatılıyor…" : "Pomodoroyu başlat"}
        </button>
      </div>
    </div>
  );
}
const noop = () => {};

/** Seçim değişince başlatma durumu sıfırlanıyor; yükleyici bağlı kalıyor. */
export function InlineStart(props: Parameters<typeof StartSection>[0] & { selectionKey: string }) {
  const { selectionKey, ...rest } = props;
  return <StartSection key={selectionKey} {...rest} />;
}

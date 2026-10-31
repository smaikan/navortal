"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Surface } from "../../components/ui/surface";
import { ApiError } from "../../lib/api/errors";
import { queryKeys } from "../../lib/api/query-client";
import { useSession } from "../auth/provider";
import { useTaskCache } from "../tasks/queries";
import { useWork } from "../work/coordinator";
import { announceWorkChange } from "../work/changed";
import { useDialogGuard } from "../work/draft-guard";
import { focusFailure, readFocus, settingsLabel, type Settings, type Start } from "./model";

import { TaskChoice } from "./task-choice";
import { miniPlayerFor } from "../mini-player/controller";

type Selection = { settings: Settings; presetId?: string; name: string };
export function StartDialog({
  selection,
  trigger,
  close,
  quick = false,
  immediate = false,
  task,
}: {
  quick?: boolean;
  /** Görev zaten seçiliyse onay beklemeden başlatır; sayfada kalır. Hata/belirsiz sonuçta pencere açık kalır. */
  immediate?: boolean;
  /** Sadece 5 dakika açılınca görev zaten aranmış ve seçilmiş oluyor. */
  task?: { id: string; title: string };
  selection: Selection;
  zone: string;
  trigger: HTMLElement;
  close: () => void;
}) {
  const { session, state } = useSession();
  const work = useWork();
  const cache = useTaskCache();
  const client = useQueryClient();
  const router = useRouter();
  const [mode, setMode] = useState(task ? "task" : "general"),
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
  const guard = useDialogGuard({
    dirty: false,
    pending: pending || uncertain || !!work.uncertain,
    close,
    trigger,
    message: "Odak başlatma seçimini bırakmak istiyor musun?",
  });
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
      guard.markSaved();
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
      close();
      if (quick && !immediate) router.push("/focus");
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
  const started = useRef(false);
  useEffect(() => {
    if (!immediate || !task || started.current) return;
    started.current = true;
    void run();
    // Yalnız açılışta bir kez; run sonraki tıklamalarda da aynı korumaları kullanır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
      guard.markSaved();
      void work.refresh();
    } catch (error) {
      if (cache.current()) setFailure(focusFailure(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <Surface
      title={quick ? "Beş dakika başla" : "Pomodoro başlat"}
      modal
      returnTo={trigger}
      onClose={guard.requestClose}
      closeDisabled={pending || uncertain || !!work.uncertain}
    >
      <div className="focus-form">
        <p>
          <strong>{selection.name}</strong> · {settingsLabel(selection.settings)}
        </p>
        <fieldset disabled={locked}>
          <legend>Neye odaklanacaksın?</legend>
          <label>
            Başlatma türü
            <select
              value={mode}
              onChange={e => {
                setMode(e.target.value);
                setTaskId("");
              }}
            >
              <option value="general">Genel odak</option>
              <option value="task">Görev seç</option>
            </select>
          </label>
          {mode === "general" && <p>Bir göreve bağlamadan kendi ritminde çalış.</p>}
          {mode === "task" && <TaskChoice value={taskId} selected={task} choose={setTaskId} />}
        </fieldset>
        {failure && (
          <p className="form-error" role="alert">
            {failure}
          </p>
        )}
        {work.uncertain && <p>Önce çalışma başlatma sonucunu kontrol et. Odak henüz başlatılmadı.</p>}
        {uncertain && (
          <>
            <p>Sonuç belirsiz. Yeni başlatma engellendi; aynı komut aynı işlem kimliğiyle yeniden denenebilir.</p>
            <button disabled={pending} onClick={() => void run(true)}>
              Aynı odak başlatmayı güvenle yeniden dene
            </button>
            <button disabled={pending} onClick={() => void review()}>
              Başlatma sonucunu kontrol et
            </button>
          </>
        )}
        {reviewed && (
          <p role="status">Güncel durum okundu. Başlatma tekrarlanmadı; ana alandaki güncel kaydı kontrol et.</p>
        )}
        {saved && (
          <p role="status">
            Odak oturumu başlatıldı.{" "}
            {quick
              ? "Beş dakikalık hedefi odak ekranından takip edebilirsin."
              : "Güncel durum ana alanda gösteriliyor."}
          </p>
        )}
        <div className="actions">
          <button className="primary" disabled={locked} onClick={() => void run()}>
            {pending ? "Başlatılıyor…" : "Pomodoroyu başlat"}
          </button>
          <button disabled={pending || uncertain || !!work.uncertain} onClick={guard.requestClose}>
            {saved || reviewed ? (quick ? "Kapat" : "Pomodoroya dön") : "Vazgeç"}
          </button>
        </div>
      </div>
    </Surface>
  );
}

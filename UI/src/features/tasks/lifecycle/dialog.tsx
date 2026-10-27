"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Surface } from "../../../components/ui/surface";
import { subscribeTraversal } from "../../../lib/navigation/traversal";
import { ApiError } from "../../../lib/api/errors";
import { useSession } from "../../auth/provider";
import { states, type Task } from "../model";
import { useTaskCache } from "../queries";
import { useOptionalWork } from "../../work/coordinator";
import { readProgress, type Progress } from "../work/model";
import {
  actionNames,
  hasChildren,
  initialChoice,
  isDisposition,
  lifeFailure,
  ownWorkLabel,
  readLifeTask,
  stateAlreadyMatches,
  stateBody,
  type Choice,
  type LifeCommand,
} from "./model";

export function LifecycleDialog({
  id,
  command,
  policy,
  close,
}: {
  id: string;
  command: LifeCommand;
  policy: string;
  close: () => void;
}) {
  const { session } = useSession();
  const cache = useTaskCache();
  const [base, setBase] = useState<Task | null>(null);
  const [children, setChildren] = useState(false);
  const [round, setRound] = useState(0);
  const [choice, setChoice] = useState<Choice>(() => initialChoice(policy));
  const [dirty, setDirty] = useState(false);
  const [reason, setReason] = useState("");
  const [submittedReason, setSubmittedReason] = useState<string | null>(null);
  const work = useOptionalWork();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [done, setDone] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [inspection, setInspection] = useState<{ task: Task; progress: Progress } | null>(null);
  const busy = useRef(false);
  const guard = useRef({ dirty, pending });
  const errorBox = useRef<HTMLDivElement>(null);
  const title = command.kind === "required" ? "Üst görev zorunluluğunu değiştir" : actionNames[command.action];
  const isComplete = command.kind === "state" && command.action === "Complete";
  const disposition = command.kind === "state" && isDisposition(command.action);
  const already = !done && !!base && command.kind === "state" && stateAlreadyMatches(base, command.action);
  useLayoutEffect(() => {
    guard.current = { dirty, pending };
  }, [dirty, pending]);
  useLayoutEffect(() => {
    if (failure && !pending) errorBox.current?.focus();
  }, [failure, pending]);
  useEffect(() => {
    const controller = new AbortController();
    const read = async () => {
      const [task, page] = await Promise.all([
        session.api.read("/api/tasks/{id}", { path: { id }, signal: controller.signal }),
        isComplete
          ? session.api.read("/api/tasks/children", {
              query: { parentId: id, offset: 0, limit: 1, includeArchived: false },
              signal: controller.signal,
            })
          : null,
      ]);
      const value = readLifeTask(task, id);
      const childScope = page ? hasChildren(page, id) : false;
      if (!controller.signal.aborted && cache.current()) {
        setBase(value);
        setChildren(childScope);
      }
    };
    void read().catch(error => {
      if (!controller.signal.aborted && cache.current()) setFailure(lifeFailure(error));
    });
    return () => controller.abort();
    // Her açık hazırlık için tek sürüm/kapsam sabitlenir. Yeniden okuma niyeti değiştirmesin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isComplete, round, session]);
  function allow() {
    return (
      !guard.current.pending &&
      (!guard.current.dirty || window.confirm("Kaydedilmemiş seçim veya gerekçe silinecek. Devam edilsin mi?"))
    );
  }
  function requestClose() {
    if (!allow()) return false;
    close();
    requestAnimationFrame(() => {
      const trigger = command.trigger.isConnected
        ? command.trigger
        : document.querySelector<HTMLElement>("[data-workspace-surface] h2");
      trigger?.focus({ preventScroll: true });
    });
  }
  useEffect(() => {
    const href = location.href;
    const unsubscribe = subscribeTraversal(event => {
      if (location.href === href) return;
      if (!allow()) {
        event.stopImmediatePropagation();
        history.pushState({}, "", href);
      } else close();
    }, 100);
    const unload = (event: BeforeUnloadEvent) => {
      if (guard.current.dirty || guard.current.pending) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", unload);
    };
  }, [close]);
  function prepare() {
    setBase(null);
    setFailure("");
    setBlocked(false);
    setUnknown(false);
    setInspection(null);
    setChoice("");
    setDirty(reason !== "");
    setDone("");
    setSubmittedReason(null);
    setRound(value => value + 1);
  }
  async function execute() {
    if (!base || busy.current || blocked || done || base.archivedAt) return;
    let body;
    try {
      if (command.kind === "state") body = stateBody(base, command.action, children, choice, reason);
    } catch (error) {
      setFailure(lifeFailure(error));
      return;
    }
    busy.current = true;
    guard.current.pending = true;
    setPending(true);
    setFailure("");
    try {
      const raw =
        command.kind === "required"
          ? await session.api
              .mutation("/api/tasks/{id}/required", "put", {
                path: { id },
                body: { version: base.version, requiredForParent: command.required },
              })
              .execute()
          : await session.api.mutation("/api/tasks/{id}/state", "post", { path: { id }, body: body! }).execute();
      let result;
      try {
        result = readLifeTask(raw, id);
      } catch {
        throw new ApiError("protocol", "Yanıt eksik.", 200, undefined, {}, undefined, undefined, true);
      }
      if (!cache.current()) return;
      setBase(result);
      setDirty(false);
      setInspection(null);
      setSubmittedReason(body?.reason ?? null);
      void cache.treeChanged(result);
      // Bitir/ertele/iptal sunucuda açık çalışma parçasını kapatır. Oynatıcı yeniden okur.
      void work?.refresh();
      if (cache.current())
        setDone(
          command.kind === "required"
            ? `Zorunluluk kaydedildi: ${result.requiredForParent ? "Üst görevin tamamlanması için zorunlu" : "İsteğe bağlı alt iş"}.`
            : `Görev durumu: ${states[result.state]}. ${ownWorkLabel(result)}.`,
        );
    } catch (error) {
      if (cache.current()) {
        setUnknown(error instanceof ApiError && error.outcomeUnknown);
        setBlocked(error instanceof ApiError && (error.outcomeUnknown || error.status === 409 || error.status === 404));
        setFailure(lifeFailure(error));
      }
    } finally {
      busy.current = false;
      guard.current.pending = false;
      setPending(false);
    }
  }
  async function inspect() {
    if (busy.current) return;
    busy.current = true;
    guard.current.pending = true;
    setPending(true);
    try {
      const [task, progress] = await Promise.all([
        session.api.read("/api/tasks/{id}", { path: { id } }),
        session.api.read("/api/tasks/{id}/progress", { path: { id } }),
      ]);
      const value = { task: readLifeTask(task, id), progress: readProgress(progress, id) };
      if (cache.current()) {
        setInspection(value);
        await cache.treeChanged(value.task);
      }
    } catch (error) {
      if (cache.current()) setFailure(lifeFailure(error));
    } finally {
      busy.current = false;
      guard.current.pending = false;
      setPending(false);
    }
  }
  return (
    <Surface title={title} modal returnTo={command.trigger} onClose={requestClose}>
      {!base ? (
        failure ? (
          <div role="alert" className="form-error">
            <p>{failure}</p>
            <button onClick={prepare}>Güncel görevi yeniden yükle</button>
          </div>
        ) : (
          <p role="status">Görev ve işlem kapsamı okunuyor…</p>
        )
      ) : (
        <>
          <p>{base.title}</p>
          <p className="muted">Şimdiki durum: {states[base.state]}</p>
          {already && (
            <p role="alert" className="form-notice">
              Görev zaten bu durumda. Başka bir durum seçmek için işlemden vazgeç.
            </p>
          )}
          <fieldset disabled={pending || blocked || !!done || !!base.archivedAt || already}>
            {command.kind === "required" ? (
              <p>
                {command.required
                  ? "Bu alt iş tamamlanmadan üst görev otomatik tamamlanamaz."
                  : "Bu alt iş isteğe bağlı kalır. Üst görev otomatik tamamlanabilir; açık alt iş kaybolmaz."}
              </p>
            ) : isComplete ? (
              <>
                <p>Görevi tamamlamak ilgili açık çalışmayı kapatır; gerçek süre ve geçmiş korunur.</p>
                {children && (
                  <div className="hours-field">
                    <label htmlFor="parent-completion-choice">Alt görevler için kararın</label>
                    <select
                      id="parent-completion-choice"
                      value={choice}
                      onChange={event => {
                        setChoice(event.target.value as Choice);
                        setDirty(true);
                      }}
                    >
                      <option value="">Bir seçenek seç</option>
                      <option value="ParentOnly">Yalnız üst görevi tamamla; açık altlar kalsın</option>
                      <option value="CompleteSubtree">Bütün alt görevleri de tamamla</option>
                    </select>
                    <p className="muted form-hint">
                      Yalnız üstü tamamlamak alt görevleri silmez. Bütün altları seçmek açık alt işlerin çalışmasını da
                      kapatır. Kayıtlı tamamlama tercihin varsa başlangıç seçimi olarak gösterilir.
                    </p>
                  </div>
                )}
              </>
            ) : disposition ? (
              <>
                <p>
                  {command.action === "Defer"
                    ? "Bu görev ertelenmiş olarak işaretlenir. Başka bir güne kendiliğinden planlanmaz."
                    : command.action === "Skip"
                      ? "Bu iş atlanmış olarak işaretlenir; tamamlanmış sayılmaz."
                      : "Bu iş iptal edilmiş olarak işaretlenir; tamamlanmış sayılmaz."}
                </p>
                <p>
                  Bu işlem seçtiğin göreve uygulanır; alt görevlerin durumları korunur. Üstlerin ilerlemesi yeniden
                  değerlendirilir. Varsa bu görevin gelecek plan blokları kaldırılır, başlamış plan bloğu şu ana
                  kısaltılır. Açık çalışma kapanır; gerçek çalışma ve geçmiş kayıtlar korunur.
                </p>
                <div className="hours-field">
                  <label htmlFor="task-state-reason">Gerekçe (isteğe bağlı)</label>
                  <textarea
                    id="task-state-reason"
                    rows={4}
                    maxLength={2000}
                    value={reason}
                    aria-describedby="task-state-reason-help"
                    onChange={event => {
                      setReason(event.target.value);
                      setDirty(true);
                    }}
                  />
                  <p id="task-state-reason-help" className="muted form-hint">
                    En çok 2000 karakter. {reason.length}/2000
                  </p>
                </div>
              </>
            ) : command.action === "Reopen" ? (
              <p>
                Bu görev yeniden açılır. Alt görevlerin durumları ve bitmiş çalışma oturumları geri alınmaz. Önceden
                kaldırılan plan blokları kendiliğinden geri eklenmez. Otomatik tamamlanan üstler sunucuda yeniden
                değerlendirilebilir.
              </p>
            ) : command.action === "CompleteDirectWork" ? (
              <p>
                Yalnız bu görevin kendi işi tamamlanır; alt görevler değiştirilmez. Bütün zorunlu işler hazırsa görev ve
                üstleri otomatik tamamlanabilir. Açık çalışma ilgili durum geçişine göre kapanır.
              </p>
            ) : (
              <p>
                Yalnız bu görevin kendi işi yeniden açılır. Bitmiş çalışma kayıtları yeniden başlatılmaz; üstlerin
                ilerlemesi sunucuda değerlendirilir.
              </p>
            )}
            {base.archivedAt && <p role="alert">Bu görev arşivlenmiş.</p>}
            <div className="actions">
              <button className="primary" onClick={() => void execute()}>
                {pending
                  ? "Kaydediliyor…"
                  : command.kind === "required"
                    ? "Zorunluluğu kaydet"
                    : actionNames[command.action]}
              </button>
            </div>
          </fieldset>
          {failure && (
            <div role="alert" ref={errorBox} tabIndex={-1} className="form-error">
              <p>{failure}</p>
              {blocked && (
                <button disabled={pending} onClick={() => void inspect()}>
                  Sunucudaki durumu kontrol et
                </button>
              )}
            </div>
          )}
          {inspection && (
            <section aria-label="Sunucudaki görev durumu" className="reconcile-panel">
              <h3>Sunucudaki görev durumu</h3>
              <p>
                {states[inspection.task.state]} · {ownWorkLabel(inspection.task)}
              </p>
              <p>
                {inspection.task.requiredForParent ? "Üstü için zorunlu" : "İsteğe bağlı"} ·{" "}
                {inspection.progress.hasOpenDescendants ? "Altında açık görevler var" : "Altında açık görev yok"}
              </p>
              <p className="muted">
                {unknown
                  ? "Önceki istek uygulanmış olabilir. Bu okuma mevcut durumu gösterir; hiçbir yazı otomatik tekrarlanmaz."
                  : "Görev veya işlem kapsamı değişmiş olabilir. Güncel değerleri incele; yeni komut için ayrıca yeniden hazırlan."}
              </p>
              <button disabled={pending} onClick={prepare}>
                Kontrol ettim, yeni işlem hazırla
              </button>
            </section>
          )}
          <p role="status" className="task-feedback">
            {done}
          </p>
          {done && disposition && (
            <section aria-label="Gönderdiğin gerekçe" className="reconcile-panel">
              <h3>Gönderdiğin gerekçe</h3>
              <p className="task-description">{submittedReason || "Gerekçe belirtmedin."}</p>
              <p className="muted form-hint">
                Bu, az önce gönderdiğin metindir. Görev ayrıntısı yanıtı geçmiş gerekçeleri geri getirmez.
              </p>
            </section>
          )}
        </>
      )}
      <div className="actions">
        <button disabled={pending} onClick={requestClose}>
          İşlemden vazgeç
        </button>
      </div>
    </Surface>
  );
}

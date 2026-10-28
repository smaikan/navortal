"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useSession } from "../auth/provider";
import { ApiError } from "../../lib/api/errors";
import { estimateText, isOffline, offlineWrite, priorities, states, type Task } from "../tasks/model";
import { useTaskCache, useTasks } from "../tasks/queries";
import {
  blocksClassification,
  classificationFailure,
  readClassification,
  type Classification,
} from "../tasks/classification/model";
import { membershipBody, membershipField, type MembershipKind } from "./task-membership";
import { resourceKinds, resourceTaskPageSize } from "./model";

export function ResourceTaskPicker({
  kind,
  id,
  reportPending,
}: {
  kind: MembershipKind;
  id: string;
  reportPending: (pending: boolean) => void;
}) {
  const { session } = useSession();
  const cache = useTaskCache();
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);
  const [done, setDone] = useState("");
  const [confirmed, setConfirmed] = useState<Record<string, Classification>>({});
  const busy = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const field = membershipField[kind];
  const meta = resourceKinds[kind];
  const tasks = useTasks({
    offset,
    limit: resourceTaskPageSize,
    search: search || undefined,
    includeArchived: false,
    includeCompleted: true,
    excludeRecurring: true,
    orderBy: "Title",
  });
  useLayoutEffect(() => input.current?.focus(), []);
  useLayoutEffect(() => {
    if (failure && !pending) errorBox.current?.focus();
  }, [failure, pending]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(text.trim());
      setOffset(0);
    }, 200);
    return () => clearTimeout(timer);
  }, [text]);
  useEffect(() => () => reportPending(false), [reportPending]);
  function value(task: Task) {
    const saved = confirmed[task.id];
    return saved && BigInt(saved.version) >= BigInt(task.version) ? saved.values[field] : task[field];
  }
  function remember(result: Classification) {
    setConfirmed(current => ({ ...current, [result.taskId]: result }));
    void cache.manyChanged();
  }
  async function change(task: Task, checked: boolean, control: HTMLInputElement) {
    if (busy.current || blocked) return;
    if (isOffline()) {
      setDone("");
      setFailure(offlineWrite);
      return;
    }
    const restoreFocus = document.activeElement === control;
    let succeeded = false;
    busy.current = true;
    setPending(task.id);
    reportPending(true);
    setFailure("");
    setDone("");
    try {
      const latest = readClassification(
        await session.api.read("/api/tasks/{id}/classification", { path: { id: task.id } }),
        task.id,
      );
      if (!cache.current()) return;
      const body = membershipBody(latest, kind, id, value(task), checked);
      let result = latest;
      if (body) {
        const raw = await session.api
          .mutation("/api/tasks/{id}/classification", "put", { path: { id: task.id }, body })
          .execute();
        try {
          result = readClassification(raw, task.id);
        } catch {
          throw new ApiError("protocol", "Yanıt eksik.", 200, undefined, {}, undefined, undefined, true);
        }
      }
      if (!cache.current()) return;
      remember(result);
      succeeded = true;
      setDone(
        checked
          ? `Görev ${kind === "projects" ? "projeye" : "havuza"} eklendi.`
          : `Görev ${meta.locative}ki listeden kaldırıldı.`,
      );
    } catch (error) {
      if (!cache.current()) return;
      setBlocked(blocksClassification(error) ? task.id : null);
      setFailure(classificationFailure(error));
    } finally {
      busy.current = false;
      setPending(null);
      reportPending(false);
      if (succeeded && restoreFocus)
        requestAnimationFrame(() => {
          if (control.isConnected && document.activeElement === document.body) control.focus({ preventScroll: true });
        });
    }
  }
  async function inspect() {
    if (!blocked || busy.current) return;
    busy.current = true;
    setPending(blocked);
    reportPending(true);
    try {
      const latest = readClassification(
        await session.api.read("/api/tasks/{id}/classification", { path: { id: blocked } }),
        blocked,
      );
      if (!cache.current()) return;
      remember(latest);
      setFailure("");
      setBlocked(null);
      setDone("Güncel görev bağı yüklendi.");
    } catch (error) {
      if (cache.current()) setFailure(classificationFailure(error));
    } finally {
      busy.current = false;
      setPending(null);
      reportPending(false);
    }
  }
  return (
    <section className="resource-picker" aria-label={`${meta.singular} için görev seç`}>
      <p className="muted form-hint" id={`${kind}-picker-hint`}>
        İşaretlediğin görev hemen eklenir. İşareti kaldırmak görevi yalnız bu listeden çıkarır.
      </p>
      <div className="resource-picker-search">
        <Search size={18} aria-hidden="true" />
        <label htmlFor={`${kind}-task-search`} className="sr-only">
          Görevlerde ara
        </label>
        <input
          ref={input}
          id={`${kind}-task-search`}
          type="search"
          placeholder="Görev adıyla ara…"
          autoComplete="off"
          maxLength={200}
          value={text}
          onChange={event => setText(event.target.value)}
        />
      </div>
      {failure && (
        <div className="form-error" role="alert" ref={errorBox} tabIndex={-1}>
          <p>{failure}</p>
          {blocked && (
            <button type="button" disabled={!!pending} onClick={() => void inspect()}>
              Güncel görev bağını kontrol et
            </button>
          )}
        </div>
      )}
      {tasks.isError && (
        <div role="alert" className="form-error">
          <p>Görev listesi alınamadı.</p>
          <button type="button" onClick={() => void tasks.refetch()}>
            Görevleri yeniden yükle
          </button>
        </div>
      )}
      {tasks.isPending && <p role="status">Görevler okunuyor…</p>}
      <p role="status" className="resource-picker-feedback">
        {pending ? "Görev bağı kaydediliyor…" : done}
      </p>
      {tasks.data && (
        <>
          <ul className="resource-choices" aria-label="Seçilebilir görevler" aria-describedby={`${kind}-picker-hint`}>
            {tasks.data.items.map(task => {
              const membership = value(task);
              const checked = membership === id;
              return (
                <li key={task.id}>
                  <label className={`resource-choice${checked ? " is-selected" : ""}`}>
                    <input
                      type="checkbox"
                      aria-label={task.title}
                      checked={checked}
                      disabled={!!pending || !!blocked || text.trim() !== search}
                      onChange={event => void change(task, event.target.checked, event.currentTarget)}
                    />
                    <span className="resource-choice-content">
                      <span className="resource-choice-title">{task.title}</span>
                      <span className="resource-choice-facts">
                        <span>{states[task.state]}</span>
                        <span>{priorities[task.priority]} öncelik</span>
                        <span>
                          {task.hasDirectWork
                            ? estimateText(task.directEstimatedSeconds) || "Tahmin yok"
                            : "Kapsayıcı görev"}
                        </span>
                      </span>
                      {membership && !checked && (
                        <span className="resource-choice-note">
                          {kind === "projects" ? "Diğer projeden buraya taşınır" : "Diğer havuzdan buraya taşınır"}
                        </span>
                      )}
                    </span>
                    {checked && (
                      <span className="resource-choice-added" aria-hidden="true">
                        Eklendi
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
          {!tasks.data.items.length && (
            <p className="relation-empty">
              {search
                ? "Bu aramada görev yok. Başka bir adla arayabilirsin."
                : "Henüz görev yok. Görevler sayfasından bir görev oluşturabilirsin."}
            </p>
          )}
          {(offset > 0 || Number(tasks.data.total) > resourceTaskPageSize) && (
            <nav className="task-pagination resource-picker-pages" aria-label="Görev seçimi sayfaları">
              <button
                type="button"
                disabled={!offset || tasks.isPending || !!pending || text.trim() !== search}
                onClick={() => setOffset(n => Math.max(0, n - resourceTaskPageSize))}
              >
                Önceki
              </button>
              <span className="muted">{tasks.data.total} görev</span>
              <button
                type="button"
                disabled={
                  offset + resourceTaskPageSize >= Number(tasks.data.total) ||
                  offset >= 100000 ||
                  tasks.isPending ||
                  !!pending ||
                  text.trim() !== search
                }
                onClick={() => setOffset(n => n + resourceTaskPageSize)}
              >
                Sonraki
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

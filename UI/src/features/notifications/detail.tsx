"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Surface } from "../../components/ui/surface";
import { Menu } from "../../components/ui/menu";
import { useSession } from "../auth/provider";
import { useTask } from "../tasks/queries";
import { useDialogGuard } from "../work/draft-guard";
import { useNotification } from "./queries";
import { useNotificationCache } from "./cache";
import { failure, kinds, mustReconcile, readNotification, stamp, states } from "./model";

export function NotificationDetail({
  id,
  zone,
  trigger,
  close,
}: {
  id: string;
  zone: string;
  trigger: HTMLElement;
  close: () => void;
}) {
  const query = useNotification(id);
  const { session } = useSession();
  const cache = useNotificationCache();
  const [pending, setPending] = useState(false),
    [blocked, setBlocked] = useState(false),
    [issue, setIssue] = useState(""),
    [message, setMessage] = useState("");
  const busy = useRef(false);
  const guard = useDialogGuard({ dirty: false, pending, close, trigger, message: "Bildirim işlemi bekleniyor." });
  async function command(action: "read" | "snooze") {
    if (!query.data || busy.current || blocked) return;
    busy.current = true;
    setPending(true);
    setIssue("");
    setMessage("");
    try {
      const options = { path: { id }, body: { version: query.data.version } };
      const raw = await (
        action === "read"
          ? session.api.mutation("/api/notifications/{id}/read", "post", options)
          : session.api.mutation("/api/notifications/{id}/snooze", "post", options)
      ).execute();
      const n = readNotification(raw, id);
      if (!cache.current()) return;
      setMessage(action === "read" ? "Okundu olarak kaydedildi." : "Bildirim ertelendi.");
      cache.changed(n);
    } catch (e) {
      if (cache.current()) {
        setIssue(failure(e));
        setBlocked(mustReconcile(e));
      }
    } finally {
      busy.current = false;
      if (cache.current()) setPending(false);
    }
  }
  async function check() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    const result = await query.refetch();
    if (cache.current()) {
      if (result.isError) setIssue(failure(result.error));
      else {
        setBlocked(false);
        setIssue("");
        setMessage("Güncel bildirim okundu. İşlem kendiliğinden tekrarlanmadı.");
      }
      setPending(false);
    }
    busy.current = false;
  }
  const n = query.data;
  return (
    <Surface title="Bildirim ayrıntısı" modal returnTo={trigger} closeDisabled={pending} onClose={guard.requestClose}>
      {!n && query.isPending && <p role="status">Bildirim okunuyor…</p>}
      {query.isError && (
        <p role="alert">
          {failure(query.error)}
          <button onClick={() => void check()} disabled={pending}>
            Bildirimi yeniden yükle
          </button>
        </p>
      )}
      {n && (
        <>
          <h3>{n.title ?? kinds[n.kind as keyof typeof kinds]}</h3>
          <p>
            {states[n.state]} · {n.readAt ? "Okundu" : "Okunmadı"}
          </p>
          <dl className="task-metrics">
            <dt>Olay zamanı</dt>
            <dd>{stamp(n.occurredAt, zone)}</dd>
            <dt>Hazır olma zamanı</dt>
            <dd>{stamp(n.readyAt, zone)}</dd>
            <dt>En erken yeniden gösterim</dt>
            <dd>{stamp(n.notBefore, zone)}</dd>
            <dt>Okunma zamanı</dt>
            <dd>{stamp(n.readAt, zone)}</dd>
            <dt>Erteleme sayısı</dt>
            <dd>{n.snoozeCount}</dd>
          </dl>
          <p className="muted">Hazır olma zamanı, cihazına teslim edildiği anlamına gelmez.</p>
          <section aria-label="Bildirim kaynağı">
            <h3>İlgili çalışma</h3>
            {n.taskId ? <TaskSource id={n.taskId} pending={pending} /> : <p>Bu bildirim bir göreve bağlı değil.</p>}
            {!pending && ["FocusTarget", "BreakEnd"].includes(n.kind) && (
              <Link href="/focus" prefetch={false}>
                Güncel odak oturumunu aç
              </Link>
            )}
          </section>
          <div className="actions">
            <button disabled={pending || blocked || n.readAt !== null} onClick={() => void command("read")}>
              Okundu işaretle
            </button>
            <Menu
              label="Bildirim işlemleri"
              items={[
                {
                  label: "Tercihlerdeki süreyle ertele",
                  disabled: pending || blocked || !["Pending", "Ready"].includes(n.state),
                  onSelect: () => void command("snooze"),
                },
              ]}
            />
          </div>
        </>
      )}
      {pending && <p role="status">İşlem bekleniyor…</p>}
      {message && <p role="status">{message}</p>}
      {issue && (
        <div role="alert" className="form-error">
          <p>{issue}</p>
          {blocked && (
            <button disabled={pending} onClick={() => void check()}>
              Güncel bildirimi kontrol et
            </button>
          )}
        </div>
      )}
    </Surface>
  );
}
function TaskSource({ id, pending }: { id: string; pending: boolean }) {
  const task = useTask(id);
  return task.data ? (
    pending ? (
      <p>{task.data.title}</p>
    ) : (
      <Link className="button" href={`/tasks?taskId=${id}`} prefetch={false}>
        Görevi aç: {task.data.title}
      </Link>
    )
  ) : task.isError ? (
    <p>İlgili görev artık erişilebilir değil.</p>
  ) : (
    <p>İlgili görev okunuyor…</p>
  );
}

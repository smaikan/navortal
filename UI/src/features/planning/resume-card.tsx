"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { useWork } from "../work/coordinator";
import { readTask } from "../tasks/model";
import { span } from "./glance";
import { useDaySignals } from "./signals-queries";
import { isUnread } from "../notifications/unread";
import { presentResume } from "../push/presentation";

const hiddenKey = (owner: string, date: string) => `adhd.resume.hidden.v1:${owner}:${date}`;
const hidden = (owner: string, date: string) => {
  try {
    return localStorage.getItem(hiddenKey(owner, date)) === "1";
  } catch {
    return false;
  }
};

/** Hiçbir iş çalışmıyorsa ve son oturum dönüş eşiğinden önce bitmiş/durmuşsa son görev, süre, not ve adımla Devam et gösterilir. Eşik işe dönüş tercihinden, kapalıysa 30 dakika. Kapat yalnız bu günü gizler; veri yoksa kart yok. */
export function ResumeCard({ date, thresholdSeconds }: { date: string; thresholdSeconds: number }) {
  const { session, state } = useSession();
  const work = useWork();
  const owner = state.user!.id;
  const client = useQueryClient();
  const [closed, setClosed] = useState(() => hidden(owner, date));
  const running = work.work?.state === "Running";
  const signals = useDaySignals(date, !closed && !running);
  const last = signals.data?.lastWork;
  const lastId = last?.id;
  const endedAt = last
    ? last.state === "Paused"
      ? Date.parse(last.recordedAt)
      : last.endedAt
        ? Date.parse(last.endedAt)
        : NaN
    : NaN;
  const serverNow = last ? Date.parse(last.serverNow) : NaN;
  const away = Number.isFinite(endedAt) && Number.isFinite(serverNow) ? (serverNow - endedAt) / 1000 : 0;
  const eligible = !!last?.taskId && last.state !== "Running" && away >= thresholdSeconds;
  const context = useQuery({
    queryKey: queryKeys.resource(owner, "return-context", { id: last?.taskId }),
    networkMode: "always",
    enabled: eligible && !closed && !running,
    queryFn: async ({ signal }) => {
      const id = last!.taskId!;
      const [ctx, task, { readReturn }] = await Promise.all([
        session.api.read("/api/tasks/{id}/return-context", { path: { id }, signal }),
        session.api.read("/api/tasks/{id}", { path: { id }, signal }),
        import("../notes/model"),
      ]);
      return { ctx: readReturn(ctx, id), task: readTask(task) };
    },
  });
  const shown = !closed && !running && eligible && !!context.data && context.data.task.state !== "Completed";
  useEffect(() => {
    if (!shown || !lastId) return;
    let release = () => {};
    const synchronize = () => {
      release();
      if (document.visibilityState === "visible") release = presentResume(client, owner, lastId);
    };
    synchronize();
    document.addEventListener("visibilitychange", synchronize);
    return () => {
      document.removeEventListener("visibilitychange", synchronize);
      release();
    };
  }, [client, owner, shown, lastId]);
  useEffect(() => {
    if (!shown || !lastId || !("serviceWorker" in navigator)) return;
    const epoch = session.getIdentity().epoch;
    let disposed = false;
    const current = () =>
      !disposed &&
      document.visibilityState === "visible" &&
      session.getIdentity().epoch === epoch &&
      session.getSnapshot().user?.id === owner;
    const replaceNative = async () => {
      if (!current() || !("Notification" in window) || Notification.permission !== "granted") return;
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        for (const n of signals.data?.notifications ?? []) {
          if (n.kind !== "ReturnToTask" || n.sourceId !== lastId || !isUnread(n)) continue;
          const displayed = await registration?.getNotifications({ tag: `notification:${n.id}` });
          for (const notice of displayed ?? []) if (current() && notice.data?.recipientUserId === owner) notice.close();
        }
      } catch {
        /* Görünen kart açık sekmedeki sunum olarak kalır. İzin istenmez. */
      }
    };
    void replaceNative();
    const onVisible = () => {
      void replaceNative();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session, owner, shown, lastId, signals.data]);
  if (!shown || !context.data) return null;
  const { ctx, task } = context.data;
  const step = ctx.nextStepNote?.text ?? ctx.suggestedStep?.title;
  return (
    <section className="resume-card" aria-labelledby="resume-title" data-resume-work-id={last!.id}>
      <div className="resume-head">
        <h2 id="resume-title">Nerede kalmıştım?</h2>
        <button
          type="button"
          className="ghost icon"
          aria-label="Bugün için kapat"
          onClick={() => {
            setClosed(true);
            try {
              localStorage.setItem(hiddenKey(owner, date), "1");
            } catch {
              /* Yalnız bu görünüm için gizleniyor. */
            }
          }}
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>
      <p>
        <strong>{task.title}</strong>
        <span className="muted"> · {span(last!.activeSeconds)} çalıştın</span>
      </p>
      {ctx.lastNote && <p className="muted">Son not: {ctx.lastNote.text}</p>}
      {step && <p className="resume-step">İlk adım: {step}</p>}
      <button
        type="button"
        className="primary"
        disabled={work.busy || !!work.uncertain || !work.online}
        onClick={() => void (last!.state === "Paused" ? work.transition("resume", last!) : work.start(task.id))}
      >
        Devam et
      </button>
    </section>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { ApiError } from "../../lib/api/errors";
import { queryKeys } from "../../lib/api/query-client";
import type { Day } from "./model";
import { isOffline, offlineWrite } from "../tasks/model";
import type { Revision } from "./history-model";

/** Saatsiz öğe değişikliği önizleme olmadan geri alınır. Daha sonra değişmiş veya zaten geri alınmışsa sunucu reddeder; panel otomatik tekrar yerine yeni okuma ister. */
export function DayItemUndo({ revision, day, lock }: { revision: Revision; day: Day; lock: (v: boolean) => void }) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState("");
  const [blocked, setBlocked] = useState(false);
  const owner = state.user!.id,
    epoch = session.getIdentity().epoch;
  const current = () => session.getSnapshot().user?.id === owner && session.getIdentity().epoch === epoch;
  const busy = useRef(false);
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    lock(pending);
    return () => lock(false);
  }, [pending, lock]);
  useEffect(() => {
    if (failure) alert.current?.focus();
  }, [failure]);
  async function undo() {
    if (busy.current || blocked || !current()) return;
    if (isOffline()) {
      setFailure(offlineWrite);
      return;
    }
    busy.current = true;
    setPending(true);
    setFailure("");
    try {
      await session.api
        .mutation("/api/day-items/undo", "post", {
          body: { changeSetId: revision.changeSetId, expectedPlanningVersion: day.planningVersion },
        })
        .execute();
      if (current()) setDone(true);
    } catch (error) {
      if (!current()) return;
      if (
        error instanceof ApiError &&
        (error.outcomeUnknown || error.kind === "protocol" || [404, 409].includes(error.status))
      )
        setBlocked(true);
      setFailure(
        error instanceof ApiError && error.status === 409
          ? "Bu değişiklikten sonra plan değişmiş ya da zaten geri alınmış. Güncel planı gösteriyorum."
          : error instanceof ApiError && error.outcomeUnknown
            ? "Sonuç alınamadı. Güncel planı okuyup kontrol et; aynı isteği kendiliğinden göndermiyorum."
            : "Geri alınamadı. Bağlantını kontrol edip yeniden dene.",
      );
    } finally {
      busy.current = false;
      if (current()) {
        setPending(false);
        void Promise.all(
          [
            "day-overview",
            "plan-day",
            "plan-blocks",
            "day-items",
            "plan-glance",
            "plan-revisions",
            "calendar-items",
            "calendar-overview",
            "calendar-range",
          ].map(resource => client.invalidateQueries({ queryKey: queryKeys.resource(owner, resource).slice(0, 3) })),
        ).catch(() => undefined);
      }
    }
  }
  return (
    <section
      aria-label={
        revision.trigger === "Pool"
          ? "Havuz işlemini geri alma"
          : revision.trigger === "Defer"
            ? "Ertelemeyi geri alma"
            : "Saatsiz değişikliği geri alma"
      }
      className="day-item-undo"
    >
      {revision.trigger === "Pool" && (
        <p>
          Görevlerin havuz bağları ve bu grubun saatli/saatsiz plan öğeleri birlikte geri alınır. Gerçek çalışma
          değişmez; görev havuz kayıtları görev geçmişinde saklanır.
        </p>
      )}
      {revision.trigger === "Defer" && (
        <p>
          Saat iptali ve saatsiz erteleme aynı grupta geri alınır. Görev tanımı, gerçek çalışma ve eski plan
          revizyonları korunur.
        </p>
      )}
      {(revision.trigger === "Pool" || revision.trigger === "Defer") && revision.reversesChangeSetId ? (
        <p role="status">Bu kayıt işlemin geri alınmasıdır; yeni plan değişikliği ayrı bir karardır.</p>
      ) : done ? (
        <p role="status">Değişiklik geri alındı.</p>
      ) : (
        <button type="button" disabled={pending || blocked} aria-busy={pending} onClick={() => void undo()}>
          Bu değişikliği geri al
        </button>
      )}
      {failure && (
        <p role="alert" tabIndex={-1} ref={alert}>
          {failure}
        </p>
      )}
    </section>
  );
}

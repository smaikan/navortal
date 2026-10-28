"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { ApiError } from "../../lib/api/errors";
import { announceWorkChange } from "../work/changed";
import { readDay, readSchedules } from "./model";
import { dayWindow } from "./time-model";
import {
  canApply,
  readApplied,
  readProposal,
  requestBody,
  proposalFailure,
  type Applied,
  type Proposal,
} from "./proposal-model";
import { ProposalView } from "./proposal-view";

type Command = {
  kind: "apply" | "plan" | "preview";
  execute: (options?: { retryUnknownResult?: boolean }) => Promise<unknown>;
  id?: string;
};
/** Kaydedilmiş işi yeniden planlar. Çalışma oturumu başlatmaz veya geri almaz. */
export function RemainingPlan({
  date,
  taskIds,
  zone,
  format,
  names,
  initial,
  lock,
  includeDayTasks = false,
}: {
  date: string;
  taskIds: string[];
  zone: string;
  format: string;
  names: ReadonlyMap<string, string>;
  initial: Proposal | null;
  lock: (v: boolean) => void;
  includeDayTasks?: boolean;
}) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const [proposal, setProposal] = useState(initial),
    [applied, setApplied] = useState<Applied | null>(initial?.applied ?? null);
  const [pending, setPending] = useState(false),
    [uncertain, setUncertain] = useState<Command | null>(null),
    [failure, setFailure] = useState("");
  const [stale, setStale] = useState(false),
    [readFailed, setReadFailed] = useState(!!initial);
  const busy = useRef(false);
  const [displayZone, setDisplayZone] = useState(zone),
    [zoneReady, setZoneReady] = useState(!initial);
  useEffect(() => {
    lock(pending || !!uncertain);
    return () => lock(false);
  }, [pending, uncertain, lock]);
  useEffect(() => {
    let live = true;
    if (initial)
      void Promise.all([
        session.api.read("/api/scheduling/proposals/{id}", { path: { id: initial.proposalId } }),
        session.api.read("/api/daily-plans/{date}", { path: { date } }),
      ])
        .then(([raw, rawDay]) => {
          const value = readProposal(raw, initial.proposalId),
            day = readDay(rawDay, date);
          if (live) {
            setDisplayZone(day.timeZoneId);
            setZoneReady(true);
            setProposal(value);
            setApplied(value.applied ?? null);
            setReadFailed(false);
          }
        })
        .catch(error => {
          if (live) setFailure(proposalFailure(error));
        });
    return () => {
      live = false;
    };
  }, [initial, session, date]);
  function accept(value: Applied) {
    setApplied(value);
    setUncertain(null);
    announceWorkChange(client, state.user!.id);
  }
  async function check(id: string) {
    try {
      const [raw, rawDay] = await Promise.all([
        session.api.read("/api/scheduling/proposals/{id}", { path: { id } }),
        session.api.read("/api/daily-plans/{date}", { path: { date } }),
      ]);
      const value = readProposal(raw, id),
        day = readDay(rawDay, date);
      setDisplayZone(day.timeZoneId);
      setZoneReady(true);
      setProposal(value);
      setReadFailed(false);
      if (value.applied) accept(value.applied);
    } catch (error) {
      setReadFailed(true);
      setFailure(`Çalışma korunuyor; güncel plan okunamadı. ${proposalFailure(error)}`);
    }
  }
  async function guarded(action: () => Promise<void>, resolving = false) {
    if (busy.current || (uncertain && !resolving)) return;
    busy.current = true;
    setPending(true);
    setFailure("");
    try {
      await action();
    } catch (error) {
      setFailure(proposalFailure(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function perform(command: Command, retry = false) {
    let id: string;
    try {
      const raw = await command.execute({ retryUnknownResult: retry });
      if (command.kind === "apply") {
        const value = readApplied(raw as Applied, command.id);
        accept(value);
        id = value.proposalId;
      } else {
        const value = readProposal(raw as Proposal);
        setProposal(value);
        setApplied(value.applied ?? null);
        if (value.applied) accept(value.applied);
        setUncertain(null);
        setStale(false);
        id = value.proposalId;
      }
    } catch (error) {
      setFailure(proposalFailure(error));
      if (error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol")) setUncertain(command);
      else if (error instanceof ApiError && error.status === 409) setStale(true);
      return;
    }
    await check(id);
  }
  function generate(kind: "plan" | "preview") {
    void guarded(async () => {
      setStale(true);
      const day = readDay(await session.api.read("/api/daily-plans/{date}", { path: { date } }), date);
      setDisplayZone(day.timeZoneId);
      setZoneReady(true);
      const selected = new Set(taskIds);
      if (includeDayTasks) {
        const window = dayWindow(date, day.timeZoneId);
        let offset = 0;
        while (true) {
          const page = readSchedules(
            await session.api.read("/api/schedules", {
              query: { From: window.from, To: window.to, Offset: offset, Limit: 25 },
            }),
          );
          for (const block of page.items) if (block.taskId && block.state === "Planned") selected.add(block.taskId);
          offset += page.items.length;
          if (offset >= Number(page.total)) break;
          if (!page.items.length || offset >= 1000 || selected.size > 1000)
            throw new RangeError(
              "Bu günde çok fazla blok var; Gün Planlama ekranından daha dar bir iş seçimiyle önizleme al.",
            );
        }
      }
      const body = requestBody(date, [...selected], day.planningVersion);
      const mutation =
        kind === "plan"
          ? session.api.mutation("/api/scheduling/plan", "post", { body })
          : session.api.mutation("/api/scheduling/preview", "post", { body });
      await perform({ kind, execute: mutation.execute });
    });
  }
  return (
    <section aria-label="Kalan günün planı">
      <h3>Kalan günün planı</h3>
      <p>
        Çalışma ve plan ayrı kayıtlardır. Öneriyi uygulamamak başlayan çalışmayı durdurmaz. Sabit randevular
        kendiliğinden taşınmaz.
      </p>
      <p className="muted">
        “Planı yeniden dene” güncel Preview/Auto tercihini izler; Auto uygun öneriyi uygulayabilir. “Yeni önizleme” her
        durumda onay bekler.
      </p>
      {pending && (
        <p role="status">
          {applied ? "Plan onayı alındı; güncel görünüm okunuyor…" : "Kalan planın sonucu bekleniyor…"}
        </p>
      )}
      {applied && (
        <p role="status" className="form-notice">
          {applied.noChanges ? "Plan zaten uygun; yeni revizyon oluşturulmadı." : "Kalan plan uygulandı."}
        </p>
      )}
      {proposal && (
        <>
          <p role="status">
            Plan önerisi: {applied ? "Uygulandı" : proposal.status === "Expired" ? "Süresi doldu" : "Onay bekliyor"}
          </p>
          {zoneReady ? (
            <ProposalView proposal={proposal} zone={displayZone} format={format} selected={names} />
          ) : (
            <p role="status">Plan günü okunuyor…</p>
          )}
          {!applied && (
            <button
              className="primary"
              disabled={pending || !!uncertain || stale || readFailed || !canApply(proposal)}
              onClick={() =>
                void guarded(async () => {
                  const mutation = session.api.mutation("/api/scheduling/apply", "post", {
                    body: { proposalId: proposal.proposalId },
                  });
                  await perform({ kind: "apply", id: proposal.proposalId, execute: mutation.execute });
                })
              }
            >
              Kalan planı uygula
            </button>
          )}
          <button disabled={pending || !!uncertain} onClick={() => void guarded(() => check(proposal.proposalId))}>
            Kalan öneriyi yeniden oku
          </button>
        </>
      )}
      {stale && <p className="form-notice">Eski öneriyle devam edilmez; yeni önizleme al. Gerçek çalışma korunuyor.</p>}
      {failure && (
        <div role="alert" className="form-error">
          {failure}
        </div>
      )}
      <div className="actions">
        <button disabled={pending || !!uncertain} onClick={() => generate("plan")}>
          Planı yeniden dene
        </button>
        <button disabled={pending || !!uncertain} onClick={() => generate("preview")}>
          Yeni önizleme
        </button>
      </div>
      {uncertain && (
        <div role="alert">
          <p>Planın sonucu belirsiz; yeni çalışma başlatılmadı ve yeni yazı gönderilmez.</p>
          {uncertain.kind !== "preview" ? (
            <button disabled={pending} onClick={() => void guarded(() => perform(uncertain, true), true)}>
              Aynı plan isteğini yeniden dene
            </button>
          ) : (
            <button
              disabled={pending}
              onClick={() =>
                void guarded(async () => {
                  readDay(await session.api.read("/api/daily-plans/{date}", { path: { date } }), date);
                  setUncertain(null);
                }, true)
              }
            >
              Güncel günü kontrol et
            </button>
          )}
          {uncertain.id && (
            <button disabled={pending} onClick={() => void guarded(() => check(uncertain.id!), true)}>
              Uygulamanın sonucunu oku
            </button>
          )}
        </div>
      )}
    </section>
  );
}

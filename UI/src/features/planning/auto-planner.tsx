"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Surface } from "../../components/ui/surface";
import { ApiError } from "../../lib/api/errors";
import { queryKeys } from "../../lib/api/query-client";
import { useSession } from "../auth/provider";
import { usePreferences } from "../preferences/queries";
import { useDialogGuard } from "../work/draft-guard";
import type { Task } from "../tasks/model";
import { readDay, type Day } from "./model";
import {
  canApply,
  proposalFailure,
  readApplied,
  readProposal,
  requestBody,
  type Applied,
  type Proposal,
} from "./proposal-model";
import { ProposalView } from "./proposal-view";
import { ProposalSelection } from "./proposal-selection";

type Command = {
  kind: "preview" | "plan" | "apply";
  id?: string;
  execute: (options?: { retryUnknownResult?: boolean }) => Promise<unknown>;
};
export function AutoPlanner({
  day,
  task,
  format,
  trigger,
  close,
  onApplied,
  rescue = false,
}: {
  rescue?: boolean;
  day: Day;
  task?: Task;
  format: string;
  trigger: HTMLElement;
  close: () => void;
  onApplied: () => void;
}) {
  const { session, state } = useSession();
  const client = useQueryClient();
  const prefs = usePreferences();
  const [selected, setSelected] = useState(() => new Map(task ? [[task.id, task.title]] : []));
  const [proposal, setProposal] = useState<Proposal | null>(null),
    [accepted, setAccepted] = useState<Applied | null>(null);
  const [pending, setPending] = useState(false),
    [failure, setFailure] = useState(""),
    [uncertain, setUncertain] = useState<Command | null>(null);
  const [needsPreview, setNeedsPreview] = useState(false),
    [readFailure, setReadFailure] = useState(false),
    [zone, setZone] = useState(day.timeZoneId);
  const busy = useRef(false),
    issue = useRef<HTMLDivElement>(null);
  const { requestClose, markSaved } = useDialogGuard({
    dirty: !!uncertain || (!accepted && selected.size > 0),
    pending,
    close,
    trigger,
    message: "Planlama seçimin ve önizlemen kapatılacak. Devam edilsin mi?",
  });
  useLayoutEffect(() => {
    if (failure && !pending) issue.current?.focus();
  }, [failure, pending]);
  function accept(effect: Applied) {
    setAccepted(effect);
    setUncertain(null);
    markSaved();
    onApplied();
  }
  async function refreshPlans() {
    await Promise.all(
      ["day-overview", "plan-day", "plan-blocks", "plan-allocation", "tasks", "task"].map(resource =>
        client.invalidateQueries(
          { queryKey: queryKeys.resource(state.user!.id, resource).slice(0, 3), refetchType: "active" },
          { throwOnError: true },
        ),
      ),
    );
  }
  async function check(id: string) {
    try {
      const current = readProposal(await session.api.read("/api/scheduling/proposals/{id}", { path: { id } }), id);
      setProposal(current);
      if (current.status === "Expired") setNeedsPreview(true);
      if (current.applied) {
        accept(current.applied);
        await refreshPlans();
      }
      setReadFailure(false);
    } catch (error) {
      setReadFailure(true);
      setFailure(`Güncel öneri okunamadı. ${proposalFailure(error)}`);
    }
  }
  async function perform(command: Command, retry = false) {
    let next: Proposal | null = null;
    try {
      const raw = await command.execute({ retryUnknownResult: retry });
      if (command.kind === "apply") {
        const effect = readApplied(raw as Applied, command.id);
        accept(effect);
        setProposal(previous =>
          previous ? { ...previous, status: "Applied", canApply: false, applied: effect } : null,
        );
        // Bu okumalar beklerken makbuz zaten görünüyor.
        await check(command.id!);
        return;
      }
      next = readProposal(raw as Proposal);
      setProposal(next);
      setUncertain(null);
      setNeedsPreview(next.status === "Expired");
      if (next.applied) accept(next.applied);
    } catch (error) {
      setFailure(proposalFailure(error));
      if (error instanceof ApiError && (error.outcomeUnknown || error.kind === "protocol")) setUncertain(command);
      else if (error instanceof ApiError && error.status === 409) setNeedsPreview(true);
      return;
    }
    if (next) await check(next.proposalId);
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
  function generate(kind: "preview" | "plan") {
    void guarded(async () => {
      setNeedsPreview(true);
      setAccepted(null);
      const fresh = readDay(
        await session.api.read("/api/daily-plans/{date}", { path: { date: day.localDate } }),
        day.localDate,
      );
      setZone(fresh.timeZoneId);
      const body = requestBody(day.localDate, [...selected.keys()], fresh.planningVersion);
      const mutation = rescue
        ? session.api.mutation("/api/support/rescue", "post", { body })
        : kind === "preview"
          ? session.api.mutation("/api/scheduling/preview", "post", { body })
          : session.api.mutation("/api/scheduling/plan", "post", { body });
      await perform({ kind: rescue ? "plan" : kind, execute: mutation.execute });
    });
  }
  function apply() {
    if (!proposal || !canApply(proposal) || needsPreview || readFailure) return;
    void guarded(async () => {
      const command = session.api.mutation("/api/scheduling/apply", "post", {
        body: { proposalId: proposal.proposalId },
      });
      await perform({ kind: "apply", id: proposal.proposalId, execute: command.execute });
    });
  }
  const locked = pending || !!uncertain;
  return (
    <Surface
      title={rescue ? "Kalan günü kurtar" : "Günü planla"}
      modal
      returnTo={trigger}
      onClose={requestClose}
      closeDisabled={pending}
    >
      <div className="auto-planner">
        <p className="relation-title">{day.localDate}</p>
        <p className="muted">
          {rescue
            ? "Yalnız bugünün kalan kapasitesi düzenlenir. Geçmiş gerçek çalışma, sabit ve kilitli bloklar korunur; sığmayan işler başka güne gizlice taşınmaz."
            : "Önizleme planını değiştirmez. Uygulamak, gerçek çalışma başlatmaz."}
        </p>
        <p>
          Kaydedilmiş planlama tercihi:{" "}
          <strong>{prefs.data?.values.planningMode === "Auto" ? "Auto" : "Preview"}</strong>. Tercihini Ayarlar’da
          değiştirebilirsin.
        </p>
        <p className="muted form-hint">
          {rescue ? "Kurtarma komutu" : "“Tercihime göre planla”"} sunucudaki güncel ayarını izler; Auto ise uygun
          öneriyi hemen uygular.{" "}
          {rescue
            ? "Preview ise ayrıca onayın beklenir; Auto ise uygun sonuç bu komutla hemen uygulanabilir."
            : "Onayını her durumda korumak için “Yalnız önizle”yi seç."}
        </p>
        <ProposalSelection selected={selected} change={setSelected} disabled={locked || !!proposal} />
        {!proposal && (
          <div className="actions">
            {!rescue && (
              <button className="primary" disabled={locked || !selected.size} onClick={() => generate("preview")}>
                Yalnız önizle
              </button>
            )}
            <button
              disabled={locked || !selected.size || !prefs.data || prefs.isError}
              onClick={() => generate("plan")}
            >
              {rescue ? "Tercihime göre kalan günü kurtar" : "Tercihime göre planla"}
            </button>
          </div>
        )}
        {!proposal && prefs.data?.values.planningMode === "Auto" && (
          <p className="form-notice">
            {rescue
              ? "Bu kurtarma komutu Auto tercihinle uygun öneriyi hemen uygular. Devam etmeden önce tercihini kontrol et."
              : "“Tercihime göre planla”, Auto tercihinle uygun öneriyi hemen uygular. “Yalnız önizle” yine onayını bekler."}
          </p>
        )}
        {pending && (
          <p role="status">{accepted ? "Plan onaylandı; güncel görünüm okunuyor…" : "Planlama sonucu bekleniyor…"}</p>
        )}
        {accepted && (
          <p role="status" className="form-notice">
            {accepted.noChanges
              ? "Plan zaten uygun; değişiklik yok. Yeni revizyon oluşturulmadı."
              : "Plan uygulandı. Kabul edilmiş yeni revizyon kaydedildi."}
          </p>
        )}
        {proposal && (
          <>
            <p role="status">
              Öneri durumu:{" "}
              {proposal.status === "Applied"
                ? "Uygulandı"
                : proposal.status === "Expired"
                  ? "Süresi doldu"
                  : "Onay bekliyor"}
            </p>
            <ProposalView proposal={proposal} zone={zone} selected={selected} format={format} />
            {!readFailure && (
              <button disabled={locked} onClick={() => void guarded(() => check(proposal.proposalId))}>
                Öneri durumunu kontrol et
              </button>
            )}
            {!accepted && (
              <div className="actions">
                <button
                  className="primary"
                  disabled={locked || needsPreview || readFailure || !canApply(proposal)}
                  onClick={apply}
                >
                  Öneriyi uygula
                </button>
                <button disabled={locked} onClick={() => generate("preview")}>
                  {rescue ? "Güncel tercihle yeniden kurtar" : "Yeni önizleme al"}
                </button>
              </div>
            )}
            {needsPreview && !accepted && (
              <p className="form-notice">
                Bu öneriyle devam edilemez.{" "}
                {rescue
                  ? "Seçimi kontrol edip güncel tercihle yeniden kurtar; Auto ise uygun sonuç hemen uygulanabilir."
                  : "Yeni önizleme al."}{" "}
                Eski istek kendiliğinden tekrarlanmaz.
              </p>
            )}
          </>
        )}
        {failure && (
          <div role="alert" tabIndex={-1} ref={issue} className="form-error">
            <p>{failure}</p>
          </div>
        )}
        {uncertain && (
          <section aria-label="Belirsiz planlama sonucu">
            <p>Seçim kilitli; yeni bir yazı gönderilmez.</p>
            {uncertain.kind !== "preview" ? (
              <button disabled={pending} onClick={() => void guarded(() => perform(uncertain, true), true)}>
                Aynı isteği güvenle yeniden gönder
              </button>
            ) : (
              <>
                <p>
                  Önizleme kabul edilmiş planı değiştirmez. Yeni bir önizleme istemeden önce güncel günü kontrol et.
                </p>
                <button
                  disabled={pending}
                  onClick={() =>
                    void guarded(async () => {
                      readDay(
                        await session.api.read("/api/daily-plans/{date}", { path: { date: day.localDate } }),
                        day.localDate,
                      );
                      await refreshPlans();
                      setUncertain(null);
                    }, true)
                  }
                >
                  Güncel planı kontrol et
                </button>
              </>
            )}
            {uncertain.id && (
              <button disabled={pending} onClick={() => void guarded(() => check(uncertain.id!), true)}>
                Önerinin güncel durumunu kontrol et
              </button>
            )}
          </section>
        )}
        {readFailure && proposal && !uncertain && (
          <div role="alert">
            <p>
              {accepted
                ? "Uygulama onayı alındı; tekrar uygulama. Güncel görünümü yeniden oku."
                : "Uygulamadan önce önerinin güncel durumunu oku."}
            </p>
            <button disabled={pending} onClick={() => void guarded(() => check(proposal.proposalId))}>
              Öneriyi yeniden oku
            </button>
          </div>
        )}
        {(proposal || accepted) && (
          <div className="actions">
            <button
              disabled={locked || readFailure}
              onClick={() => {
                setProposal(null);
                setAccepted(null);
                setNeedsPreview(false);
                setFailure("");
              }}
            >
              Seçimi değiştir
            </button>
            <button disabled={pending} onClick={requestClose}>
              Kapat
            </button>
          </div>
        )}
      </div>
    </Surface>
  );
}

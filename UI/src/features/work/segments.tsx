"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Surface } from "../../components/ui/surface";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { clock, coveredSeconds, readSegments, segmentLimit, spoken, workFailure, type Work } from "./model";
import { WorkTimer } from "./player";

/** Aktif süre sunucudan. Kapsanan süre oturumun parçalarının aralığıdır, duraklamalar dahildir. */
export function SegmentsDialog({
  work,
  receivedAt,
  trigger,
  close,
}: {
  work: Work;
  receivedAt: number;
  trigger: HTMLElement;
  close: () => void;
}) {
  const { session, state } = useSession();
  const [openedAt] = useState(() => performance.now());
  const segments = useQuery({
    queryKey: queryKeys.resource(state.user!.id, "work-segments", { id: work.id, version: work.version }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readSegments(
        await session.api.read("/api/work-sessions/{id}/segments", {
          path: { id: work.id },
          query: { Limit: segmentLimit },
          signal,
        }),
      ),
  });
  const zone = work.timeZoneId;
  const time = new Intl.DateTimeFormat("tr", { timeZone: zone, dateStyle: "short", timeStyle: "medium" });
  const data = segments.data;
  const sinceRead = (openedAt - receivedAt) / 1000;
  const covered =
    data && data.total <= segmentLimit
      ? coveredSeconds(data.items, work.serverNow, work.state === "Running" ? sinceRead : 0)
      : null;
  return (
    <Surface title="Çalışma aralıkları" modal returnTo={trigger} onClose={close}>
      <div className="work-segments">
        <p className="relation-title">{work.taskAtStart?.title ?? "Görev"}</p>
        <dl className="task-metrics" aria-label="Oturum süreleri">
          <dt>Aktif çalışma</dt>
          <dd>
            <WorkTimer work={work} receivedAt={receivedAt} />
          </dd>
          <dt>Kapsanan süre</dt>
          <dd>
            {covered === null ? (
              data && data.total > segmentLimit ? (
                "Çok fazla aralık; hesaplanamadı"
              ) : (
                "—"
              )
            ) : (
              <>
                <span aria-hidden="true">{clock(covered)}</span>
                <span className="sr-only">{spoken(covered)}</span>
              </>
            )}
          </dd>
        </dl>
        <p className="muted form-hint">
          Aktif çalışma yalnız aralıkların içindeki süredir. Kapsanan süre ilk başlangıçtan son bitişe kadardır; aradaki
          duraklamalar çalışma sayılmaz.
        </p>
        {segments.isError && (
          <div role="alert" className="form-error">
            <p>{workFailure(segments.error)}</p>
            <button type="button" onClick={() => void segments.refetch()}>
              Aralıkları yeniden yükle
            </button>
          </div>
        )}
        {!data && !segments.isError && <p role="status">Aralıklar okunuyor…</p>}
        {data && (
          <ol className="work-segment-list" aria-label="Aralıklar">
            {data.items.map((segment, index) => (
              <li key={segment.id} className={segment.isVoided ? "voided" : undefined}>
                <span className="relation-title">
                  Aralık {index + 1}
                  {segment.isVoided && " · geçersiz sayıldı"}
                </span>
                <span>
                  {time.format(new Date(segment.startedAt))} –{" "}
                  {segment.endedAt ? time.format(new Date(segment.endedAt)) : "sürüyor"}
                </span>
                {segment.endedAt && !segment.isVoided && (
                  <span className="muted">
                    {clock((Date.parse(segment.endedAt) - Date.parse(segment.startedAt)) / 1000)}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
        {data && data.total > data.items.length && (
          <p className="muted">
            İlk {data.items.length} / {data.total} aralık gösteriliyor.
          </p>
        )}
        <Link href={`/work?oturum=${work.id}`} prefetch={false} onClick={close}>
          Aralıkları düzelt ve geçmişi gör
        </Link>
      </div>
    </Surface>
  );
}

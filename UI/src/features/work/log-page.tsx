"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { validTaskId } from "../../components/layout/task-panel-url";
import { queryKeys } from "../../lib/api/query-client";
import { useSession } from "../auth/provider";
import { CorrectionDialog } from "./correction-dialog";
import {
  correctionKinds,
  correctionPageSize,
  dayRangeText,
  rangeText,
  readCorrections,
  readWorkPage,
  sourceLabels,
  workPageSize,
  workStates,
} from "./journal";
import {
  clock,
  coveredSeconds,
  readSegments,
  readWork,
  segmentLimit,
  spoken,
  stateLabels,
  workFailure,
  type Work,
} from "./model";

const duration = (seconds: number) => (
  <>
    <span aria-hidden="true">{clock(seconds)}</span>
    <span className="sr-only">{spoken(seconds)}</span>
  </>
);

/** Oturum sayfası yerel başlangıç gününe göre gruplu. Bu görünüm işi; toplamlar oturum başına kalır. */
function byDay(items: Work[]) {
  const map = new Map<string, Work[]>();
  for (const work of items) {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: work.timeZoneId,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(work.startedAt));
    map.set(key, [...(map.get(key) ?? []), work]);
  }
  return [...map];
}
const dayLabel = (key: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(
    new Date(`${key}T12:00:00Z`),
  );
/** Görevler arası gerçek çalışma geçmişi en yeni önce. API görev filtresi sunmaz, liste daima sayfalıdır. */
export function WorkLogPage() {
  const { session, state } = useSession();
  const owner = state.user!.id;
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const status = workStates.find(value => value === search.get("durum")) ?? null;
  const rawOffset = Number(search.get("offset") ?? 0);
  const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 && rawOffset <= 100000 ? rawOffset : 0;
  const selected = search.get("oturum");
  function navigate(changes: Record<string, string | null>, mode: "push" | "replace" = "replace") {
    const params = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const url = pathname + (params.size ? `?${params}` : "");
    if (mode === "push") router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  }
  const list = useQuery({
    queryKey: queryKeys.resource(owner, "work-log", { offset, status }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readWorkPage(
        await session.api.read("/api/work-sessions", {
          query: { Offset: offset, Limit: workPageSize, ...(status ? { State: status } : {}) },
          signal,
        }),
      ),
  });
  const data = list.data;
  return (
    <main id="main" className="workspace-main work-log" tabIndex={-1}>
      <header className="page-header">
        <h1 tabIndex={-1}>Çalışma kayıtları</h1>
      </header>
      <div className="hours-field work-log-filter">
        <label htmlFor="work-state">Durum</label>
        <select
          id="work-state"
          value={status ?? ""}
          onChange={event => navigate({ durum: event.target.value || null, offset: null })}
        >
          <option value="">Hepsi</option>
          {workStates.map(value => (
            <option key={value} value={value}>
              {stateLabels[value]}
            </option>
          ))}
        </select>
      </div>
      {list.isError && (
        <div role="alert" className="form-error">
          <p>{workFailure(list.error)}</p>
          <button type="button" onClick={() => void list.refetch()}>
            Kayıtları yeniden yükle
          </button>
        </div>
      )}
      {!data && !list.isError && <p role="status">Çalışma kayıtları okunuyor…</p>}
      {data && (
        <>
          <p role="status" className="task-count">
            {data.items.length ? `${offset + data.items.length} / ${data.total} oturum` : `${data.total} oturum`}
            {list.isFetching && " · Yenileniyor"}
          </p>
          {data.items.length ? (
            byDay(data.items).map(([day, works]) => (
              <section key={day} className="r2-work-day" aria-label={dayLabel(day)}>
                <h2>{dayLabel(day)}</h2>
                <ul className="work-log-list" aria-label={`${dayLabel(day)} çalışma oturumları`}>
                  {works.map(work => (
                    <li key={work.id} aria-current={work.id === selected ? "true" : undefined}>
                      <span className="r2-work-range">
                        {dayRangeText(
                          {
                            id: work.id,
                            startedAt: work.startedAt,
                            endedAt: work.endedAt,
                            isVoided: false,
                            version: 1,
                          },
                          work.timeZoneId,
                        )}
                      </span>
                      {work.taskId ? (
                        <Link
                          className="relation-title"
                          style={{ display: "inline-flex", alignItems: "center", minHeight: 44 }}
                          href={`/tasks?taskId=${work.taskId}`}
                          prefetch={false}
                          aria-label={`Görevi aç: ${work.taskAtStart?.title ?? "Çalışmanın görevi"}`}
                        >
                          {work.taskAtStart?.title ?? "Çalışmanın görevi"}
                        </Link>
                      ) : (
                        <span className="relation-title">Genel çalışma</span>
                      )}
                      <span className="r2-work-tags">
                        {work.state !== "Finished" && <span className="r2-kind">{stateLabels[work.state]}</span>}
                        {work.source !== "Timer" && (
                          <span className="r2-kind">{sourceLabels[work.source] ?? work.source}</span>
                        )}
                      </span>
                      <span className="r2-work-duration">{duration(Number(work.activeSeconds))}</span>
                      <button type="button" className="r2-quiet" onClick={() => navigate({ oturum: work.id }, "push")}>
                        Aralıkları ve geçmişi aç
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <div className="empty-state">
              <h2>{status ? "Bu durumda oturum yok" : offset ? "Bu sayfada kayıt yok" : "Henüz çalışma kaydı yok"}</h2>
              <p className="muted">Bir görevin panelinden çalışmayı başlatabilir veya manuel çalışma ekleyebilirsin.</p>
            </div>
          )}
          {(offset > 0 || data.total > offset + data.items.length) && (
            <nav className="task-pagination" aria-label="Kayıt sayfaları">
              <button
                type="button"
                disabled={offset === 0 || list.isFetching}
                onClick={() => navigate({ offset: String(Math.max(0, offset - workPageSize)) })}
              >
                Önceki
              </button>
              <button
                type="button"
                disabled={offset + data.items.length >= data.total || list.isFetching}
                onClick={() => navigate({ offset: String(offset + workPageSize) })}
              >
                Sonraki
              </button>
            </nav>
          )}
        </>
      )}
      {selected !== null &&
        (validTaskId(selected) ? (
          <SessionDetail key={selected} id={selected} close={() => navigate({ oturum: null })} />
        ) : (
          <div role="alert" className="form-error">
            <p>Oturum bağlantısı geçersiz. Listeden yeniden seç.</p>
          </div>
        ))}
    </main>
  );
}

function SessionDetail({ id, close }: { id: string; close: () => void }) {
  const { session, state } = useSession();
  const owner = state.user!.id;
  const heading = useRef<HTMLHeadingElement>(null);
  const [journalOffset, setJournalOffset] = useState(0);
  const [editing, setEditing] = useState<{ segmentId: string; index: number; trigger: HTMLElement } | null>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const detail = useQuery({
    queryKey: queryKeys.resource(owner, "work-detail", { id }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readWork(await session.api.read("/api/work-sessions/{id}", { path: { id }, signal })),
  });
  const segments = useQuery({
    queryKey: queryKeys.resource(owner, "work-segments", { id, log: true }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readSegments(
        await session.api.read("/api/work-sessions/{id}/segments", {
          path: { id },
          query: { Limit: segmentLimit },
          signal,
        }),
      ),
  });
  const journal = useQuery({
    queryKey: queryKeys.resource(owner, "work-corrections", { id, offset: journalOffset }),
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readCorrections(
        await session.api.read("/api/work-sessions/{id}/corrections", {
          path: { id },
          query: { Offset: journalOffset, Limit: correctionPageSize },
          signal,
        }),
      ),
  });
  const reread = () => Promise.all([detail.refetch(), segments.refetch(), journal.refetch()]);
  const work = detail.data;
  const zone = work?.timeZoneId ?? "UTC";
  const covered =
    work && segments.data && segments.data.total <= segmentLimit
      ? coveredSeconds(segments.data.items, work.serverNow)
      : null;
  const target = editing && segments.data?.items.find(item => item.id === editing.segmentId);
  return (
    <section className="work-detail" aria-labelledby="work-detail-heading">
      <h2 id="work-detail-heading" tabIndex={-1} ref={heading}>
        {work?.taskAtStart?.title ?? "Oturum ayrıntısı"}
      </h2>
      {detail.isError && (
        <div role="alert" className="form-error">
          <p>{workFailure(detail.error)}</p>
          <button type="button" onClick={() => void detail.refetch()}>
            Oturumu yeniden yükle
          </button>
        </div>
      )}
      {!work && !detail.isError && <p role="status">Oturum okunuyor…</p>}
      {work && (
        <>
          <dl className="task-metrics" aria-label="Oturum süreleri">
            <dt>Durum</dt>
            <dd>
              {stateLabels[work.state]} · {sourceLabels[work.source] ?? work.source}
            </dd>
            <dt>Aktif çalışma</dt>
            <dd>
              {duration(Number(work.activeSeconds))}
              {work.state === "Running" && " (son okuma; sürüyor)"}
            </dd>
            <dt>Kapsanan süre</dt>
            <dd>{covered === null ? "—" : duration(covered)}</dd>
          </dl>
          <p className="muted form-hint">
            Aktif çalışma yalnız geçerli aralıkların toplamıdır; geçersiz sayılan aralık ve düzeltme geçmişi eklenmez.
          </p>
          <h3>Aralıklar</h3>
          {segments.isError && (
            <div role="alert" className="form-error">
              <p>{workFailure(segments.error)}</p>
              <button type="button" onClick={() => void segments.refetch()}>
                Aralıkları yeniden yükle
              </button>
            </div>
          )}
          {segments.data && (
            <ol className="work-segment-list" aria-label="Aralıklar">
              {segments.data.items.map((segment, index) => (
                <li key={segment.id} className={segment.isVoided ? "voided" : undefined}>
                  <span className="relation-title">
                    Aralık {index + 1}
                    {segment.isVoided && " · geçersiz sayıldı"}
                  </span>
                  <span>{rangeText(segment, zone)}</span>
                  <button
                    type="button"
                    onClick={event => setEditing({ segmentId: segment.id, index, trigger: event.currentTarget })}
                  >
                    Aralık {index + 1} düzelt
                  </button>
                </li>
              ))}
            </ol>
          )}
          {segments.data && segments.data.total > segments.data.items.length && (
            <p className="muted">
              İlk {segments.data.items.length} / {segments.data.total} aralık gösteriliyor.
            </p>
          )}
          <h3>Düzeltme geçmişi</h3>
          {journal.isError && (
            <div role="alert" className="form-error">
              <p>{workFailure(journal.error)}</p>
              <button type="button" onClick={() => void journal.refetch()}>
                Geçmişi yeniden yükle
              </button>
            </div>
          )}
          {journal.data &&
            (journal.data.items.length ? (
              <ol className="work-journal" aria-label="Düzeltme geçmişi">
                {journal.data.items.map(entry => (
                  <li key={entry.id}>
                    <span className="relation-title">
                      #{String(entry.sequence)} · {correctionKinds[entry.kind] ?? entry.kind} ·{" "}
                      {new Intl.DateTimeFormat("tr", {
                        timeZone: zone,
                        dateStyle: "short",
                        timeStyle: "medium",
                      }).format(new Date(entry.createdAt))}
                    </span>
                    {entry.previousValues && <span>Önce: {rangeText(entry.previousValues, zone)}</span>}
                    <span>
                      {entry.previousValues ? "Sonra" : "Eklenen"}: {rangeText(entry.newValues, zone)}
                    </span>
                    <span className="muted">Neden: {entry.reason}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">Bu oturumda düzeltme yok.</p>
            ))}
          {journal.data && journal.data.total > correctionPageSize && (
            <nav className="task-pagination" aria-label="Geçmiş sayfaları">
              <button
                type="button"
                disabled={journalOffset === 0 || journal.isFetching}
                onClick={() => setJournalOffset(value => Math.max(0, value - correctionPageSize))}
              >
                Önceki düzeltmeler
              </button>
              <button
                type="button"
                disabled={journalOffset + journal.data.items.length >= journal.data.total || journal.isFetching}
                onClick={() => setJournalOffset(value => value + correctionPageSize)}
              >
                Sonraki düzeltmeler
              </button>
            </nav>
          )}
        </>
      )}
      <button type="button" onClick={close}>
        Ayrıntıyı kapat
      </button>
      {editing && work && target && (
        <CorrectionDialog
          key={editing.segmentId}
          work={work}
          segment={target}
          index={editing.index}
          trigger={editing.trigger}
          close={() => setEditing(null)}
          reread={reread}
        />
      )}
    </section>
  );
}
export type { Work };

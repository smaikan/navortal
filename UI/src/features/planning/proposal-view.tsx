"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { readTask } from "../tasks/model";
import { kinds, minutes, timeText } from "./model";
import {
  messageText,
  proposalPageSize,
  unplacedText,
  type Block,
  type Proposal,
  type ProposalContent,
} from "./proposal-model";

export function TaskName({ id, names }: { id: string | null; names: ReadonlyMap<string, string> }) {
  const { session, state } = useSession();
  const known = id ? names.get(id) : undefined;
  const result = useQuery({
    queryKey: queryKeys.resource(state.user!.id, "task", { id }),
    enabled: !!id && !known,
    networkMode: "always",
    queryFn: async ({ signal }) => readTask(await session.api.read("/api/tasks/{id}", { path: { id: id! }, signal })),
  });
  return (
    <>
      {known ??
        result.data?.title ??
        (id ? `Görev ${id.slice(0, 8)}${result.isError ? " (adı alınamadı)" : ""}` : "Görevsiz blok")}
    </>
  );
}
function Paged<T>({
  items,
  label,
  render,
}: {
  items: readonly T[];
  label: string;
  render: (item: T, index: number) => React.ReactNode;
}) {
  const [page, setPage] = useState(0);
  const offset = page * proposalPageSize;
  return (
    <>
      <ul aria-label={label} className="proposal-list">
        {items.slice(offset, offset + proposalPageSize).map((item, i) => (
          <li key={offset + i}>{render(item, offset + i)}</li>
        ))}
      </ul>
      {items.length > proposalPageSize && (
        <nav className="task-pagination" aria-label={`${label} sayfaları`}>
          <button disabled={!page} onClick={() => setPage(page - 1)}>
            Önceki
          </button>
          <span>
            {Math.min(offset + proposalPageSize, items.length)} / {items.length}
          </span>
          <button disabled={offset + proposalPageSize >= items.length} onClick={() => setPage(page + 1)}>
            Sonraki
          </button>
        </nav>
      )}
    </>
  );
}
function BlockSummary({
  block,
  zone,
  names,
  format,
}: {
  block: Block;
  zone: string;
  names: ReadonlyMap<string, string>;
  format: string;
}) {
  return (
    <div>
      <strong>{block.taskId ? <TaskName id={block.taskId} names={names} /> : kinds[block.kind]}</strong>
      <p>
        <time dateTime={block.startsAt}>{timeText(block.startsAt, zone, format)}</time>–
        <time dateTime={block.endsAt}>{timeText(block.endsAt, zone, format)}</time> · {kinds[block.kind]}
      </p>
      <p className="muted">
        {block.isFixed && "Sabit · "}
        {block.isLocked && "Kilitli · "}
        {block.isActive && "Aktif çalışma · "}
        {block.isPreserved ? "Korundu" : block.isAutomatic ? "Otomatik yerleşim" : "Manuel yerleşim"}
      </p>
    </div>
  );
}
export function ProposalView({
  proposal: p,
  zone,
  selected,
  format,
}: {
  proposal: Proposal;
  zone: string;
  selected: ReadonlyMap<string, string>;
  format: string;
}) {
  return (
    <div className="proposal-comparison">
      <p className="muted">
        Hesaplandığı an: {timeText(p.anchorAt, zone, format)} · Geçerlilik sonu: {timeText(p.expiresAt, zone, format)}
      </p>
      {p.hasConstraintConflicts && (
        <p role="status" className="form-notice">
          Kısıt çatışması var; öneri uygulanamaz. Saatleri, korunan blokları veya iş seçimini düzenleyip yeni önizleme
          al.
        </p>
      )}
      <ProposalContentView content={p} pageKey={p.proposalId} zone={zone} selected={selected} format={format} />
    </div>
  );
}
export function UnplacedView({
  items,
  names,
  pageKey,
}: {
  items: ProposalContent["unplaced"];
  names: ReadonlyMap<string, string>;
  pageKey: string;
}) {
  return (
    <section aria-label="Yerleşmeyen işler">
      <h3>Yerleşmeyen işler ({items.length})</h3>
      {!items.length && <p>Bu öneride yerleşmeyen iş yok.</p>}
      <Paged
        key={pageKey}
        items={items}
        label="Yerleşmeyen iş listesi"
        render={u => (
          <>
            <strong>
              <TaskName id={u.taskId} names={names} />
            </strong>
            <p>Kalan miktar: {minutes(u.remainingSeconds)}</p>
            <p>{unplacedText(u.reason)}</p>
          </>
        )}
      />
      {!!items.length && (
        <p className="form-notice">
          Bu işler başka güne taşınmadı. Kısıt çatışması yoksa önerinin yerleşen kısmını kabul edebilir veya seçimi
          değiştirebilirsin.
        </p>
      )}
    </section>
  );
}
export function ProposalContentView({
  content: p,
  pageKey,
  zone,
  selected,
  format,
  showUnplaced = true,
}: {
  content: ProposalContent;
  pageKey: string;
  zone: string;
  selected: ReadonlyMap<string, string>;
  format: string;
  showUnplaced?: boolean;
}) {
  const names = new Map(selected);
  for (const change of p.changes)
    if (change.before?.taskId && change.before.taskSnapshot)
      names.set(change.before.taskId, change.before.taskSnapshot.task.title);
  const labels: Record<string, string> = {
    Added: "Eklenecek",
    Updated: "Değişecek",
    Removed: "Kaldırılacak",
    Restored: "Geri gelecek",
  };
  return (
    <>
      <section aria-label="Önce ve sonra">
        <h3>Değişecek bloklar</h3>
        {!p.changes.length && <p>Değişecek blok yok. Uygulama yeni revizyon üretmeyebilir.</p>}
        <Paged
          key={pageKey}
          items={p.changes}
          label="Plan farkları"
          render={change => (
            <>
              <p className="proposal-change-label">{labels[change.type] ?? change.type}</p>
              <div className="proposal-pair">
                <div>
                  <h4>Önce</h4>
                  {change.before ? (
                    <>
                      <strong>{change.before.taskSnapshot?.task.title ?? kinds[change.before.kind]}</strong>
                      <p>
                        {timeText(change.before.startsAt, zone, format)}–{timeText(change.before.endsAt, zone, format)}
                      </p>
                    </>
                  ) : (
                    <p>Blok yok</p>
                  )}
                </div>
                <div>
                  <h4>Sonra</h4>
                  {change.after ? (
                    <BlockSummary block={change.after} zone={zone} names={names} format={format} />
                  ) : (
                    <p>Blok kaldırılıyor; gerçek çalışma korunur.</p>
                  )}
                </div>
              </div>
            </>
          )}
        />
      </section>
      {showUnplaced && <UnplacedView items={p.unplaced} names={names} pageKey={pageKey} />}
      <details>
        <summary>Önerilen tüm bloklar ({p.blocks.length})</summary>
        <Paged
          key={pageKey}
          items={p.blocks}
          label="Önerilen bloklar"
          render={block => <BlockSummary block={block} zone={zone} names={names} format={format} />}
        />
      </details>
      {(
        [
          ["Uyarılar", p.warnings],
          ["Yerleşim açıklamaları", p.explanations],
        ] as const
      ).map(([label, items]) => (
        <section aria-label={label} key={label}>
          <h3>
            {label} ({items.length})
          </h3>
          <Paged
            key={pageKey}
            items={items}
            label={label}
            render={m => (
              <>
                <p>
                  {messageText(m.code)}
                  {m.seconds != null && ` Miktar: ${minutes(m.seconds)}.`}
                </p>
                {m.taskId && (
                  <p>
                    <TaskName id={m.taskId} names={names} />
                  </p>
                )}
              </>
            )}
          />
        </section>
      ))}
    </>
  );
}

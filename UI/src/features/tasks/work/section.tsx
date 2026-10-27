"use client";
import { useState } from "react";
import { useTaskPanel } from "../../../components/layout/task-panel";
import type { Task } from "../model";
import { duration, percentage, workFailure } from "./model";
import { useWorkComponents, useWorkReport } from "./queries";
export function TaskWorkSection({ task, edit }: { task: Task; edit: (trigger: HTMLElement) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="task-work" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>Süre ve ilerleme</summary>
      {open && <WorkReport task={task} edit={edit} />}
    </details>
  );
}
function WorkReport({ task, edit }: { task: Task; edit: (trigger: HTMLElement) => void }) {
  const report = useWorkReport(task.id);
  const [components, setComponents] = useState(false);
  const data = report.data;
  return (
    <div className="task-work-content">
      {report.isError && (
        <div role="alert" className="form-error">
          <p>
            {workFailure(report.error)}
            {data && " Gösterilen süreler güncel olmayabilir."}
          </p>
          <button onClick={() => void report.refetch()}>Süreleri yeniden yükle</button>
        </div>
      )}
      {!data && !report.isError && <p role="status">Süre ve ilerleme okunuyor…</p>}
      {data && (
        <>
          <dl className="task-metrics" aria-label="İş yükü">
            <dt>Hesaplanan iş</dt>
            <dd>
              {data.summary.calculatedTotalSeconds === null
                ? "Tam toplam bilinmiyor"
                : duration(data.summary.calculatedTotalSeconds)}
            </dd>
            <dt>Bilinen tahmin</dt>
            <dd>{duration(data.summary.knownEstimatedSeconds)}</dd>
            <dt>Tahminsiz iş</dt>
            <dd>{data.summary.unknownEstimateCount}</dd>
            <dt>Hedef toplam bütçe</dt>
            <dd>
              {data.summary.targetBudgetSeconds === null ? "Belirtilmedi" : duration(data.summary.targetBudgetSeconds)}
            </dd>
            <dt>Hedef farkı</dt>
            <dd>
              {data.summary.targetDifferenceSeconds === null
                ? "Hesaplanamıyor"
                : duration(data.summary.targetDifferenceSeconds)}
            </dd>
          </dl>
          <p className="muted form-hint">
            Hesaplanan iş kendi ve alt görevlerin tahminlerini birer kez içerir. Hedef bütçe bu toplama eklenmez; fark
            kendiliğinden yeni iş olmaz.
          </p>
          <dl className="task-metrics" aria-label="Gerçek çalışma ve kalan">
            <dt>Kendi gerçek çalışması</dt>
            <dd>{duration(data.time.directActualSeconds)}</dd>
            <dt>Alt ağaç gerçek çalışması</dt>
            <dd>{duration(data.time.subtreeActualSeconds)}</dd>
            <dt>Kalan iş</dt>
            <dd>
              {data.time.remainingSeconds === null ? "Tam kalan bilinmiyor" : duration(data.time.remainingSeconds)}
            </dd>
            <dt>Bilinen kalan</dt>
            <dd>{duration(data.time.knownRemainingSeconds)}</dd>
            <dt>Kalanı tahminsiz iş</dt>
            <dd>{data.time.unknownRemainingCount}</dd>
            <dt>Bilinen tahmin aşımı</dt>
            <dd>{duration(data.time.knownOvertimeSeconds)}</dd>
          </dl>
          <p className="muted form-hint">
            Alt ağaç gerçek çalışması kendi çalışmasını da içerir; ikisini toplama. Tahminin tükenmesi görevi
            tamamlamaz. Süreler son sunucu okumasındandır.
          </p>
          <dl className="task-metrics" aria-label="İlerleme">
            <dt>İş adediyle ilerleme</dt>
            <dd>
              {percentage(data.progress.countProgress)} ({data.progress.completedComponentCount}/
              {data.progress.componentCount} kendi işi)
            </dd>
            <dt>Süre ağırlıklı ilerleme</dt>
            <dd>{percentage(data.progress.durationProgress)}</dd>
            <dt>Tamamlanan görevler</dt>
            <dd>
              {data.progress.completedTaskCount}/{data.progress.totalTaskCount}
            </dd>
          </dl>
          <p className="muted form-hint">
            Tahminsiz iş veya sıfır toplam süre varsa süre oranı hesaplanamaz. Görev sayısı ile bağımsız iş adedi
            farklıdır.
          </p>
        </>
      )}
      {!task.archivedAt && <button onClick={event => edit(event.currentTarget)}>Süre ve bütçeyi düzenle</button>}
      <details className="subtree-disclosure" onToggle={event => setComponents(event.currentTarget.open)}>
        <summary>Açık iş bileşenleri</summary>
        {components && <WorkComponents id={task.id} />}
      </details>
    </div>
  );
}
function WorkComponents({ id }: { id: string }) {
  const [offset, setOffset] = useState(0);
  const query = useWorkComponents(id, offset);
  const open = useTaskPanel();
  const data = query.data;
  return (
    <section aria-label="Açık iş bileşenleri listesi">
      <p className="muted form-hint">
        Yalnız çalışılabilir durumdaki açık kendi işleridir. Kapsayıcılar ve kapanmış işler burada yer almaz.
        Yanlarındaki süre tahmindir; kalan süre veya takvim tahsisi değildir.
      </p>
      {query.isError && (
        <div role="alert">
          <p>{workFailure(query.error)}</p>
          <button onClick={() => void query.refetch()}>İş bileşenlerini yeniden yükle</button>
        </div>
      )}
      {!data && !query.isError && <p role="status">İş bileşenleri okunuyor…</p>}
      {data && (
        <>
          <p role="status">
            {offset + data.items.length} / {data.total} açık iş
          </p>
          <ul className="work-components">
            {data.items.map((item, index) => (
              <li key={item.taskId}>
                <button onClick={event => open(item.taskId, event.currentTarget)}>
                  İş {offset + index + 1} ayrıntısını aç
                </button>
                <span>{item.estimatedSeconds === null ? "Tahmin belirtilmedi" : duration(item.estimatedSeconds)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="actions">
        <button disabled={offset === 0 || query.isFetching} onClick={() => setOffset(value => Math.max(0, value - 25))}>
          Önceki işler
        </button>
        <button
          disabled={
            !data || offset + data.items.length >= Number(data.total) || offset + 25 > 100000 || query.isFetching
          }
          onClick={() => setOffset(value => value + 25)}
        >
          Sonraki işler
        </button>
      </div>
    </section>
  );
}

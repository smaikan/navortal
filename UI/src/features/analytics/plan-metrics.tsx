import { duration } from "./model";
import { percent, signedDuration, type PlanMetrics } from "./plan-model";
const count = (v: number | string) => Number(v).toLocaleString("tr-TR");
type Row = [string, (m: PlanMetrics) => string];
const rows: Row[] = [
  ["Planlanan çalışma", m => duration(m.plannedWorkSeconds)],
  ["Çakışan plan süresi", m => duration(m.conflictingPlannedSeconds)],
  ["Tamamlanan / bağımsız iş sayısı", m => `${count(m.completedComponentCount)} / ${count(m.componentCount)}`],
  ["İş sayısına göre tamamlanma", m => percent(m.countCompletion)],
  [
    "Tamamlanan bilinen tahmin / bilinen tahmin",
    m => `${duration(m.knownCompletedEstimatedSeconds)} / ${duration(m.knownEstimatedSeconds)}`,
  ],
  ["Bilinen tahmin süresine göre tamamlanma", m => percent(m.durationCompletion)],
  ["Tahmin kapsamı", m => percent(m.estimateCoverage)],
  ["Tahmini bilinmeyen iş sayısı", m => count(m.unknownEstimateCount)],
  ["Tamamlanması bilinmeyen iş sayısı", m => count(m.unknownCompletionCount)],
  ["Çelişen tahmin sayısı", m => count(m.conflictingEstimateCount)],
  ["Geçmiş bağlamı eksik blok sayısı", m => count(m.missingSnapshotBlockCount)],
  ["Karşılanan günlük kota / kota", m => `${duration(m.quotaFulfilledSeconds)} / ${duration(m.quotaSeconds)}`],
  ["Günlük kota karşılama oranı", m => percent(m.quotaRatio)],
  ["Bu planda bulunmayan gerçek çalışma", m => duration(m.unplannedActualSeconds)],
  ["Tahmin sapması örnek sayısı", m => count(m.accuracy.sampleCount)],
  ["Kaydedilmiş süre olmadığı için dışlanan iş", m => count(m.accuracy.excludedWithoutRecordedWorkCount)],
  ["Ortalama tahmin hatası (gerçek − tahmin)", m => signedDuration(m.accuracy.meanErrorSeconds)],
  ["Ortalama mutlak tahmin hatası", m => duration(m.accuracy.meanAbsoluteErrorSeconds)],
];
export function PlanComparison({
  baseline,
  current,
  label = "Plan karşılaştırması",
}: {
  baseline: PlanMetrics;
  current: PlanMetrics;
  label?: string;
}) {
  return (
    <div role="region" aria-label={label} tabIndex={0} style={{ overflowX: "auto", maxWidth: "100%" }}>
      <table style={{ tableLayout: "fixed" }}>
        <caption>
          <span style={{ display: "block", maxWidth: "30ch" }}>
            {label} · ilk kabul ve son kabul ayrı referanslardır
          </span>
        </caption>
        <thead>
          <tr>
            <th scope="col">Ölçüm</th>
            <th scope="col">İlk plan</th>
            <th scope="col">Güncel plan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([title, value]) => (
            <tr key={title}>
              <th scope="row">{title}</th>
              <td>{value(baseline)}</td>
              <td>{value(current)}</td>
            </tr>
          ))}
          {(["fixedStarts", "flexibleStarts"] as const).flatMap(key => {
            const title = key === "fixedStarts" ? "Sabit başlangıç" : "Esnek başlangıç";
            const fields: [string, (m: PlanMetrics) => string][] = [
              [`${title} · örnek`, m => count(m[key].sampleCount)],
              [
                `${title} · erken / tolerans içinde / geç`,
                m => `${count(m[key].earlyCount)} / ${count(m[key].onTimeCount)} / ${count(m[key].lateCount)}`,
              ],
              [`${title} · işaretli ortalama sapma`, m => signedDuration(m[key].averageSignedDelaySeconds)],
              [`${title} · yalnız geç başlayanların ortalaması`, m => duration(m[key].averageLateSeconds)],
            ];
            return fields.map(([name, value]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                <td>{value(baseline)}</td>
                <td>{value(current)}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}

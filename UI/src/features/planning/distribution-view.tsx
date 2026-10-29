"use client";
import { useState } from "react";
import { ProposalContentView, UnplacedView } from "./proposal-view";
import type { Distribution } from "./distribution-model";
export function DistributionView({
  proposal,
  selected,
  format,
}: {
  proposal: Distribution;
  selected: ReadonlyMap<string, string>;
  format: string;
}) {
  const [index, setIndex] = useState(0);
  const day = proposal.days[Math.min(index, proposal.days.length - 1)];
  return (
    <section aria-label="Günlere göre öneri">
      <h3>Dağıtım sonucu</h3>
      <p>
        Geçerlilik sonu:{" "}
        <time dateTime={proposal.expiresAt}>
          {new Intl.DateTimeFormat("tr-TR", {
            timeZone: day.timeZoneId,
            dateStyle: "medium",
            timeStyle: "medium",
          }).format(new Date(proposal.expiresAt))}
        </time>{" "}
        · {day.timeZoneId}
      </p>
      {proposal.hasConstraintConflicts && (
        <p role="status" className="form-notice">
          Kısıt çatışması var; hiçbir gün uygulanamaz. Yeni önizleme gerekiyor.
        </p>
      )}
      {proposal.isPartial && (
        <p className="form-notice">
          Kısmi telafi: yalnız gösterilen uygun gelecek etkiler uygulanabilir. Gerçek çalışma ve görev tamamlanması
          korunur.
        </p>
      )}
      <p>Aralık sonunda yerleşmeyen miktar aşağıdadır. Günlük ara eksikler toplanmaz; aynı iş çoğaltılmaz.</p>
      <UnplacedView pageKey={proposal.proposalId} items={proposal.unplaced} names={selected} />
      <nav aria-label="Dağıtım günleri" className="task-pagination">
        <button disabled={!index} onClick={() => setIndex(index - 1)}>
          Önceki gün
        </button>
        <div>
          <label htmlFor="distribution-day">Öneri günü</label>
          <select
            id="distribution-day"
            value={day.localDate}
            onChange={e => setIndex(proposal.days.findIndex(d => d.localDate === e.target.value))}
          >
            {proposal.days.map(d => (
              <option key={d.localDate} value={d.localDate}>
                {d.localDate}
              </option>
            ))}
          </select>
        </div>
        <button disabled={index >= proposal.days.length - 1} onClick={() => setIndex(index + 1)}>
          Sonraki gün
        </button>
      </nav>
      <section aria-label={`Önerilen gün ${day.localDate}`}>
        <h3>{day.localDate}</h3>
        <ProposalContentView
          key={`${proposal.proposalId}-${day.localDate}`}
          content={day}
          pageKey={`${proposal.proposalId}-${day.localDate}`}
          zone={day.timeZoneId}
          selected={selected}
          format={format}
          showUnplaced={false}
        />
      </section>
    </section>
  );
}

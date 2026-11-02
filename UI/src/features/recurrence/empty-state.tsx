import { ArrowUpRight, BookOpen, CalendarDays, CalendarRange, Dumbbell, Plus, Repeat } from "lucide-react";
import { recurrenceStarters, type RecurrenceStarter } from "./starters";

const icons = [BookOpen, CalendarDays, Dumbbell, CalendarRange];
export function RecurrenceEmpty({
  locked,
  create,
}: {
  locked: boolean;
  create: (trigger: HTMLElement, starter?: RecurrenceStarter) => void;
}) {
  return (
    <div className="recurrence-empty">
      <div className="recurrence-empty-copy">
        <span className="recurrence-empty-mark" aria-hidden="true">
          <Repeat size={28} strokeWidth={1.6} />
        </span>
        <h2>Rutinine bir yer aç.</h2>
        <p>
          Düzenli yaptığın işleri bir kez tanımla. Ne sıklıkta tekrar edeceğini ve gün planlarına eklenmesini sen seç.
        </p>
        <button type="button" className="primary" disabled={locked} onClick={e => create(e.currentTarget)}>
          <Plus size={18} aria-hidden="true" />
          Rutin oluştur
        </button>
      </div>
      <section className="recurrence-starters" aria-labelledby="recurrence-starters-title">
        <h3 id="recurrence-starters-title">Bir örnekle başla</h3>
        <p>Kendi ritmine göre düzenleyebilirsin.</p>
        <ul>
          {recurrenceStarters.map(({ label, hint, draft }, i) => {
            const Icon = icons[i];
            return (
              <li key={label}>
                <button type="button" disabled={locked} onClick={e => create(e.currentTarget, draft)}>
                  <Icon className="recurrence-starter-icon" size={21} strokeWidth={1.6} aria-hidden="true" />
                  <span>
                    <strong>{label}</strong>
                    <small>{hint}</small>
                  </span>
                  <ArrowUpRight className="recurrence-starter-arrow" size={17} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

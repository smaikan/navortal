"use client";
import { TemporalInput } from "../../components/ui/temporal-input";
import { RangeFields } from "./range-fields";
import { days, weekOrder, type Draft, type FieldIssue } from "./model";

export function CalendarFields({
  draft,
  errors,
  change,
}: {
  draft: Draft;
  errors: FieldIssue[];
  change: (draft: Draft) => void;
}) {
  const range = () => ({ id: crypto.randomUUID(), start: "", end: "" });
  return (
    <>
      <section className="preferences-section" aria-labelledby="weekly-title">
        <h2 id="weekly-title">Haftalık çalışma saatleri</h2>
        <div className="hours-week">
          {weekOrder.map(day => {
            const items = draft.weekly.filter(item => item.dayOfWeek === day);
            return (
              <fieldset className="hours-day" key={day}>
                <legend>{days[day]}</legend>
                {!items.length && <p className="muted">Saat belirlenmedi</p>}
                {items.map((item, i) => (
                  <RangeFields
                    key={item.id}
                    value={item}
                    path="weekly"
                    label={`${days[day]} ${i + 1}`}
                    errors={errors}
                    onChange={value =>
                      change({
                        ...draft,
                        weekly: draft.weekly.map(row => (row.id === item.id ? { ...row, ...value } : row)),
                      })
                    }
                    onRemove={() => change({ ...draft, weekly: draft.weekly.filter(row => row.id !== item.id) })}
                  />
                ))}
                <button
                  type="button"
                  disabled={draft.weekly.length >= 70}
                  onClick={() => change({ ...draft, weekly: [...draft.weekly, { ...range(), dayOfWeek: day }] })}
                  aria-label={`${days[day]} saat aralığı ekle`}
                >
                  Aralık ekle
                </button>
              </fieldset>
            );
          })}
        </div>
      </section>
      <section className="preferences-section" aria-labelledby="exceptions-title">
        <h2 id="exceptions-title">Tarih istisnaları</h2>
        {!draft.exceptions.length && <p className="muted preference-empty">Henüz tarih istisnası yok.</p>}
        {draft.exceptions.map((item, i) => {
          const path = `exceptions.${item.id}.date`;
          const error = errors.find(issue => issue.path === path)?.message;
          const update = (value: typeof item) =>
            change({ ...draft, exceptions: draft.exceptions.map(row => (row.id === item.id ? value : row)) });
          return (
            <fieldset className="date-exception" key={item.id}>
              <legend>Tarih istisnası {i + 1}</legend>
              <div className="exception-header">
                <div className="hours-field">
                  <label htmlFor={path}>
                    Tarih <span className="sr-only">istisnası {i + 1}</span>
                  </label>
                  <TemporalInput
                    id={path}
                    name={path}
                    type="date"
                    min="0002-01-01"
                    max="9998-12-31"
                    value={item.date}
                    onChange={event => update({ ...item, date: event.target.value })}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${path}-error` : undefined}
                  />
                  {error && (
                    <p className="field-error" id={`${path}-error`}>
                      {error}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => change({ ...draft, exceptions: draft.exceptions.filter(row => row.id !== item.id) })}
                  aria-label={`Tarih istisnası ${i + 1} kaldır`}
                >
                  İstisnayı kaldır
                </button>
              </div>
              {!item.intervals.length && <p className="muted preference-empty">Bu tarihte çalışma saati yok.</p>}
              {item.intervals.map((row, j) => (
                <RangeFields
                  key={row.id}
                  value={row}
                  path={`exceptions.${item.id}`}
                  label={`İstisna ${i + 1} ${j + 1}`}
                  errors={errors}
                  onChange={value =>
                    update({
                      ...item,
                      intervals: item.intervals.map(interval => (interval.id === row.id ? value : interval)),
                    })
                  }
                  onRemove={() =>
                    update({ ...item, intervals: item.intervals.filter(interval => interval.id !== row.id) })
                  }
                />
              ))}
              <button
                type="button"
                disabled={item.intervals.length >= 24}
                onClick={() => update({ ...item, intervals: [...item.intervals, range()] })}
                aria-label={`İstisna ${i + 1} saat aralığı ekle`}
              >
                Aralık ekle
              </button>
            </fieldset>
          );
        })}
        <button
          type="button"
          disabled={draft.exceptions.length >= 366}
          onClick={() =>
            change({
              ...draft,
              exceptions: [...draft.exceptions, { id: crypto.randomUUID(), date: "", intervals: [] }],
            })
          }
        >
          Tarih istisnası ekle
        </button>
      </section>
    </>
  );
}

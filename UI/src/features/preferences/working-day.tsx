"use client";
import { TemporalInput } from "../../components/ui/temporal-input";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { clock, localToday, validDate } from "./model";

/** Yalnız kayıtlı saatleri okuyoruz. Yaz saati sınırları doğrudan API'den gelir, istemci plan motorundan değil. */
export function WorkingDay({ zone, version, dirty }: { zone: string; version: number | string; dirty: boolean }) {
  const { state, session } = useSession();
  const [date, setDate] = useState(() => localToday(zone));
  const day = useQuery({
    queryKey: queryKeys.resource(state.user!.id, "working-hours", { date, version }),
    queryFn: ({ signal }) => session.api.read("/api/preferences/working-hours", { query: { date }, signal }),
    enabled: validDate(date),
    networkMode: "always",
  });
  return (
    <section className="preferences-section saved-hours" aria-labelledby="saved-hours-title">
      <h2 id="saved-hours-title">Kaydedilmiş bir günü kontrol et</h2>
      <p className="muted">
        {dirty
          ? "Bu görünüm kaydedilmemiş değişikliklerini içermez."
          : "Haftalık saatlerin ve tarih istisnaların birlikte değerlendirilir."}{" "}
        Yaz/kış saati geçişlerinde sunucunun döndürdüğü aralıklar gösterilir.
      </p>
      <div className="hours-field">
        <label htmlFor="working-date">Kontrol edilecek tarih</label>
        <TemporalInput
          id="working-date"
          type="date"
          min="0002-01-01"
          max="9998-12-31"
          value={date}
          onChange={event => setDate(event.target.value)}
        />
      </div>
      {!validDate(date) ? (
        <p className="field-error">Geçerli bir tarih seç.</p>
      ) : day.isPending ? (
        <p role="status">Çalışma saatleri okunuyor…</p>
      ) : day.isError ? (
        <div role="alert">
          <p>Kaydedilmiş saatler alınamadı. Bağlantını kontrol et.</p>
          <button type="button" onClick={() => void day.refetch()}>
            Saatleri yeniden yükle
          </button>
        </div>
      ) : (
        <div aria-live="polite">
          <p>{date}</p>
          {day.data.localIntervals.length === 0 ? (
            <p className="muted">Bu gün için çalışma saati yok.</p>
          ) : (
            <ul>
              {day.data.localIntervals.map((range, i) => (
                <li key={i}>
                  {clock(range.startMinute)}–{clock(range.endMinute)}
                </li>
              ))}
            </ul>
          )}
          <details>
            <summary>UTC aralıklarını göster</summary>
            {!day.data.utcIntervals.length ? (
              <p className="muted">UTC aralığı yok.</p>
            ) : (
              <ul>
                {day.data.utcIntervals.map((range, i) => (
                  <li key={i}>
                    <time dateTime={range.startsAt}>{range.startsAt}</time> —{" "}
                    <time dateTime={range.endsAt}>{range.endsAt}</time>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </div>
      )}
    </section>
  );
}

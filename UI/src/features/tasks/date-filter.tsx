"use client";
import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { TemporalInput } from "../../components/ui/temporal-input";

const short = (value: string) =>
  new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );

/** Kapalıyken diğer filtreler gibi tek satır durur. Tek gün için tek alan yeter. */
export function DateFilter({
  from,
  to,
  change,
}: {
  from: string;
  to: string;
  change: (from: string | null, to: string | null) => void;
}) {
  const box = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function close(event: PointerEvent | KeyboardEvent) {
      const element = box.current;
      if (!element?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        element.open = false;
        element.querySelector("summary")?.focus();
      } else if (!element.contains(event.target as Node)) element.open = false;
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  // Ters girilen aralık sessizce düzelir; boş kalan uç diğerine eşitlenir.
  function pick(nextFrom: string, nextTo: string) {
    const a = nextFrom || nextTo;
    const b = nextTo || nextFrom;
    if (!a) return change(null, null);
    change(a <= b ? a : b, a <= b ? b : a);
  }
  return (
    <details ref={box} className={`r2-date-filter${from ? " active" : ""}`}>
      <summary>
        {from ? (from === to ? short(from) : `${short(from)} – ${short(to)}`) : "Tüm tarihler"}
        <ChevronDown aria-hidden="true" size={14} />
      </summary>
      <div className="r2-date-pop">
        <label>
          Başlangıç
          <TemporalInput type="date" value={from} max="9998-12-31" onChange={event => pick(event.target.value, to)} />
        </label>
        <label>
          Bitiş
          <TemporalInput type="date" value={to} max="9998-12-31" onChange={event => pick(from, event.target.value)} />
        </label>
      </div>
    </details>
  );
}

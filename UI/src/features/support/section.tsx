"use client";
import { lazy, Suspense, useState } from "react";
import type { Day } from "../planning/model";
import "./styles.css";
const Panel = lazy(() => import("./panel").then(m => ({ default: m.SupportPanel })));
export function SupportSection({ day, format }: { day: Day; format: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="support-section" aria-label="İsteğe bağlı günlük destekler">
      <button aria-expanded={open} onClick={() => setOpen(!open)}>
        Günlük destekler
      </button>
      {open && (
        <Suspense fallback={<p role="status">Destekler hazırlanıyor…</p>}>
          <Panel day={day} format={format} />
        </Suspense>
      )}
    </section>
  );
}

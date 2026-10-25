"use client";
import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Surface } from "./surface";

/** İki planlama aracında aynı küçük bilgi girişi ve erişilebilir açıklama var. */
export function FeatureInfo({ title, children }: { title: string; children: ReactNode }) {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  return (
    <>
      <button type="button" className="ghost feature-info-button" onClick={event => setTrigger(event.currentTarget)}>
        <Info size={17} aria-hidden="true" /> Bilgi
      </button>
      {trigger && (
        <Surface title={title} modal placement="center" returnTo={trigger} onClose={() => setTrigger(null)}>
          <div className="feature-info-content">{children}</div>
        </Surface>
      )}
    </>
  );
}

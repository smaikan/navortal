"use client";
import Link from "next/link";
import { Check } from "lucide-react";
import { useSession } from "../auth/provider";
import { useTaskPicker } from "../tasks/picker";
import { useLocal, writeLocal } from "../../lib/local-preference";
import "./styles.css";

/** Yeni hesapta ilk günü üç adımda kurduran karşılama. Görev varsa ikinci adım öne çıkar; "Şimdilik atla" kartı kalıcı gizler. */
export function Welcome({ date }: { date: string }) {
  const { state } = useSession();
  const owner = state.user?.id ?? "";
  const key = `adhd.welcome.v1:${owner}`;
  const hidden = useLocal(key) === "1";
  const query = useTaskPicker(date, "");
  const first = query.data?.pages[0];
  if (hidden || !owner || !first) return null;
  const hasTasks = Number(first.assigned.total) + Number(first.other.total) > 0;
  const done = hasTasks ? 1 : 0;
  const focusInput = () =>
    document.querySelector<HTMLInputElement>(".r2-add-plan-large input")?.focus({ preventScroll: false });
  const steps = [
    { title: "İlk görevini ekle", hint: "Aklındaki bir işi yaz.", action: "Görev ekle" },
    { title: "Görevi bugüne planla", hint: "Bugün neye bakacağını bil.", action: "Bugüne ekle" },
    { title: "25 dakikalık bir odak başlat", hint: "Pomodoro ile ilk çalışmanı kaydet.", action: "" },
  ];
  return (
    <section className="r2-welcome" aria-labelledby="r2-welcome-title">
      <div>
        <h2 id="r2-welcome-title">Hoş geldin</h2>
        <p>Üç küçük adımla ilk gününü kur. İstediğin zaman atlayabilirsin.</p>
      </div>
      <div className="r2-welcome-progress" role="img" aria-label={`${done} / 3 adım tamam`}>
        <span className="r2-welcome-track">
          <span style={{ width: `${(done / 3) * 100}%` }} />
        </span>
        <b>{done} / 3</b>
      </div>
      <ol className="r2-welcome-steps">
        {steps.map((step, index) => {
          const state = index < done ? "done" : index === done ? "current" : "next";
          return (
            <li
              key={step.title}
              className={`r2-welcome-step ${state}`}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="r2-welcome-mark" aria-hidden="true">
                {state === "done" ? <Check size={16} /> : index + 1}
              </span>
              <span className="r2-welcome-text">
                <strong>{step.title}</strong>
                <span>{state === "done" ? "Tamamlandı" : step.hint}</span>
                {state === "current" && step.action && (
                  <button type="button" className="primary" onClick={focusInput}>
                    {step.action}
                  </button>
                )}
                {index === 2 && state !== "done" && (
                  <Link href="/focus" prefetch={false} className="r2-welcome-link">
                    Pomodoro’ya git
                  </Link>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="r2-quiet-link"
        onClick={() => {
          writeLocal(key, "1");
        }}
      >
        Şimdilik atla
      </button>
    </section>
  );
}

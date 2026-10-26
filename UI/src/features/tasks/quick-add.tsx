"use client";
import { useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useSession } from "../auth/provider";
import { ApiError } from "../../lib/api/errors";
import { readPage, readTask, taskFailure, titleIssue } from "./model";
import { useTaskCache } from "./queries";

export function QuickAdd() {
  const { session } = useSession();
  const cache = useTaskCache();
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [message, setMessage] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [checked, setChecked] = useState(false);
  const busy = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const focusInput = useRef(false);
  const id = useId();
  const titleId = `${id}-title`,
    hintId = `${id}-hint`;
  useLayoutEffect(() => {
    if (!pending && !uncertain && focusInput.current) {
      focusInput.current = false;
      input.current?.focus();
    }
  }, [pending, uncertain, message]);
  async function add(event: FormEvent) {
    event.preventDefault();
    if (busy.current || uncertain) return;
    const issue = titleIssue(title);
    setFailure(issue ?? "");
    setMessage("");
    if (issue) {
      input.current?.focus();
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      const raw = await session.api.mutation("/api/tasks", "post", { body: { title } }).execute();
      let task;
      try {
        task = readTask(raw);
      } catch {
        throw new ApiError("protocol", "Yanıt eksik.", 201, undefined, {}, undefined, undefined, true);
      }
      if (!cache.current()) return;
      focusInput.current = true;
      setTitle("");
      setMessage("Görev eklendi. Henüz takvime yerleştirilmedi.");
      void cache.update(task);
    } catch (error) {
      if (!cache.current()) return;
      setFailure(taskFailure(error));
      setUncertain(error instanceof ApiError && error.outcomeUnknown);
      setChecked(false);
      requestAnimationFrame(() => errorBox.current?.focus());
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <section className="quick-add" aria-label="Hızlı görev ekle">
      <form onSubmit={event => void add(event)} noValidate>
        <label htmlFor={titleId}>Aklındaki işi yaz</label>
        <div className="quick-add-controls">
          <input
            ref={input}
            id={titleId}
            maxLength={300}
            value={title}
            onChange={event => {
              setTitle(event.target.value);
              setMessage("");
              if (!uncertain) setFailure("");
            }}
            disabled={pending || uncertain}
            placeholder="Örneğin: Sunumun ilk taslağını hazırla"
            aria-describedby={hintId}
          />
          <button className="primary" disabled={pending || uncertain}>
            {pending ? "Ekleniyor…" : "Ekle"}
          </button>
        </div>
        <p id={hintId} className="muted form-hint">
          Başlık ve Enter yeterli. Ayrıntıları sonra ekleyebilirsin.
        </p>
      </form>
      {failure && (
        <div ref={errorBox} role="alert" tabIndex={-1} className="form-error">
          <p>{failure}</p>
          {uncertain && (
            <>
              <button
                disabled={pending}
                onClick={async () => {
                  if (busy.current) return;
                  busy.current = true;
                  setPending(true);
                  try {
                    const result = readPage(
                      await session.api.read("/api/tasks", {
                        query: { search: title.trim().slice(0, 200), includeArchived: true, limit: 25 },
                      }),
                    );
                    if (cache.current()) {
                      await cache.update();
                      setChecked(true);
                      setMessage(
                        `${result.total} benzer başlık bulundu. Listeyi ve filtreleri kontrol et; aynı başlıktaki kayıtlar farklı işler olabilir.`,
                      );
                    }
                  } catch {
                    if (cache.current()) {
                      setChecked(false);
                      setFailure(
                        "Sonuç kontrol edilemedi. İlk ekleme kaydedilmiş olabilir; bağlantını kontrol edip listeyi yeniden kontrol et.",
                      );
                    }
                  } finally {
                    busy.current = false;
                    setPending(false);
                  }
                }}
              >
                Listeyi kontrol et
              </button>
              {checked && (
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "Listeyi ve filtreleri kontrol ettin mi? İlk istek kaydedildiyse yeniden eklemek ikinci bir görev oluşturur.",
                      )
                    ) {
                      focusInput.current = true;
                      setUncertain(false);
                      setChecked(false);
                      setFailure("");
                    }
                  }}
                >
                  Kontrol ettim, yeniden eklemeyi aç
                </button>
              )}
            </>
          )}
        </div>
      )}
      <p role="status" className="task-feedback">
        {message}
      </p>
    </section>
  );
}

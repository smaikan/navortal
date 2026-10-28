"use client";
import { useRef, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { useSession } from "../auth/provider";
import { ApiError } from "../../lib/api/errors";
import {
  nameIssue,
  nameLimit,
  readResource,
  resourceFailure,
  resourceFields,
  resourceKinds,
  type Resource,
  type ResourceKind,
} from "./model";
import { resourceApi, useCollectionCache } from "./queries";

/** Oluşturmada idempotency anahtarı yok. Sonuç belirsizse liste kontrol edilene kadar form kilitli. */
export function CreateResource({ kind, created }: { kind: ResourceKind; created: (resource: Resource) => void }) {
  const meta = resourceKinds[kind];
  const { session } = useSession();
  const cache = useCollectionCache(kind);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [field, setField] = useState("");
  const [done, setDone] = useState("");
  const [unknown, setUnknown] = useState(false);
  const busy = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || unknown) return;
    const issue = nameIssue(name);
    if (issue) {
      setField(issue);
      input.current?.focus();
      return;
    }
    let body;
    try {
      body = resourceFields({ name, description: "" });
    } catch (error) {
      setFailure(resourceFailure(error));
      return;
    }
    busy.current = true;
    setPending(true);
    setFailure("");
    setField("");
    setDone("");
    try {
      const raw = await resourceApi.create(session.api, kind, body);
      let resource;
      try {
        resource = readResource(raw);
      } catch {
        throw new ApiError("protocol", "Yanıt eksik.", 201, undefined, {}, undefined, undefined, true);
      }
      if (!cache.current()) return;
      setName("");
      setDone(`${meta.singular} oluşturuldu: ${resource.name}`);
      void cache.update(resource);
      created(resource);
    } catch (error) {
      if (!cache.current()) return;
      const known = error instanceof ApiError && !error.outcomeUnknown;
      if (
        known &&
        (error.fieldErrors.name?.length || error.code === "resource_invalid" || error.code === "validation_failed")
      ) {
        setField(resourceFailure(error));
        input.current?.focus();
      } else {
        const uncertain = error instanceof ApiError && error.outcomeUnknown;
        // Kaydın olup olmadığına karar vermeden önce liste yeniden okunmalı.
        setUnknown(uncertain);
        setFailure(resourceFailure(error, true));
        if (uncertain) void cache.refreshList();
        requestAnimationFrame(() => errorBox.current?.focus());
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  // Listenin altında tek ekleme satırı var. Açıklama daha sonra ayrıntıdan ekleniyor.
  return (
    <section className="resource-create r2-create-line" aria-label={meta.create}>
      <form onSubmit={event => void submit(event)} noValidate>
        <fieldset disabled={pending || unknown}>
          <Plus aria-hidden="true" size={14} />
          <label htmlFor={`${kind}-name`} className="sr-only">
            Yeni {meta.lower} adı
          </label>
          <input
            id={`${kind}-name`}
            ref={input}
            maxLength={nameLimit}
            placeholder={`Yeni ${meta.lower}`}
            value={name}
            aria-invalid={field ? true : undefined}
            aria-describedby={field ? `${kind}-name-error` : undefined}
            onChange={event => {
              setName(event.target.value);
              setField("");
              setDone("");
            }}
          />
          {name.trim() && <button className="r2-soft">{pending ? "Oluşturuluyor…" : meta.create}</button>}
        </fieldset>
        {field && (
          <p id={`${kind}-name-error`} className="field-error">
            {field}
          </p>
        )}
      </form>
      {failure && (
        <div ref={errorBox} role="alert" tabIndex={-1} className="form-error">
          <p>{failure}</p>
          {unknown && (
            <button
              type="button"
              onClick={() => {
                setUnknown(false);
                setFailure("");
              }}
            >
              Listeyi kontrol ettim, formu aç
            </button>
          )}
        </div>
      )}
      <p role="status" className="task-feedback">
        {done}
      </p>
    </section>
  );
}

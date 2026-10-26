"use client";
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Plus } from "lucide-react";
import { Menu } from "../../../components/ui/menu";
import { useSession } from "../../auth/provider";
import { ApiError } from "../../../lib/api/errors";
import { useTaskCache } from "../queries";
import {
  addRow,
  addSibling,
  draftFilled,
  draftIssue,
  draftMaxDepth,
  draftMaxRows,
  draftTree,
  editRow,
  indent,
  outdent,
  removeRow,
  type DraftRow,
} from "./draft";
import { useTree } from "./view";

/**
 * Kök "Görev ekle" satırı. Alt görev açılmadıkça Enter bugünkü gibi tek görevi hemen kaydeder.
 * "+" ile açılan alt görevler "Ekle" (Ctrl+Enter) ile tek atomik istekte gider. Belirsiz sonuçta
 * otomatik tekrar yok: taslak kalır, kullanıcı yeniden gönderirse aynı anahtar ve gövde kullanılır.
 */
export function NewTaskDraft() {
  const tree = useTree();
  const { session } = useSession();
  const cache = useTaskCache();
  const id = useId();
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<{
    body: string;
    command: ReturnType<typeof session.api.mutation<"/api/tasks/tree", "post">>;
  } | null>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const focusTarget = useRef<string | null>(null);
  const counter = useRef(0);
  const next = () => `${id}-row-${++counter.current}`;
  const branching = rows.length > 0;
  const full = rows.length >= draftMaxRows;

  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    // Menü kapanınca odağı kendi düğmesine verir; kaldırılan satırda düğme yok, hedefi sonra odaklıyoruz.
    const frame = requestAnimationFrame(() => inputs.current.get(target)?.focus());
    return () => cancelAnimationFrame(frame);
  });

  function change(nextRows: DraftRow[], focus?: string) {
    setRows(nextRows);
    setError("");
    setStatus("");
    if (focus) focusTarget.current = focus;
  }
  function close() {
    pending.current = null;
    tree.setAdding(null);
  }
  function openFirst() {
    const row = next();
    change(addRow(rows, row), row);
  }

  async function saveSingle() {
    if (busy) return;
    setBusy(true);
    try {
      await tree.actions.add(null, title);
      setTitle("");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Görev eklenemedi.");
    } finally {
      setBusy(false);
    }
  }
  async function saveTree() {
    if (busy) return;
    if (!draftFilled(rows)) return void saveSingle();
    const issue = draftIssue(title, rows);
    if (issue) return setError(issue);
    const node = draftTree(title, rows);
    const body = JSON.stringify(node);
    const retry = pending.current?.body === body;
    if (!retry) pending.current = { body, command: session.api.mutation("/api/tasks/tree", "post", { body: node }) };
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await pending.current!.command.execute({ retryUnknownResult: retry });
      pending.current = null;
      setTitle("");
      setRows([]);
      setStatus(`${result.root.title} ve ${result.created.length - 1} alt görev eklendi.`);
      focusTarget.current = "title";
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.outcomeUnknown
          ? "Kaydedildi mi anlaşılamadı. Taslak duruyor; yeniden eklersen aynı istek gider ve görevler iki kez oluşmaz."
          : cause instanceof ApiError && cause.status === 400
            ? "Görev ve alt görev adları 1–300 karakter olmalı; en çok 49 alt görev ve 5 seviye."
            : "Eklenemedi. Taslak duruyor; bağlantını kontrol edip yeniden dene.",
      );
      if (!(cause instanceof ApiError && cause.outcomeUnknown)) pending.current = null;
    } finally {
      setBusy(false);
      void cache.manyChanged();
    }
  }

  function common(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return true;
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void saveTree();
      return true;
    }
    return false;
  }
  function titleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (common(event) || event.key !== "Enter") return;
    event.preventDefault();
    if (!branching) void saveSingle();
    else inputs.current.get(rows[0].id)?.focus();
  }
  function rowKey(event: KeyboardEvent<HTMLInputElement>, row: DraftRow) {
    if (common(event)) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (!row.text.trim()) return;
      const i = rows.findIndex(x => x.id === row.id);
      const after = rows[i + 1];
      if (after && !after.text.trim() && after.depth === row.depth) return void inputs.current.get(after.id)?.focus();
      const fresh = next();
      change(addSibling(rows, fresh, row.id), fresh);
    } else if (event.key === "Tab") {
      const moved = event.shiftKey ? outdent(rows, row.id) : indent(rows, row.id);
      // Girinti mümkün değilse Tab odağı normal ilerletir; satır içinde tuzak yok.
      if (!moved) return;
      event.preventDefault();
      change(moved, row.id);
    } else if (event.key === "Backspace" && !row.text && rows.length > 1) {
      event.preventDefault();
      const i = rows.findIndex(x => x.id === row.id);
      change(removeRow(rows, row.id), rows[i - 1]?.id ?? rows[i + 1]?.id ?? "title");
    }
  }

  return (
    <li
      className={`r2-add active r2-add-draft${branching ? " branching" : ""}`}
      aria-busy={busy || undefined}
      onKeyDown={event => {
        // Taslağın herhangi bir yerinde Esc vazgeçer; açık menü kendi Esc'ini önce kullanır.
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
      onBlur={event => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        if (!title.trim() && !draftFilled(rows) && !busy) close();
      }}
    >
      <div className="r2-add-line">
        <Plus aria-hidden="true" size={14} />
        <input
          autoFocus
          ref={node => {
            if (node) inputs.current.set("title", node);
            else inputs.current.delete("title");
          }}
          value={title}
          maxLength={300}
          readOnly={busy}
          aria-label="Yeni görev adı"
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : branching ? `${id}-hint` : undefined}
          placeholder="Görev adı yaz, Enter ile ekle"
          onChange={event => {
            setTitle(event.target.value);
            setError("");
            setStatus("");
          }}
          onKeyDown={titleKey}
        />
        <button
          type="button"
          className="r2-draft-plus"
          aria-label="Yeni göreve alt görev ekle"
          disabled={busy || full}
          onClick={openFirst}
        >
          <Plus aria-hidden="true" size={14} />
        </button>
      </div>
      {branching && (
        <ul className="r2-draft-rows" aria-label="Alt görev taslağı">
          {rows.map((row, i) => (
            <li key={row.id} className="r2-draft-row" style={{ "--draft-depth": row.depth } as CSSProperties}>
              <input
                ref={node => {
                  if (node) inputs.current.set(row.id, node);
                  else inputs.current.delete(row.id);
                }}
                value={row.text}
                maxLength={300}
                readOnly={busy}
                aria-label={`${i + 1}. alt görev adı, ${row.depth}. seviye`}
                placeholder="Alt görev adı"
                onChange={event => change(editRow(rows, row.id, event.target.value, next))}
                onKeyDown={event => rowKey(event, row)}
              />
              <button
                type="button"
                className="r2-draft-plus"
                aria-label={`${row.text.trim() || `${i + 1}. satır`} altına alt görev ekle`}
                disabled={busy || full || row.depth >= draftMaxDepth}
                onClick={() => {
                  const fresh = next();
                  change(addRow(rows, fresh, row.id), fresh);
                }}
              >
                <Plus aria-hidden="true" size={14} />
              </button>
              <Menu
                className="r2-draft-menu"
                label={`${row.text.trim() || `${i + 1}. satır`} taslak işlemleri`}
                items={[
                  row.depth > 1 && {
                    label: "Bir seviye yukarı al",
                    onSelect: () => change(outdent(rows, row.id) ?? rows, row.id),
                  },
                  {
                    label: "Kaldır",
                    onSelect: () => change(removeRow(rows, row.id), rows[i - 1]?.id ?? rows[i + 1]?.id ?? "title"),
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
      {branching && (
        <div className="r2-draft-actions">
          <button type="button" className="primary" disabled={busy} onClick={() => void saveTree()}>
            {busy ? "Ekleniyor…" : "Ekle"}
          </button>
          <button type="button" disabled={busy} onClick={close}>
            Vazgeç
          </button>
          <span id={`${id}-hint`} className="r2-draft-hint muted">
            Tab alt görev yapar, Shift+Tab geri alır, Ctrl+Enter ekler.
          </span>
        </div>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="field-error">
          {error}
        </p>
      )}
      <p role="status" className="sr-only">
        {status}
      </p>
    </li>
  );
}

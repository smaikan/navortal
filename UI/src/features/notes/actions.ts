"use client";
import { useToast } from "../../components/ui/toast";
import { useSession } from "../auth/provider";
import { isOffline, offlineWrite } from "../tasks/model";
import { noteFailure, readNote, type Note } from "./model";
import { useNotesCache } from "./queries";

/** Silmede onay yok, 8 saniyelik Geri al aynı notu geri getiriyor. Hata açıkça söylenir, otomatik tekrar yok. */
export function useNoteRemoval() {
  const { session } = useSession();
  const cache = useNotesCache();
  const toast = useToast();
  async function restore(deleted: Note) {
    if (isOffline()) return toast({ text: offlineWrite, tone: "error" });
    try {
      readNote(
        await session.api
          .mutation("/api/notes/{id}/restore", "post", { path: { id: deleted.id }, body: { version: deleted.version } })
          .execute(),
      );
      cache.changed();
      toast({ text: "Not geri getirildi" });
    } catch (error) {
      cache.invalidate();
      toast({ text: noteFailure(error), tone: "error" });
    }
  }
  return async function remove(note: Note) {
    if (isOffline()) return toast({ text: offlineWrite, tone: "error" });
    try {
      const deleted = readNote(
        await session.api
          .mutation("/api/notes/{id}/delete", "post", { path: { id: note.id }, body: { version: note.version } })
          .execute(),
      );
      if (!cache.current()) return;
      cache.changed();
      toast({ text: "Not silindi", action: { label: "Geri al", run: () => restore(deleted) } });
    } catch (error) {
      if (!cache.current()) return;
      cache.invalidate();
      toast({ text: noteFailure(error), tone: "error" });
    }
  };
}

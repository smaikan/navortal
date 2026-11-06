"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../../features/auth/provider";
import { Account } from "../../../features/auth/account";
import { queryKeys } from "../../../lib/api/query-client";

/** Bu yalnız geçici test alanı, normalde kapalı. UI-05 görev özelliği değil. */
export function IsolationProbe() {
  const { session, state } = useSession();
  const tasks = useQuery({
    queryKey: queryKeys.resource(state.user!.id, "isolation-probe"),
    queryFn: ({ signal }) => session.api.read("/api/tasks", { query: { limit: 10 }, signal }),
  });
  return (
    <main id="main" className="page" tabIndex={-1}>
      <h1>Kimlik izolasyonu denemesi</h1>
      <p className="muted">Yalnız izole test ortamının gerçek verisi. Bu ekran varsayılan kapalıdır.</p>
      <Account />
      {tasks.isPending ? (
        <p role="status">Görevler okunuyor…</p>
      ) : tasks.isError ? (
        <p role="alert">Görevler alınamadı.</p>
      ) : (
        <ul aria-label="Bu hesaba ait görevler">
          {tasks.data.items.map(task => (
            <li key={task.id}>{task.title}</li>
          ))}
        </ul>
      )}
    </main>
  );
}

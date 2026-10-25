"use client";
import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createWorkspaceQueryClient } from "../../lib/api/query-client";
import { useSession } from "./provider";

/** Yalnız me doğrulandıktan sonra açılıyor. Her hesabın sorgu önbelleği ayrı. */
export function WorkspaceQueries({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const [client] = useState(createWorkspaceQueryClient);
  useEffect(() => {
    const clear = () => {
      void client.cancelQueries();
      client.clear();
    };
    const unsubscribe = session.onIdentityChange(clear);
    return () => {
      unsubscribe();
      clear();
    };
  }, [client, session]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

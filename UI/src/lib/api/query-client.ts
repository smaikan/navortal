import { QueryClient } from "@tanstack/react-query";
import { retryRead } from "./errors";

/** Bu nesne tek tarayıcı çalışma alanına ait. Hesap değişince silip yeniden kuruyoruz. */
export function createWorkspaceQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: retryRead,
        retryDelay: attempt => Math.min(500 * 2 ** attempt, 2000),
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false, networkMode: "always" },
    },
  });
}

export const queryKeys = {
  user: (userId: string) => ["user", userId] as const,
  resource: (userId: string, resource: string, filters: Readonly<Record<string, unknown>> = {}) =>
    ["user", userId, resource, filters] as const,
};

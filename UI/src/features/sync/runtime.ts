import {
  DefaultHttpClient,
  HubConnectionBuilder,
  HttpTransportType,
  HttpError,
  LogLevel,
  type HttpRequest,
} from "@microsoft/signalr";
import type { QueryClient } from "@tanstack/react-query";
import type { Session } from "../auth/session";
import { CSRF_HEADER } from "../../lib/api/client";
import type { Status } from "./model";
import { readRevision } from "../planning/revision-model";
import { changeRouter } from "./router";
import { syncEngine } from "./engine";
import { invalidateWorkspaceReads } from "../workspace/invalidation";
export function connectRealtime({
  session,
  client,
  owner,
  current,
  refresh,
  bootstrap,
  status,
}: {
  session: Session;
  client: QueryClient;
  owner: string;
  current: () => boolean;
  refresh: () => Promise<void>;
  bootstrap?: () => Promise<void>;
  status: (s: Status) => void;
}) {
  const epoch = session.getIdentity().epoch;
  const abort = new AbortController();
  const logger = { log() {} };
  class OwnerHttp extends DefaultHttpClient {
    async send(request: HttpRequest) {
      if (!current()) throw new Error("Giriş değişti.");
      const url = new URL(request.url!, location.origin);
      if (
        url.origin !== location.origin ||
        !["/api/hubs/planner", "/api/hubs/planner/negotiate"].includes(url.pathname) ||
        url.searchParams.has("access_token")
      )
        throw new Error("Bağlantı adresi kabul edilmedi.");
      try {
        // HttpOnly cookie aynı kaynak kimliğiyle gider. negotiate POST için CSRF başlığı da gerekir.
        return await super.send({
          ...request,
          withCredentials: false,
          headers: request.method === "POST" ? { ...request.headers, [CSRF_HEADER]: "1" } : request.headers,
        });
      } catch (e) {
        if (e instanceof HttpError && e.statusCode === 401 && current()) session.forget(epoch);
        throw e;
      }
    }
  }
  const router = changeRouter({
    client,
    owner,
    current,
    refresh,
    resolveRevision: async id =>
      readRevision(await session.api.read("/api/plan-revisions/{id}", { path: { id }, signal: abort.signal }), id)
        .dailyPlanId,
  });
  const engine = syncEngine({
    browser: window,
    document,
    current,
    refresh,
    bootstrap,
    signal: router.accept,
    status,
    invalidate: () => {
      void invalidateWorkspaceReads(client, owner, current);
    },
    createHub: () =>
      new HubConnectionBuilder()
        .withUrl("/api/hubs/planner", {
          withCredentials: false,
          logMessageContent: false,
          logger: LogLevel.None,
          httpClient: new OwnerHttp(logger),
          transport: HttpTransportType.WebSockets | HttpTransportType.ServerSentEvents,
          timeout: 10000,
        })
        .configureLogging(LogLevel.None)
        .withAutomaticReconnect([0, 2000, 10000, 30000])
        .build(),
  });
  const cleanup = () => {
    engine.dispose();
    router.dispose();
    abort.abort();
  };
  const unsubscribe = session.onIdentityChange(cleanup);
  return {
    retry: engine.retry,
    refresh: engine.refresh,
    dispose() {
      unsubscribe();
      cleanup();
    },
  };
}

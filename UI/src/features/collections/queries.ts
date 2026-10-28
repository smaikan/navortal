"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import {
  readResource,
  readResourcePage,
  readWorkload,
  type Resource,
  type ResourceKind,
  type ResourceQuery,
} from "./model";

type Api = ReturnType<typeof useSession>["session"]["api"];
/** Uç adreslerini açık yazıyoruz ki tipli istemci her işlemin kendi kuralını korusun. */
type Fields = { name: string; description: string | null };
export const resourceApi = {
  list: (api: Api, kind: ResourceKind, query: ResourceQuery, signal?: AbortSignal) => {
    switch (kind) {
      case "projects":
        return api.read("/api/projects", { query, signal });
      case "pools":
        return api.read("/api/pools", { query, signal });
      case "categories":
        return api.read("/api/categories", { query, signal });
      case "tags":
        return api.read("/api/tags", { query, signal });
    }
  },
  get: (api: Api, kind: ResourceKind, id: string, signal?: AbortSignal) => {
    const path = { id };
    switch (kind) {
      case "projects":
        return api.read("/api/projects/{id}", { path, signal });
      case "pools":
        return api.read("/api/pools/{id}", { path, signal });
      case "categories":
        return api.read("/api/categories/{id}", { path, signal });
      case "tags":
        return api.read("/api/tags/{id}", { path, signal });
    }
  },
  workload: (api: Api, kind: ResourceKind, id: string, signal?: AbortSignal) => {
    const path = { id };
    switch (kind) {
      case "projects":
        return api.read("/api/projects/{id}/workload", { path, signal });
      case "pools":
        return api.read("/api/pools/{id}/workload", { path, signal });
      case "categories":
        return api.read("/api/categories/{id}/workload", { path, signal });
      case "tags":
        return api.read("/api/tags/{id}/workload", { path, signal });
    }
  },
  create: (api: Api, kind: ResourceKind, body: Fields) => {
    switch (kind) {
      case "projects":
        return api.mutation("/api/projects", "post", { body }).execute();
      case "pools":
        return api.mutation("/api/pools", "post", { body }).execute();
      case "categories":
        return api.mutation("/api/categories", "post", { body }).execute();
      case "tags":
        return api.mutation("/api/tags", "post", { body }).execute();
    }
  },
  update: (api: Api, kind: ResourceKind, id: string, body: Fields & { version: number | string }) => {
    const path = { id };
    switch (kind) {
      case "projects":
        return api.mutation("/api/projects/{id}", "put", { path, body }).execute();
      case "pools":
        return api.mutation("/api/pools/{id}", "put", { path, body }).execute();
      case "categories":
        return api.mutation("/api/categories/{id}", "put", { path, body }).execute();
      case "tags":
        return api.mutation("/api/tags/{id}", "put", { path, body }).execute();
    }
  },
  archive: (api: Api, kind: ResourceKind, id: string, version: number | string) => {
    const path = { id };
    const body = { version };
    switch (kind) {
      case "projects":
        return api.mutation("/api/projects/{id}/archive", "post", { path, body }).execute();
      case "pools":
        return api.mutation("/api/pools/{id}/archive", "post", { path, body }).execute();
      case "categories":
        return api.mutation("/api/categories/{id}/archive", "post", { path, body }).execute();
      case "tags":
        return api.mutation("/api/tags/{id}/archive", "post", { path, body }).execute();
    }
  },
};
export function useResources(kind: ResourceKind, query: ResourceQuery, enabled = true, summary = false) {
  const { session, state } = useSession();
  const sent = summary ? { ...query, includeSummary: true } : query;
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "collections", { kind, ...sent }),
    enabled,
    networkMode: "always",
    queryFn: async ({ signal }) =>
      readResourcePage(await resourceApi.list(session.api, kind, sent, signal), query.offset),
  });
}
export function useResource(kind: ResourceKind, id: string, enabled = true) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "collection", { kind, id }),
    enabled,
    networkMode: "always",
    queryFn: async ({ signal }) => {
      const value = readResource(await resourceApi.get(session.api, kind, id, signal));
      if (value.id !== id) throw new Error("Kayıt kimliği uyuşmuyor.");
      return value;
    },
  });
}
export function useResourceWorkload(kind: ResourceKind, id: string) {
  const { session, state } = useSession();
  return useQuery({
    queryKey: queryKeys.resource(state.user!.id, "collection-workload", { kind, id }),
    networkMode: "always",
    queryFn: async ({ signal }) => readWorkload(await resourceApi.workload(session.api, kind, id, signal), id),
  });
}
export function useCollectionCache(kind: ResourceKind) {
  const client = useQueryClient();
  const { session, state } = useSession();
  const owner = state.user!.id;
  const epoch = session.getIdentity().epoch;
  const current = () => session.getSnapshot().user?.id === owner && session.getIdentity().epoch === epoch;
  return {
    current,
    refreshList: () =>
      current()
        ? client.invalidateQueries({ queryKey: queryKeys.resource(owner, "collections").slice(0, 3) })
        : Promise.resolve(),
    update: async (resource: Resource) => {
      if (!current()) return;
      client.setQueryData(queryKeys.resource(owner, "collection", { kind, id: resource.id }), resource);
      await Promise.all(
        ["collections", "collection-workload", "task-detail"].map(name =>
          client.invalidateQueries({ queryKey: queryKeys.resource(owner, name).slice(0, 3) }),
        ),
      );
    },
  };
}

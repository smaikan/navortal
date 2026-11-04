"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { queryKeys } from "../../lib/api/query-client";
import { readSnapshot } from "./model";

export function usePreferences() {
  const { session, state } = useSession();
  const key = queryKeys.resource(state.user!.id, "preferences");
  return useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => readSnapshot(await session.api.read("/api/preferences", { signal })),
    networkMode: "always",
  });
}

"use client";
import { useMemo } from "react";
import { useSession } from "../auth/provider";
import { useLocal, writeLocal } from "../../lib/local-preference";
import { parsePresets, type ReminderPreset } from "./presets";

/** Kısayollar kullanıcı başına bu cihazda tutulur; hızlı ekleme ve ekleme ekranı aynı listeyi okur. */
export function useReminderPresets() {
  const { state } = useSession();
  const key = `adhd.reminder-presets.v1:${state.user?.id ?? ""}`;
  const raw = useLocal(key);
  const presets = useMemo(() => parsePresets(raw), [raw]);
  return {
    presets,
    save: (next: ReminderPreset[]) => writeLocal(key, JSON.stringify(next)),
    reset: () => writeLocal(key, ""),
  };
}

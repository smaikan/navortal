"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "../auth/provider";
import { ApiError } from "../../lib/api/errors";
import { queryKeys } from "../../lib/api/query-client";
import { useDisplayPreferences, updateDisplayPreferences } from "../workspace/queries";
import { readSnapshot, type Preferences } from "./model";

export type Supports = Preferences["uiSupports"];
export const defaultSupports: Supports = {
  calmView: false,
  dayBar: true,
  calibrationHints: true,
  nudges: true,
  resumeCard: true,
  openTodayAsOneThing: false,
};
export const supportLabels: Record<keyof Supports, { label: string; hint: string }> = {
  calmView: {
    label: "Sakin görünüm",
    hint: "Sayılar, süre farkları ve animasyonlar gizlenir; her şey çalışmaya devam eder.",
  },
  dayBar: { label: "Gün çubuğu", hint: "Günün ve planın kalanını Bugün'ün üstünde gösterir." },
  calibrationHints: {
    label: "Tahmin ipuçları",
    hint: "Benzer işlerin genelde ne kadar sürdüğünü saat seçerken gösterir.",
  },
  nudges: {
    label: "Uygulama içi hatırlatmalar",
    hint: "Blok başlamadan ve süre dolunca sakin bir şerit; hiçbir şeyi durdurmaz.",
  },
  resumeCard: { label: "Nerede kalmıştım?", hint: "Uzun bir aradan sonra son çalıştığın işi gösterir." },
  openTodayAsOneThing: {
    label: "Bugün tek görevle açılsın",
    hint: "Bugün ekranı listeyi değil şimdiki tek işi gösterir.",
  },
};

/** Destekler hesap genelinde, sürüm/409 ile kaydolur. Her anahtar ayrı kaydedilir. */
export function useSupports() {
  const { session, state } = useSession();
  const client = useQueryClient();
  const prefs = useDisplayPreferences();
  const [failure, setFailure] = useState("");
  const [pending, setPending] = useState(false);
  // Anahtar tıklamayı hemen izler. Sonra kayıtlı belge veya hata sonrası okuma yerine geçer.
  const [shown, setShown] = useState<Partial<Supports>>({});
  const stored: Supports = { ...defaultSupports, ...(prefs.data?.values.uiSupports ?? {}) };
  const supports: Supports = { ...stored, ...shown };
  async function set(patch: Partial<Supports>) {
    if (!prefs.data || pending) return;
    setPending(true);
    setShown(patch);
    setFailure("");
    const key = queryKeys.resource(state.user!.id, "preferences");
    const epoch = session.getIdentity().epoch;
    try {
      // Küçük görünüm verisini tam ayar belgesi diye göndermiyoruz.
      const full = readSnapshot(await session.api.read("/api/preferences"));
      if (session.getIdentity().epoch !== epoch || session.getSnapshot().user?.id !== state.user!.id) return;
      const saved = readSnapshot(
        await session.api
          .mutation("/api/preferences", "put", {
            body: {
              version: full.version,
              values: { ...full.values, uiSupports: { ...full.values.uiSupports, ...patch } },
            },
          })
          .execute(),
      );
      if (session.getIdentity().epoch !== epoch || session.getSnapshot().user?.id !== state.user!.id) return;
      client.setQueryData(key, saved);
      await updateDisplayPreferences(client, state.user!.id, saved);
    } catch (error) {
      if (session.getIdentity().epoch !== epoch || session.getSnapshot().user?.id !== state.user!.id) return;
      setFailure(
        error instanceof ApiError && error.status === 409
          ? "Tercihler başka bir yerde değişmiş; güncel halini okudum. Seçimini yeniden yapabilirsin."
          : "Kaydedilemedi. Bağlantını kontrol edip yeniden dene.",
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: key }),
        client.invalidateQueries({ queryKey: queryKeys.resource(state.user!.id, "workspace-snapshot") }),
      ]);
    } finally {
      setShown({});
      setPending(false);
    }
  }
  return { supports, set, failure, pending, ready: !!prefs.data };
}

export function SupportsSection() {
  const { supports, set, failure, pending, ready } = useSupports();
  if (!ready) return null;
  return (
    <section className="preferences-section supports-section" aria-labelledby="supports-heading">
      <h2 id="supports-heading">Destekler</h2>
      <p className="muted">İstediğini aç ya da kapat. Hepsi isteğe bağlıdır ve planını değiştirmez.</p>
      {(Object.keys(supportLabels) as (keyof Supports)[]).map(key => (
        <label key={key} className="support-toggle">
          <input
            type="checkbox"
            checked={supports[key]}
            disabled={pending}
            onChange={e => void set({ [key]: e.target.checked })}
          />
          <span>
            {supportLabels[key].label}
            <span className="muted"> · {supportLabels[key].hint}</span>
          </span>
        </label>
      ))}
      {failure && (
        <p role="alert" className="field-error">
          {failure}
        </p>
      )}
    </section>
  );
}

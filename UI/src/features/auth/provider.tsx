"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { createSession, INITIAL_SESSION, type Session } from "./session";
import { prepareTraversalGuard } from "../../lib/navigation/traversal";
import { getRecipient, clearRecipient } from "../../../public/recipient-store.js";
import { rememberLogout } from "./logout-notice";

prepareTraversalGuard();

const Context = createContext<Session | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session] = useState(() => createSession({ storage: () => window.localStorage, onLogout: rememberLogout }));
  useEffect(() => {
    // Başlangıç doğrulanmadıysa eski push alıcısını da kapatıyoruz.
    const clearUnverified = () => {
      if (!["anonymous", "unavailable"].includes(session.getSnapshot().phase)) return;
      const epoch = session.getIdentity().epoch;
      void getRecipient()
        .then(async owner => {
          if (owner)
            await clearRecipient(
              owner,
              undefined,
              () =>
                session.getIdentity().epoch === epoch &&
                ["anonymous", "unavailable"].includes(session.getSnapshot().phase),
            );
        })
        .catch(() => {
          /* Kalıcı depolama yoksa worker hazırlayamıyoruz. */
        });
    };
    // Normal yenilemede makbuzları koruyoruz. Kesin oturumsuz veya kullanılamaz yanıtta temizliyoruz.
    const unsubscribe = session.subscribe(clearUnverified);
    clearUnverified();
    return unsubscribe;
  }, [session]);
  useEffect(() => {
    void session.initialize();
  }, [session]);
  // Yakalanmayan hatalar yalnız doğrulanmış oturumda, maskelenerek bildirilir. Modül kritik yükleme yolunun dışında.
  useEffect(() => {
    let disposed = false,
      disconnect: (() => void) | undefined;
    void import("../../lib/errors/reporter").then(module => {
      if (!disposed) disconnect = module.connectErrorReporter(session);
    });
    return () => {
      disposed = true;
      disconnect?.();
    };
  }, [session]);
  useEffect(() => {
    let disposed = false;
    let disconnect: (() => void) | undefined;
    const connect = () => {
      if (disposed || disconnect) return;
      void import("./browser-sync")
        .then(module => {
          if (!disposed && !disconnect) disconnect = module.connectBrowserSession(session);
        })
        .catch(() => {
          /* Tarayıcı yeniden çevrimiçi olduğunda bir kere deniyoruz. */
        });
    };
    connect();
    window.addEventListener("online", connect);
    return () => {
      disposed = true;
      window.removeEventListener("online", connect);
      disconnect?.();
    };
  }, [session]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, () => INITIAL_SESSION);
  return (
    <Context.Provider value={session}>
      {state.storageWarning && (
        <p className="storage-notice" role="status">
          {state.storageWarning}
        </p>
      )}
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const session = useContext(Context);
  if (!session) throw new Error("AuthProvider is required");
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, () => INITIAL_SESSION);
  return { session, state };
}

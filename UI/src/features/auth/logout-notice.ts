import type { LogoutResult } from "./session";

/** Yalnız sonuç türü saklanır, hesap veya kimlik bilgisi yoktur. */
export const OFFLINE_LOGOUT_NOTICE = "adhd.logout.offline";

export function rememberLogout(result: LogoutResult) {
  try {
    if (result.status === "unconfirmed")
      sessionStorage.setItem(OFFLINE_LOGOUT_NOTICE, result.allDevices ? "all" : "current");
    else sessionStorage.removeItem(OFFLINE_LOGOUT_NOTICE);
  } catch {
    /* Depolama kullanılamasa da özel görünüm temizlenir. */
  }
}

export function takeLogoutNotice(): "all" | "current" | null {
  try {
    const value = sessionStorage.getItem(OFFLINE_LOGOUT_NOTICE);
    sessionStorage.removeItem(OFFLINE_LOGOUT_NOTICE);
    return value === "all" ? "all" : value ? "current" : null;
  } catch {
    return null;
  }
}

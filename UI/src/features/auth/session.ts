import type { components } from "../../lib/api/generated/schema";
import { createApiClient, CSRF_HEADER, type ApiIdentity } from "../../lib/api/client";
import { ApiError } from "../../lib/api/errors";
import { anySignal } from "../../lib/compat/abort";

export type User = components["schemas"]["UserSummary"];
export type Credentials = components["schemas"]["LoginRequest"];
export type LogoutResult = Readonly<{
  status: "confirmed" | "already-ended" | "unconfirmed" | "superseded";
  allDevices: boolean;
}>;
export type GoogleConfig = Readonly<{
  enabled: boolean;
  clientId: string | null;
  nonce: string | null;
}>;
/** Oturum JavaScript'in göremediği HttpOnly cookie'de. Bu anahtar yalnız burada giriş olabilir işareti, sır içermiyor. Gereksiz me isteğini azaltıyor ve sekmelere giriş/çıkış değişikliğini duyuruyor. */
export const SESSION_MARKER_KEY = "adhd.session.v1";
/** Eski token kaydını bir kere cookie oturumuna taşımak için okuyup siliyoruz. */
export const LEGACY_TOKEN_KEY = "adhd.auth.v1";
export type TokenStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Phase = "initializing" | "anonymous" | "checking" | "unavailable" | "authenticated";
type Snapshot = Readonly<{ phase: Phase; user: User | null; storageWarning: string | null }>;
export const INITIAL_SESSION: Snapshot = { phase: "initializing", user: null, storageWarning: null };

const GOOGLE_USERCONTENT_HOST = /(?:^|\.)googleusercontent\.com$/i;

export function isValidGooglePictureUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    if (url.port !== "" && url.port !== "443") return false;
    const hostname = url.hostname.toLowerCase();
    return GOOGLE_USERCONTENT_HOST.test(hostname);
  } catch {
    return false;
  }
}

function validUser(value: unknown): value is User {
  if (!value || typeof value !== "object") return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.id === "string" &&
    user.id.length > 0 &&
    typeof user.email === "string" &&
    user.email.length > 0 &&
    typeof user.displayName === "string" &&
    (user.profileVersion === undefined ||
      (typeof user.profileVersion === "number" &&
        Number.isSafeInteger(user.profileVersion) &&
        user.profileVersion > 0)) &&
    (user.photoVersion == null ||
      (typeof user.photoVersion === "string" && /^[0-9a-f-]{36}$/i.test(user.photoVersion))) &&
    (user.googlePictureUrl === undefined ||
      user.googlePictureUrl === null ||
      (typeof user.googlePictureUrl === "string" && isValidGooglePictureUrl(user.googlePictureUrl)))
  );
}

/** Her tarayıcı kendi sağlayıcısını kullanıyor. Sunucu istekleri arasında değişebilir token veya kullanıcı nesnesi paylaşılmıyor. */
export function createSession(options: {
  storage: () => TokenStorage;
  fetch?: typeof fetch;
  online?: () => boolean;
  onLogout?: (result: LogoutResult) => void;
}) {
  let identity: ApiIdentity = { epoch: 0, active: false, verified: false };
  let snapshot = INITIAL_SESSION;
  let initialized = false;
  let verification: Promise<void> | undefined;
  let requests = new AbortController();
  let logoutPending = false;
  let authPending = false;
  const listeners = new Set<() => void>();
  const ownerCleanups = new Set<() => void>();
  const publish = (next: Snapshot) => {
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  const warning = "Bu tarayıcı giriş işaretini saklayamadı. Sayfayı kapattığında yeniden giriş yapman gerekebilir.";

  function replaceIdentity(active: boolean, storageWarning = snapshot.storageWarning) {
    identity = { epoch: identity.epoch + 1, active, verified: false };
    requests.abort();
    requests = new AbortController();
    ownerCleanups.forEach(cleanup => cleanup());
    verification = undefined;
    publish({ phase: active ? "checking" : "anonymous", user: null, storageWarning });
  }

  function forget(expectedEpoch = identity.epoch) {
    if (identity.epoch !== expectedEpoch) return;
    let storageWarning: string | null = null;
    try {
      options.storage().removeItem(SESSION_MARKER_KEY);
    } catch {
      storageWarning = "Tarayıcıdaki giriş işareti temizlenemedi. Bu cihazda tarayıcı site verilerini temizle.";
    }
    replaceIdentity(false, storageWarning);
  }

  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const api = createApiClient({
    identity: () => identity,
    onUnauthorized: forget,
    fetch: (input, init) =>
      fetcher(input, { ...init, signal: anySignal([requests.signal, ...(init?.signal ? [init.signal] : [])]) }),
    online: options.online,
  });

  function marked(): boolean | null {
    try {
      const raw = options.storage().getItem(SESSION_MARKER_KEY);
      if (!raw) return false;
      try {
        const saved: unknown = JSON.parse(raw);
        if (saved && typeof saved === "object" && "version" in saved && saved.version === 1) return true;
      } catch {
        /* Okunamayan işaret silinsin, normal akışa devam ediyoruz. */
      }
      options.storage().removeItem(SESSION_MARKER_KEY);
      return false;
    } catch {
      return null;
    }
  }

  function mark() {
    try {
      options.storage().setItem(SESSION_MARKER_KEY, JSON.stringify({ version: 1 }));
      return null;
    } catch {
      return warning;
    }
  }

  /** Eski token bir kere cookie oturumuna taşınıyor. Yalnız adopt ucuna gidiyor, başka yere gönderilmiyor. */
  async function adoptLegacy() {
    let legacy: string | null = null;
    try {
      const raw = options.storage().getItem(LEGACY_TOKEN_KEY);
      const saved: unknown = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved === "object" && "token" in saved && typeof saved.token === "string" && saved.token)
        legacy = saved.token;
      else if (raw) options.storage().removeItem(LEGACY_TOKEN_KEY);
    } catch {
      try {
        options.storage().removeItem(LEGACY_TOKEN_KEY);
      } catch {
        /* Depolama kullanılamıyor, taşınacak kayıt yok. */
      }
      return;
    }
    if (!legacy) return;
    let response: Response;
    try {
      response = await fetcher("/api/auth/session/adopt", {
        method: "POST",
        headers: { Accept: "application/json, application/problem+json", Authorization: `Bearer ${legacy}` },
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
      });
    } catch {
      // Sonuç belirsizse eski anahtarı sonraki açılışta bir kez daha denemek için tutuyoruz.
      return;
    }
    if (response.status >= 500) return;
    try {
      options.storage().removeItem(LEGACY_TOKEN_KEY);
    } catch {
      /* Sunucu bunu artık başka yerde kabul etmiyor. */
    }
    if (response.ok) mark();
  }

  function restore() {
    const present = marked();
    if (present === null) {
      publish({ ...snapshot, storageWarning: warning });
      return false;
    }
    if (snapshot.phase === "initializing" || present !== identity.active) {
      replaceIdentity(present, null);
      return true;
    }
    return false;
  }

  function verify(): Promise<void> {
    if (!identity.active) return Promise.resolve();
    if (verification) return verification;
    const epoch = identity.epoch;
    const previous = snapshot.user;
    publish({ ...snapshot, phase: "checking", user: null });
    const attempt = api
      .read("/api/auth/me")
      .then(user => {
        if (identity.epoch !== epoch) return;
        if (!validUser(user)) throw new ApiError("protocol", "Giriş bilgileri doğrulanamadı.");
        // Cookie başka hesaba geçmişse özel veri okumadan önce eski hesabın alanını temizliyoruz.
        if (previous && previous.id !== user.id) {
          replaceIdentity(true);
          return verify();
        }
        identity = { ...identity, verified: true };
        publish({ ...snapshot, phase: "authenticated", user });
      })
      .catch(error => {
        if (identity.epoch !== epoch) return;
        if (error instanceof ApiError && error.status === 401) return;
        // Ağ veya protokol hatasında işaret kalır ama özel içerik açılmaz.
        publish({ ...snapshot, phase: "unavailable", user: null });
      })
      .finally(() => {
        if (identity.epoch === epoch) verification = undefined;
      });
    verification = attempt;
    return attempt;
  }

  /** Sekme görünür olunca, odaklanınca veya geçmişten dönünce hesabı sessizce kontrol ediyoruz. 401 çıkışı istemci yapıyor. */
  function updateUser(user: User, epoch: number) {
    if (
      identity.epoch !== epoch ||
      !identity.verified ||
      !validUser(user) ||
      user.id !== snapshot.user?.id ||
      (user.profileVersion ?? 1) < (snapshot.user.profileVersion ?? 1)
    )
      return false;
    const old = snapshot.user;
    if (
      old.email !== user.email ||
      old.displayName !== user.displayName ||
      (old.profileVersion ?? 1) !== (user.profileVersion ?? 1) ||
      (old.photoVersion ?? null) !== (user.photoVersion ?? null) ||
      (old.googlePictureUrl ?? null) !== (user.googlePictureUrl ?? null)
    )
      publish({ ...snapshot, user });
    return true;
  }
  let rechecking: Promise<void> | undefined;
  function recheck() {
    // Odak ve görünürlük birlikte gelebiliyor. Tek kontrol ikisine de yetiyor.
    rechecking ??= (async () => {
      const epoch = identity.epoch;
      const owner = snapshot.user?.id;
      try {
        const user = await api.read("/api/auth/me");
        if (identity.epoch !== epoch || !validUser(user)) return;
        if (user.id === owner) {
          updateUser(user, epoch);
          return;
        }
        replaceIdentity(true);
        await verify();
      } catch {
        /* Ağ veya protokol hatası açık alanı kapatmıyor. 401 zaten temizledi. */
      } finally {
        rechecking = undefined;
      }
    })();
    return rechecking;
  }

  async function signOut(path: "/api/auth/logout" | "/api/auth/logout-all"): Promise<LogoutResult> {
    const allDevices = path === "/api/auth/logout-all";
    if (logoutPending) return { status: "unconfirmed", allDevices };
    logoutPending = true;
    const epoch = identity.epoch;
    let status: LogoutResult["status"] = !identity.active && !allDevices ? "already-ended" : "unconfirmed";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      if (identity.active) {
        const response = await fetcher(path, {
          method: "POST",
          headers: { Accept: "application/json, application/problem+json", [CSRF_HEADER]: "1" },
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          signal: anySignal([controller.signal, requests.signal]),
        });
        if (response.status === 204) status = "confirmed";
        else if (response.status === 401 && !allDevices) status = "already-ended";
      }
    } catch {
      // Sunucu iptali doğrulanmadı; yazı kendiliğinden tekrarlanmaz.
    } finally {
      clearTimeout(timeout);
      logoutPending = false;
    }
    if (identity.epoch !== epoch) return { status: "superseded", allDevices };
    const result = { status, allDevices };
    // Uyarı yönlendirmeden önce hazır olmalı; başarısız sonuçta da özel görünüm temizlenir.
    try {
      options.onLogout?.(result);
    } finally {
      forget(epoch);
    }
    return result;
  }

  return {
    api,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    getIdentity: () => identity,
    updateUser,
    onIdentityChange(cleanup: () => void) {
      ownerCleanups.add(cleanup);
      return () => {
        ownerCleanups.delete(cleanup);
      };
    },
    async initialize() {
      if (initialized) return verification;
      initialized = true;
      await adoptLegacy();
      restore();
      if (snapshot.phase === "initializing") replaceIdentity(false, warning);
      return verify();
    },
    /** reset önce yeni hesap epoch'u açıyor, iki hesabın okumaları karışmasın. verifyExisting cookie'yi yeniden kontrol ediyor; açık alan yalnız hesap değişmişse sıfırlanıyor. */
    async synchronize(verifyExisting = false, reset = false) {
      if (restore()) return verify();
      if (reset && identity.active) {
        replaceIdentity(true);
        return verify();
      }
      if (!verifyExisting) return;
      if (identity.verified) return recheck();
      await verify();
    },
    async authenticate(mode: "login" | "register", credentials: Credentials) {
      if (authPending || logoutPending)
        throw new ApiError("policy", "Giriş veya çıkış işlemi sürüyor. Birazdan yeniden dene.");
      authPending = true;
      try {
        const epoch = identity.epoch;
        const response =
          mode === "register"
            ? await api.mutation("/api/auth/session/register", "post", { body: credentials }).execute()
            : await api.mutation("/api/auth/session/login", "post", { body: credentials }).execute();
        if (identity.epoch !== epoch) throw new ApiError("identity-changed", "Giriş durumu değişti. Yeniden dene.");
        if (!validUser(response)) throw new ApiError("protocol", "Giriş yanıtı doğrulanamadı.");
        replaceIdentity(true, mark());
        await verify();
      } finally {
        authPending = false;
      }
    },
    async authenticateGoogle(idToken: string, expectedEpoch = identity.epoch) {
      if (identity.epoch !== expectedEpoch) throw new ApiError("identity-changed", "Giriş durumu değişti.");
      if (authPending || logoutPending)
        throw new ApiError("policy", "Giriş veya çıkış işlemi sürüyor. Birazdan yeniden dene.");
      authPending = true;
      try {
        const response = await api.mutation("/api/auth/session/google", "post", { body: { idToken } }).execute();
        if (identity.epoch !== expectedEpoch) throw new ApiError("identity-changed", "Giriş durumu değişti.");
        if (!validUser(response)) throw new ApiError("protocol", "Giriş yanıtı doğrulanamadı.");
        replaceIdentity(true, mark());
        await verify();
      } finally {
        authPending = false;
      }
    },
    async getGoogleConfig(signal?: AbortSignal): Promise<GoogleConfig> {
      const config = await api.read("/api/auth/google/config", { signal });
      if (
        !config ||
        typeof config.enabled !== "boolean" ||
        (config.enabled &&
          (typeof config.clientId !== "string" ||
            !config.clientId.trim() ||
            typeof config.nonce !== "string" ||
            !/^[A-Za-z0-9_-]{43}$/.test(config.nonce)))
      )
        throw new ApiError("protocol", "Google giriş ayarları doğrulanamadı.");
      return { enabled: config.enabled, clientId: config.clientId ?? null, nonce: config.nonce ?? null };
    },
    async linkGoogle(idToken: string, expectedEpoch = identity.epoch) {
      if (identity.epoch !== expectedEpoch) throw new ApiError("identity-changed", "Hesap durumu değişti.");
      if (!identity.active || !identity.verified || !snapshot.user)
        throw new ApiError("not-authenticated", "Google hesabını bağlamak için oturum açık olmalı.");
      if (authPending || logoutPending) throw new ApiError("policy", "İşlem sürüyor. Birazdan yeniden dene.");
      authPending = true;
      try {
        const owner = snapshot.user.id;
        await api.mutation("/api/auth/google/link", "post", { body: { idToken, expectedUserId: owner } }).execute();
        if (identity.epoch !== expectedEpoch || snapshot.user?.id !== owner)
          throw new ApiError("identity-changed", "Hesap durumu değişti.");
        await recheck();
      } finally {
        authPending = false;
      }
    },
    verify,
    /** Bu oturumu sunucuda kapatıyoruz. İstek hata verse bile yerel durum temizleniyor. */
    logout: () => signOut("/api/auth/logout"),
    /** Hesabın diğer cihazlardaki oturumları da kapanıyor. Push aboneliği değişmiyor. */
    logoutEverywhere: () => signOut("/api/auth/logout-all"),
    // Sunucunun zaten bitirdiği oturumda yalnız yerel çıkış yapıyoruz; 401 ve parola sıfırlama gibi.
    forget,
  };
}

export type Session = ReturnType<typeof createSession>;

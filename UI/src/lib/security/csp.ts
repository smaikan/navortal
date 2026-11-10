import { createHash, randomBytes } from "node:crypto";
import { isWorkspacePath } from "../../../public/route-paths.js";
import { basicCsp } from "../../../tools/security-headers.mjs";
import { themeBootstrap } from "../theme";

const themeHash = createHash("sha256").update(themeBootstrap).digest("base64");
const authPaths = new Set(["/login", "/register", "/forgot-password", "/reset-password"]);
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Next'in iç adresi 127.0.0.1 olabilir; localhost geliştirme adresini dar doğrulamayla koru. */
export function visiblePageURL(url: URL, host: string | null): URL {
  if (!host || !loopbackHosts.has(url.hostname)) return url;
  try {
    const candidate = new URL(`${url.protocol}//${host}`);
    if (
      loopbackHosts.has(candidate.hostname) &&
      !candidate.username &&
      !candidate.password &&
      candidate.pathname === "/" &&
      !candidate.search &&
      !candidate.hash
    )
      return candidate;
  } catch {
    /* Geçersiz Host, CSP kaynaklarını genişletemez. */
  }
  return url;
}

/** Public sayfalar statik kalır. Özel alanın Next bootstrap'ı istek başına nonce kullanır. */
export function pageSecurity(
  path: string,
  url: URL,
  development = process.env.NODE_ENV === "development",
  canonicalOrigin?: string,
) {
  if (!authPaths.has(path) && !isWorkspacePath(path)) return { policy: basicCsp, nonce: null };
  const nonce = randomBytes(24).toString("base64");
  // TLS reverse proxy arkasında iç URL farklı olsa da onaylı dış alanın WSS'i çalışır.
  const hosts = new Set([url.host]);
  if (canonicalOrigin) hosts.add(new URL(canonicalOrigin).host);
  const websocket = [...hosts].map(host => `wss://${host}`);
  if (url.protocol === "http:" && (development || loopbackHosts.has(url.hostname))) websocket.push(`ws://${url.host}`);
  const policy = [
    basicCsp,
    "default-src 'self'",
    // Sabit tema kodu hash ile ilk boyamadan önce çalışır; root layout request okumaz.
    `script-src 'self' 'nonce-${nonce}' 'sha256-${themeHash}' 'strict-dynamic' https://accounts.google.com/gsi/client${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' https://accounts.google.com/gsi/style ${development ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "style-src-attr 'unsafe-inline'",
    "frame-src 'self' https://accounts.google.com",
    "img-src 'self' data: blob: https://*.googleusercontent.com https://googleusercontent.com",
    "font-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self'",
    `connect-src 'self' ${websocket.join(" ")} https://accounts.google.com/gsi/`,
  ].join("; ");
  return { policy, nonce };
}

import { isWorkspacePath, routeChanges } from "../../../public/route-paths.js";

/** Girişten sonra yalnız uygulamanın kendi adreslerine gidebiliriz. */
export function safeReturnPath(value: string | null | undefined): string {
  const fallback = "/planning";
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value))
    return fallback;
  try {
    const url = new URL(value, "https://planner.invalid");
    const decoded = decodeURIComponent(url.pathname);
    const path = Object.hasOwn(routeChanges, url.pathname) ? routeChanges[url.pathname] : url.pathname;
    if (url.origin !== "https://planner.invalid" || /[\\\u0000-\u001f\u007f]/.test(decoded) || !isWorkspacePath(path))
      return fallback;
    return path + url.search + url.hash;
  } catch {
    return fallback;
  }
}

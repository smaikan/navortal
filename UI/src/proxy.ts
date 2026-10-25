import { routeChanges } from "../public/route-paths.js";
import { NextResponse, type NextRequest } from "next/server";
import { isIndexablePublicPath, siteSettings } from "./lib/seo";

/** Tarama başlıkları ve test alanı kapısı. Kimlik doğrulama mevcut JWT + me akışında kalır. */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/reset-password" || path === "/parola-yenile") {
    const headers = {
      "Cache-Control": "no-store, private, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    };
    // Eski sorgu sırrı RSC çizimine veya metadata'ya gitmesin. Yeni fragment bağlantısı istenir.
    if (request.nextUrl.search)
      return NextResponse.redirect(new URL("/reset-password", request.url), { status: 303, headers });
    const response =
      path === "/parola-yenile"
        ? NextResponse.redirect(new URL("/reset-password", request.url), 308)
        : NextResponse.next();
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  }
  if (Object.hasOwn(routeChanges, path)) {
    const target = request.nextUrl.clone();
    target.pathname = routeChanges[path];
    return NextResponse.redirect(target, {
      status: 308,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  }
  if (request.nextUrl.pathname.startsWith("/internal-checks") && process.env.UI_E2E_CHECKS !== "true") {
    return new NextResponse("Bu sayfa bulunamadı.", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
  const response = NextResponse.next();
  if (!siteSettings().index || !isIndexablePublicPath(request.nextUrl.pathname))
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = { matcher: ["/((?!api/|_next/).*)"] };

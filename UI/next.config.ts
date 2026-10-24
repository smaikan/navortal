import type { NextConfig } from "next";

const apiOrigin = new URL(process.env.API_ORIGIN ?? "http://127.0.0.1:5080");
if (
  !["http:", "https:"].includes(apiOrigin.protocol) ||
  apiOrigin.username ||
  apiOrigin.password ||
  apiOrigin.pathname !== "/" ||
  apiOrigin.search ||
  apiOrigin.hash
) {
  throw new Error("API_ORIGIN must be an HTTP(S) origin without a path or credentials.");
}

const config: NextConfig = {
  distDir: process.env.UI_E2E_BUILD === "true" ? ".local/next-e2e" : ".next",
  poweredByHeader: false,
  agentRules: false,
  // Yalnız bize ait E2E profil derlemesi CPU örneklerini bileşene eşler.
  productionBrowserSourceMaps: process.env.UI_E2E_BUILD === "true" && process.env.UI_E2E_PROFILE === "true",
  // Oturum çerezi tek alana bağlı; www olmayan adres ayrı bir oturum açmasın.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "navortal.com.tr" }],
        destination: "https://www.navortal.com.tr/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin.origin}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, private, max-age=0" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/planner-sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default config;

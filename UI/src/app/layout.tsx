import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "../features/auth/provider";
import { themeBootstrap } from "../lib/theme";

export const metadata: Metadata = {
  title: { default: "Navortal", template: "%s | Navortal" },
  description: "Görevlerini, günün planını ve gerçek çalışmanı bir arada yönet.",
  manifest: "/manifest.webmanifest",
  // Sayfalar ayrı ayrı izin veriyor. Özel veya bilinmeyen adreslerde güvenli varsayılan kalıyor.
  robots: { index: false, follow: false },
};

// Telefon klavyesi açılınca düzen küçülsün, paneller ve sabit düğmeler klavyenin üstünde kalsın.
export const viewport: Viewport = { width: "device-width", initialScale: 1, interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <a className="skip-link" href="#main" tabIndex={0}>
          İçeriğe geç
        </a>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

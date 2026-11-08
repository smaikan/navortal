/** Tarayıcı auth sayfalarının nonce'u yalnız istek sırasında üretilebilir. */
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}

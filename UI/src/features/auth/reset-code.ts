/** Kodu yalnız fragment'tan alıyoruz. HTTP isteğine veya RSC metadata'ya gitmiyor. */
export function readResetCode(hash: string): string | null {
  const values = new URLSearchParams(hash.replace(/^#\??/, ""));
  const tokens = values.getAll("token");
  return tokens.length === 1 && /^[A-Fa-f0-9]{64}$/.test(tokens[0]) ? tokens[0] : null;
}

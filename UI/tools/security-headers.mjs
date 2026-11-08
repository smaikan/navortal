/** UI, API rewrite ve ayrı hub proxy aynı temel başlıkları kullanır. CSP API'ye eklenmez. */
export const securityHeaders = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};
export const basicCsp = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";

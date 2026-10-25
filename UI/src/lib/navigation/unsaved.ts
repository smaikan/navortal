/** Yerel çıkış taslağı da bırakır. Bu olay hesap veya token verisi taşımaz. */
export function allowLocalLogout() {
  return window.dispatchEvent(new Event("adhd:before-local-logout", { cancelable: true }));
}

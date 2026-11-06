import type { Locator } from "@playwright/test";

/** Eklenti kurmadan veya tarayıcı ayarı değiştirmeden React'in metin düğümlerinin değiştirilmesini taklit ediyoruz. */
export async function rewriteExtensionText(target: Locator) {
  return target.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) if (node.textContent?.trim()) nodes.push(node as Text);
    for (const text of nodes) {
      const replacement = document.createElement("font");
      replacement.dataset.extensionText = "true";
      replacement.textContent = text.textContent;
      text.parentNode!.replaceChild(replacement, text);
    }
    return nodes.length;
  });
}

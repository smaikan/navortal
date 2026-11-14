/** Dokunmatik ekranda parmağı kaldırınca :hover görünümü yapışık kalıyor. :hover kuralları yalnız gerçek imleci olan cihazda geçerli. */
const hoverOnly = () => ({
  postcssPlugin: "hover-only",
  Once(root, { atRule }) {
    const insideHover = node => {
      for (let parent = node.parent; parent; parent = parent.parent)
        if (parent.type === "atrule" && (parent.name === "keyframes" || /hover\s*:\s*hover/.test(parent.params)))
          return true;
      return false;
    };
    root.walkRules(rule => {
      if (!rule.selector.includes(":hover") || insideHover(rule)) return;
      const hover = [],
        rest = [];
      for (const selector of rule.selectors)
        // :not(:hover) dokunmatik cihazda her zaman doğru; sarılırsa anlamı tersine döner.
        (/:hover/.test(selector) && !/:not\([^)]*:hover/.test(selector) ? hover : rest).push(selector);
      if (!hover.length) return;
      const media = atRule({ name: "media", params: "(hover: hover)" });
      const clone = rule.clone({ selectors: hover });
      media.append(clone);
      if (rest.length) {
        rule.selectors = rest;
        rule.after(media);
      } else rule.replaceWith(media);
    });
  },
});
hoverOnly.postcss = true;
module.exports = hoverOnly;

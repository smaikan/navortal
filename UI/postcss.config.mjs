import { fileURLToPath } from "node:url";

// Plugin dosyası mutlak yolla veriliyor; Turbopack göreli yolu kendi derleme dizininde arıyor.
const hoverOnly = fileURLToPath(new URL("./tools/postcss-hover-only.cjs", import.meta.url));
export default { plugins: { "@tailwindcss/postcss": {}, [hoverOnly]: {} } };

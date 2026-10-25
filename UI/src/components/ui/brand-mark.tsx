/** The Navortal mark. It uses the same file as the favicon, so the two can never drift apart. */
export function BrandMark({ size }: { size: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- a small static SVG needs no image optimizer
  return <img className="brand-mark" src="/icon.svg" width={size} height={size} alt="" />;
}

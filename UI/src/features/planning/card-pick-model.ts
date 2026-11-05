export type PickCard = { taskId: string; title: string; meta: string };

/** Verilen kartlardan rastgele biri. Birden çok kart varsa aynı kart arka arkaya gelmez. */
export function pickCard(cards: readonly PickCard[], current: string | null, random = Math.random) {
  const pool = cards.length > 1 ? cards.filter(card => card.taskId !== current) : cards;
  return pool[Math.floor(random() * pool.length)];
}

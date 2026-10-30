import { RARITIES, type Rarity } from "@config/game";

/** Highest rarity card of a list (first one on ties). */
export function bestCardFront<T extends { rarity: Rarity }>(
  cards: T[],
): T | undefined {
  return cards.reduce<T | undefined>(
    (best, c) =>
      !best || RARITIES.indexOf(c.rarity) > RARITIES.indexOf(best.rarity)
        ? c
        : best,
    undefined,
  );
}

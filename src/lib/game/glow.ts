import { brand } from "@config/brand";
import { gameConfig, RARITIES, type Rarity } from "@config/game";
import type { BoosterSource } from "./types";

export type GlowTier = 1 | 2 | 3;

/** Halo level of a card still hidden in the stack (one level per pair). */
export function glowTier(rarity: Rarity): GlowTier {
  return gameConfig.glowTiers[rarity];
}

/** True for the better rarity of its pair: the frame gets a shine on reveal. */
export function isUpperOfPair(rarity: Rarity): boolean {
  const tier = glowTier(rarity);
  const pair = RARITIES.filter((r) => glowTier(r) === tier);
  return pair.indexOf(rarity) === pair.length - 1;
}

/** Most cards drawn in the stack; the rest shows as "+N". */
export const MAX_STACK_EDGES = 6;

/**
 * Cards drawn in the stack while card `cursor` is on top: the top card and
 * the edges of the next ones, at most MAX_STACK_EDGES in all.
 */
export function stackLayout(count: number, cursor: number) {
  const remaining = Math.max(0, count - cursor);
  const shown = Math.min(remaining, MAX_STACK_EDGES);
  return {
    visible: Array.from({ length: shown }, (_, i) => cursor + i),
    hidden: remaining - shown,
  };
}

export type PackColorKey = keyof typeof brand.packColors;

/**
 * What the tube label shows for a source: the message key (namespace
 * included) and the label color key.
 */
export function packLabel(
  source: BoosterSource,
  pool: string,
  dailyTheme?: string | null,
): { message: string; color: PackColorKey } {
  switch (source) {
    case "daily":
      return {
        message: dailyTheme ? `dailyThemes.${dailyTheme}` : "booster.dailyPack",
        color: "daily",
      };
    case "box":
      return { message: "shop.box.name", color: "box" };
    case "qualifiers":
      return { message: "shop.qualifiers.name", color: "qualifiers" };
    default:
      return {
        message: `pools.${pool}`,
        color: pool in brand.packColors ? (pool as PackColorKey) : "default",
      };
  }
}

/**
 * Public game parameters. Single source of truth for the booster loop and the
 * currency sinks; copied into the database (public.game_config) by
 * `pnpm config:generate`, which writes supabase/seed-game-config.sql.
 *
 * Drop rates are public by design (transparency page). Provisional values,
 * to tune with scripts/simulate-economy.ts.
 */

export const RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
] as const;
export type Rarity = (typeof RARITIES)[number];

/** Probabilities in basis points (1/100 of a percent). Must sum to 10,000. */
export type RarityTable = Record<Rarity, number>;

export const gameConfig = {
  booster: {
    refillMinutes: 15,
    maxStock: 10,
    cardsPerBooster: 5,
    /** Last slot draws only from this rarity or better. */
    guaranteedSlotMinRarity: "uncommon" as Rarity,
  },

  /** Rarity draw table for every slot (the guaranteed slot renormalizes it). */
  dropRates: {
    common: 5500,
    uncommon: 2700,
    rare: 1200,
    epic: 450,
    legendary: 130,
    mythic: 20,
  } satisfies RarityTable,

  /** Aces earned for each recycled duplicate copy. */
  recycleValues: {
    common: 1,
    uncommon: 3,
    rare: 8,
    epic: 25,
    legendary: 80,
    mythic: 400,
  } satisfies RarityTable,

  /** In-game currency sink: aces -> bonus booster. Never real money. */
  acesBooster: {
    price: 100,
    dailyCap: 3,
  },
} as const;

export type GameConfig = typeof gameConfig;

/** Rows written to public.game_config (snake_case keys, JSON values). */
export function gameConfigRows(config: GameConfig = gameConfig) {
  return {
    booster: {
      refill_minutes: config.booster.refillMinutes,
      max_stock: config.booster.maxStock,
      cards_per_booster: config.booster.cardsPerBooster,
      guaranteed_slot_min_rarity: config.booster.guaranteedSlotMinRarity,
    },
    drop_rates: config.dropRates,
    recycle_values: config.recycleValues,
    aces_booster: {
      price: config.acesBooster.price,
      daily_cap: config.acesBooster.dailyCap,
    },
  };
}

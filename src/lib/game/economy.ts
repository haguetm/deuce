import { RARITIES, type GameConfig, type Rarity } from "@config/game";

/**
 * Economy model mirroring the SQL draw (supabase/migrations/*_booster_draw.sql):
 * standard slots use dropRates, the last slot the same table restricted to
 * the guaranteed rarity or better. Used by scripts/simulate-economy.ts and
 * its tests to prove that recycling duplicates can never fund boosters
 * faster than they are consumed (no free-booster loop).
 */

function slotTable(config: GameConfig, min: Rarity): [Rarity, number][] {
  const minIndex = RARITIES.indexOf(min);
  const allowed = RARITIES.filter((_, i) => i >= minIndex);
  const total = allowed.reduce((sum, r) => sum + config.dropRates[r], 0);
  return allowed.map((r) => [r, config.dropRates[r] / total]);
}

export function slotTables(config: GameConfig): [Rarity, number][][] {
  const n = config.booster.cardsPerBooster;
  return Array.from({ length: n }, (_, i) =>
    slotTable(
      config,
      i === n - 1 ? config.booster.guaranteedSlotMinRarity : "common",
    ),
  );
}

/**
 * Upper bound of aces per booster: every card is a duplicate (late game).
 * No booster can ever yield more than this on average.
 */
export function asymptoticAcesPerBooster(config: GameConfig): number {
  return slotTables(config).reduce(
    (sum, table) =>
      sum + table.reduce((s, [r, p]) => s + p * config.recycleValues[r], 0),
    0,
  );
}

/** Deterministic PRNG (mulberry32) so simulations are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type TierSizes = Record<Rarity, number>;

/** Catalogue split by percentile, as in config/rarity.json. */
export function tierSizes(
  total: number,
  percentiles: Record<Exclude<Rarity, "common">, number>,
): TierSizes {
  const sizes = {} as TierSizes;
  let remaining = total;
  for (const r of [
    "mythic",
    "legendary",
    "epic",
    "rare",
    "uncommon",
  ] as const) {
    sizes[r] = Math.min(
      Math.max(Math.round((total * percentiles[r]) / 100), 1),
      remaining,
    );
    remaining -= sizes[r];
  }
  sizes.common = remaining;
  return sizes;
}

export interface SimulationResult {
  boosters: number;
  /** Average aces earned per booster inside each window [from, to]. */
  windows: { from: number; to: number; acesPerBooster: number }[];
  maxWindowAverage: number;
  totalAces: number;
  collectionSize: number;
}

/**
 * One player opens `boosters` boosters and recycles every extra copy at once
 * (the most aggressive strategy for earning aces).
 */
export function simulatePlayer(
  config: GameConfig,
  catalogue: TierSizes,
  boosters: number,
  seed = 1,
  windowBounds = [10, 100, 1_000, 10_000, 100_000],
): SimulationResult {
  const random = mulberry32(seed);
  const tables = slotTables(config);
  const owned = new Set<string>();
  const perBooster: number[] = [];

  for (let b = 0; b < boosters; b++) {
    let aces = 0;
    for (const table of tables) {
      let u = random();
      let rarity: Rarity = table[table.length - 1][0];
      for (const [r, p] of table) {
        if (u < p) {
          rarity = r;
          break;
        }
        u -= p;
      }
      const card = `${rarity}:${Math.floor(random() * catalogue[rarity])}`;
      if (owned.has(card)) aces += config.recycleValues[rarity];
      else owned.add(card);
    }
    perBooster.push(aces);
  }

  const windows: SimulationResult["windows"] = [];
  let from = 1;
  for (const to of windowBounds.filter((t) => t <= boosters)) {
    const slice = perBooster.slice(from - 1, to);
    windows.push({
      from,
      to,
      acesPerBooster: slice.reduce((s, x) => s + x, 0) / slice.length,
    });
    from = to + 1;
  }
  return {
    boosters,
    windows,
    maxWindowAverage: Math.max(...windows.map((w) => w.acesPerBooster)),
    totalAces: perBooster.reduce((s, x) => s + x, 0),
    collectionSize: owned.size,
  };
}

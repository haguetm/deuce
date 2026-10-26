import { RARITIES, type GameConfig, type Rarity } from "@config/game";

/**
 * Economy model mirroring the SQL draw (supabase/migrations/*_booster_draw.sql
 * and *_booster_progression.sql): standard slots use dropRates, the last slot
 * the same table restricted to the guaranteed rarity or better (better still
 * in a golden booster), and the top-rarity guarantee forces a mythic card
 * after mythicPity.pityAt - 1 boosters without one. Used by
 * scripts/simulate-economy.ts and its tests to prove that recycling
 * duplicates can never fund boosters faster than they are consumed (no
 * free-booster loop), and that the fixed daily rewards (streak, quests)
 * cannot fund an aces booster on their own.
 */

/**
 * Ledger credit reasons modeled by this simulation. When SQL code starts
 * crediting aces for a new reason, tests/unit/economy-sources.test.ts fails
 * until the model below covers it and this list is updated.
 */
export const SIMULATED_ACE_SOURCES: readonly string[] = [
  "recycle",
  "login_streak",
  "quest",
  "achievement",
];

export function slotTable(
  config: GameConfig,
  min: Rarity,
  max: Rarity = "mythic",
): [Rarity, number][] {
  const minIndex = RARITIES.indexOf(min);
  const maxIndex = RARITIES.indexOf(max);
  const allowed = RARITIES.filter((_, i) => i >= minIndex && i <= maxIndex);
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

function tableValue(config: GameConfig, table: [Rarity, number][]): number {
  return table.reduce((s, [r, p]) => s + p * config.recycleValues[r], 0);
}

/** Last slot of a golden booster. */
export function goldenSlotTable(config: GameConfig): [Rarity, number][] {
  const n = RARITIES.indexOf(config.booster.guaranteedSlotMinRarity);
  const g = RARITIES.indexOf(config.goldenBooster.minRarity);
  return slotTable(config, RARITIES[Math.max(n, g)]);
}

/**
 * Long-run share of golden boosters: chance p per booster, guaranteed at the
 * N-th booster without one. Mean interval = (1 - (1 - p)^N) / p.
 */
export function goldenRate(config: GameConfig): number {
  const p = config.goldenBooster.chanceBp / 10_000;
  const n = config.goldenBooster.pityAt;
  if (p === 0) return 1 / n;
  return p / (1 - (1 - p) ** n);
}

/**
 * Upper bound of aces per booster: every card is a duplicate (late game).
 * No booster can ever yield more than this on average. The top-rarity
 * guarantee adds at most one mythic card every mythicPity.pityAt boosters.
 */
export function asymptoticAcesPerBooster(config: GameConfig): number {
  const tables = slotTables(config);
  const g = goldenRate(config);
  const standard = tables
    .slice(0, -1)
    .reduce((sum, table) => sum + tableValue(config, table), 0);
  const last =
    (1 - g) * tableValue(config, tables.at(-1)!) +
    g * tableValue(config, goldenSlotTable(config));
  return (
    standard + last + config.recycleValues.mythic / config.mythicPity.pityAt
  );
}

/** Same bound for a shop format (box, qualifiers), compared to its price. */
export function formatAcesCeiling(
  config: GameConfig,
  format: keyof GameConfig["shop"],
): number {
  if (format === "box") {
    const { cards, guaranteedSlotMinRarity } = config.shop.box;
    return (
      (cards - 1) * tableValue(config, slotTable(config, "common")) +
      tableValue(config, slotTable(config, guaranteedSlotMinRarity))
    );
  }
  const { cards, maxRarity } = config.shop.qualifiers;
  return cards * tableValue(config, slotTable(config, "common", maxRarity));
}

/**
 * Most aces a player can earn per day without opening anything for them:
 * average login streak reward plus the best possible draw of daily quests.
 */
export function dailyFixedAces(config: GameConfig): number {
  const streak =
    config.loginStreak.rewards.reduce((s, r) => s + r, 0) /
    config.loginStreak.rewards.length;
  const quests = [...config.dailyQuests.pool]
    .map((q) => q.reward)
    .sort((a, b) => b - a)
    .slice(0, config.dailyQuests.perDay)
    .reduce((s, r) => s + r, 0);
  return streak + quests;
}

/** One-off aces: welcome quests and every achievement. */
export function oneOffAces(config: GameConfig): number {
  return [...config.welcomeQuests, ...config.achievements].reduce(
    (s, q) => s + q.reward,
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
  const golden = goldenSlotTable(config);
  const owned = new Set<string>();
  const perBooster: number[] = [];
  let goldenCounter = 0;
  let mythicCounter = 0;

  for (let b = 0; b < boosters; b++) {
    let aces = 0;
    const isGolden =
      goldenCounter + 1 >= config.goldenBooster.pityAt ||
      random() * 10_000 < config.goldenBooster.chanceBp;
    const forceMythic = mythicCounter + 1 >= config.mythicPity.pityAt;
    let gotMythic = false;
    goldenCounter = isGolden ? 0 : goldenCounter + 1;
    for (const [slot, standard] of tables.entries()) {
      const last = slot === tables.length - 1;
      const table = last && isGolden ? golden : standard;
      let u = random();
      let rarity: Rarity = table[table.length - 1][0];
      for (const [r, p] of table) {
        if (u < p) {
          rarity = r;
          break;
        }
        u -= p;
      }
      if (last && forceMythic) rarity = "mythic";
      if (rarity === "mythic") gotMythic = true;
      const card = `${rarity}:${Math.floor(random() * catalogue[rarity])}`;
      if (owned.has(card)) aces += config.recycleValues[rarity];
      else owned.add(card);
    }
    mythicCounter = gotMythic ? 0 : mythicCounter + 1;
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

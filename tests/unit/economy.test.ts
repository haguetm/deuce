import { describe, expect, it } from "vitest";
import { RARITIES, gameConfig } from "@config/game";
import rarity from "../../config/rarity.json";
import {
  asymptoticAcesPerBooster,
  dailyFixedAces,
  formatAcesCeiling,
  goldenRate,
  goldenSlotTable,
  oneOffAces,
  simulatePlayer,
  slotTables,
  tierSizes,
} from "@/lib/game/economy";

const catalogue = tierSizes(4000, rarity.tiers_by_percentile);

describe("game config", () => {
  it("drop rates sum to 100 %", () => {
    expect(RARITIES.reduce((s, r) => s + gameConfig.dropRates[r], 0)).toBe(
      10_000,
    );
  });

  it("recycle values grow with rarity", () => {
    const values = RARITIES.map((r) => gameConfig.recycleValues[r]);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  it("slot tables are normalized and the last slot excludes commons", () => {
    const tables = slotTables(gameConfig);
    for (const table of tables) {
      expect(table.reduce((s, [, p]) => s + p, 0)).toBeCloseTo(1, 12);
    }
    expect(tables.at(-1)!.some(([r]) => r === "common")).toBe(false);
  });
});

describe("economy: no free-booster loop", () => {
  it("even in the late game, recycling yields well under half the aces booster price", () => {
    expect(asymptoticAcesPerBooster(gameConfig)).toBeLessThan(
      gameConfig.acesBooster.price / 2,
    );
  });

  it("simulated players never average more than the ceiling", () => {
    for (const seed of [1, 2, 3]) {
      const result = simulatePlayer(gameConfig, catalogue, 20_000, seed);
      expect(result.maxWindowAverage).toBeLessThan(
        gameConfig.acesBooster.price / 2,
      );
      expect(result.maxWindowAverage).toBeLessThanOrEqual(
        asymptoticAcesPerBooster(gameConfig) * 1.05,
      );
    }
  });

  it("duplicates become frequent: income rises over time toward the ceiling", () => {
    const { windows } = simulatePlayer(gameConfig, catalogue, 20_000, 7);
    expect(windows[0].acesPerBooster).toBeLessThan(
      windows.at(-1)!.acesPerBooster,
    );
  });
});

describe("economy: golden boosters, guarantees, fixed rewards and shop", () => {
  it("golden boosters come about once every 20 boosters", () => {
    const rate = goldenRate(gameConfig);
    expect(1 / rate).toBeGreaterThan(15);
    expect(1 / rate).toBeLessThan(gameConfig.goldenBooster.pityAt);
  });

  it("the golden booster has a non-zero chance and a guarantee", () => {
    expect(gameConfig.goldenBooster.chanceBp).toBeGreaterThan(0);
    expect(gameConfig.goldenBooster.pityAt).toBeGreaterThan(10);
  });

  it("the golden last slot excludes the lower rarities", () => {
    const tables = slotTables(gameConfig);
    expect(goldenSlotTable(gameConfig).length).toBeLessThan(
      tables.at(-1)!.length,
    );
  });

  it("fixed daily rewards cannot fund an aces booster on their own", () => {
    expect(dailyFixedAces(gameConfig)).toBeLessThan(
      gameConfig.acesBooster.price,
    );
  });

  it("shop formats recycle for well under their price", () => {
    expect(formatAcesCeiling(gameConfig, "box")).toBeLessThan(
      gameConfig.shop.box.price / 2,
    );
    expect(formatAcesCeiling(gameConfig, "qualifiers")).toBeLessThan(
      gameConfig.shop.qualifiers.price / 2,
    );
  });

  it("one-off rewards stay modest", () => {
    expect(oneOffAces(gameConfig)).toBeLessThan(
      40 * gameConfig.acesBooster.price,
    );
  });
});

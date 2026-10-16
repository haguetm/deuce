import { describe, expect, it } from "vitest";
import { RARITIES, gameConfig } from "@config/game";
import rarity from "../../config/rarity.json";
import {
  asymptoticAcesPerBooster,
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

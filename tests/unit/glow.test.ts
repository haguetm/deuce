import { describe, expect, it } from "vitest";
import { brand } from "@config/brand";
import { gameConfig, RARITIES } from "@config/game";
import {
  glowTier,
  isUpperOfPair,
  MAX_STACK_EDGES,
  packLabel,
  stackLayout,
} from "@/lib/game/glow";
import { BOOSTER_SOURCES } from "@/lib/game/types";
import fr from "../../messages/fr.json";

describe("glow tiers", () => {
  it("cover the 6 rarities with 3 levels of exactly 2 rarities", () => {
    const counts = [1, 2, 3].map(
      (tier) => RARITIES.filter((r) => glowTier(r) === tier).length,
    );
    expect(counts).toEqual([2, 2, 2]);
  });

  it("never go down as rarity goes up", () => {
    const tiers = RARITIES.map(glowTier);
    expect([...tiers].sort()).toEqual(tiers);
  });

  it("mark the better rarity of each pair", () => {
    expect(RARITIES.filter(isUpperOfPair)).toEqual([
      "uncommon",
      "epic",
      "mythic",
    ]);
  });
});

describe("stack layout", () => {
  it("shows every card of a 5-card booster, then fewer", () => {
    expect(stackLayout(5, 0)).toEqual({ visible: [0, 1, 2, 3, 4], hidden: 0 });
    expect(stackLayout(5, 3)).toEqual({ visible: [3, 4], hidden: 0 });
    expect(stackLayout(5, 5)).toEqual({ visible: [], hidden: 0 });
  });

  it("caps a 20-card box and counts the rest", () => {
    const layout = stackLayout(20, 0);
    expect(layout.visible).toHaveLength(MAX_STACK_EDGES);
    expect(layout.hidden).toBe(20 - MAX_STACK_EDGES);
    expect(stackLayout(20, 17)).toEqual({ visible: [17, 18, 19], hidden: 0 });
  });
});

describe("tube label", () => {
  const has = (key: string) =>
    key
      .split(".")
      .reduce<unknown>(
        (o, k) =>
          o && typeof o === "object"
            ? (o as Record<string, unknown>)[k]
            : undefined,
        fr,
      ) !== undefined;

  it("every pool has a label text and a color (its own or the default)", () => {
    for (const pool of Object.keys(gameConfig.pools)) {
      const label = packLabel("free", pool);
      expect(has(label.message), label.message).toBe(true);
      expect(brand.packColors[label.color]).toBeDefined();
    }
  });

  it("every source has a label text", () => {
    for (const source of BOOSTER_SOURCES) {
      expect(has(packLabel(source, "all", "lefties").message)).toBe(true);
    }
    expect(packLabel("daily", "all", null).message).toBe("booster.dailyPack");
  });

  it("an unknown pool falls back to the default color", () => {
    expect(packLabel("free", "future-pool").color).toBe("default");
  });
});

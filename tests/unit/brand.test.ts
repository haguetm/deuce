import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { brand } from "@config/brand";
import { gameConfig } from "@config/game";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("brand config", () => {
  it("defines valid hex colors", () => {
    const all = {
      ...brand.colors,
      ...brand.rarityColors,
      ...brand.packColors,
      ...brand.glowColors,
      ...brand.tube,
    };
    for (const value of Object.values(all)) {
      expect(value).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("has a halo color for each glow tier", () => {
    for (const tier of new Set(Object.values(gameConfig.glowTiers))) {
      expect(brand.glowColors[tier]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("is the only place where the brand name and hex colors appear in src/", () => {
    const offenders = walk(path.resolve(__dirname, "../../src"))
      .filter((f) => /\.(tsx?|css)$/.test(f))
      .filter((f) => {
        const content = readFileSync(f, "utf8");
        return (
          /#[0-9A-F]{6}\b/i.test(content) ||
          content.includes(brand.name) ||
          content.includes(brand.wordmark)
        );
      });
    expect(offenders).toEqual([]);
  });
});

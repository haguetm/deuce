import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RARITIES } from "@config/game";
import { fictionalPlayers } from "@/lib/dev/fictional-players";

const ROOT = path.resolve(__dirname, "../..");

describe("fictional dev players", () => {
  const players = fictionalPlayers();

  it("generates about a hundred unique, deterministic players", () => {
    expect(players).toHaveLength(100);
    expect(new Set(players.map((p) => p.slug)).size).toBe(100);
    expect(new Set(players.map((p) => p.wikidataId)).size).toBe(100);
    expect(fictionalPlayers()).toEqual(players);
  });

  it("covers every rarity tier so boosters can be opened", () => {
    for (const rarity of RARITIES) {
      expect(
        players.some((p) => p.rarity === rarity),
        rarity,
      ).toBe(true);
    }
  });

  it("has plausible values", () => {
    for (const p of players) {
      expect(p.countryCode).toMatch(/^[A-Z]{2}$/);
      expect(p.heightCm).toBeGreaterThanOrEqual(160);
      expect(p.heightCm).toBeLessThanOrEqual(205);
      expect(p.stats.best_rank).toBeGreaterThanOrEqual(1);
      expect(p.stats.grand_slam_finals).toBeGreaterThanOrEqual(
        p.stats.grand_slam_titles,
      );
      expect(p.slug.startsWith("dev-")).toBe(true);
    }
  });
});

describe("dev seed never reaches production", () => {
  it("is not part of any migration or production seed", () => {
    const migrations = readdirSync(path.join(ROOT, "supabase/migrations"))
      .map((f) =>
        readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"),
      )
      .join("\n");
    expect(migrations).not.toMatch(
      /is_dev_seed\)?\s*values|,\s*true\)\s*--\s*dev/i,
    );
    expect(migrations).not.toContain("fictional-players");

    const config = readFileSync(
      path.join(ROOT, "supabase/config.toml"),
      "utf8",
    );
    const seeds = config.match(/sql_paths = \[(.*)\]/)?.[1] ?? "";
    expect(seeds).not.toMatch(/dev/i);
    for (const seed of ["seed.sql", "seed-game-config.sql"]) {
      expect(
        readFileSync(path.join(ROOT, "supabase", seed), "utf8"),
      ).not.toMatch(/is_dev_seed|dev_seed/);
    }
  });
});

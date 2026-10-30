import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderGameConfigSeed } from "@/lib/game/config-seed";

describe("generated game config seed", () => {
  it("is up to date with config/game.ts (run pnpm config:generate)", () => {
    const committed = readFileSync(
      path.resolve(__dirname, "../../supabase/seed-game-config.sql"),
      "utf8",
    );
    expect(committed).toBe(renderGameConfigSeed());
  });
});

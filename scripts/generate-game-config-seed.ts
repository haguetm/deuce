/**
 * Writes supabase/seed-game-config.sql from config/game.ts.
 *   pnpm config:generate
 * Local: loaded by `supabase db reset` (config.toml seed paths).
 * Production: apply the file with psql after changing config/game.ts.
 * A unit test fails if the committed file is out of date.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { renderGameConfigSeed } from "../src/lib/game/config-seed";

const target = path.resolve(__dirname, "../supabase/seed-game-config.sql");
writeFileSync(target, renderGameConfigSeed());
console.log(`written ${path.relative(process.cwd(), target)}`);
